import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { PDFDocumentProxy } from '@/lib/pdfjs'
import { t } from '@/i18n'
import { IconButton } from '@/components/ui'

interface Hit {
  page: number
  /** Text around the hit for the list. */
  snippet: string
}

/** Text of every page (once per document). */
const texts = new WeakMap<PDFDocumentProxy, Promise<string[]>>()
function pageTexts(doc: PDFDocumentProxy): Promise<string[]> {
  let pending = texts.get(doc)
  if (!pending) {
    pending = (async () => {
      const out: string[] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const content = await (await doc.getPage(n)).getTextContent()
        out.push(content.items.map((i) => ('str' in i ? i.str : '')).join(' '))
      }
      return out
    })()
    texts.set(doc, pending)
  }
  return pending
}

/** Marks the hit in the page's text layer once it is rendered. */
function markOnPage(page: number, query: string) {
  const tryMark = (attempt: number) => {
    document.querySelectorAll('.pdf-search-hit').forEach((el) => el.classList.remove('pdf-search-hit'))
    const spans = Array.from(document.querySelectorAll<HTMLElement>(`[data-page="${page}"] .textLayer span`))
    const hit = spans.find((s) => s.textContent?.toLowerCase().includes(query.toLowerCase()))
    if (hit) {
      hit.classList.add('pdf-search-hit')
      hit.scrollIntoView({ block: 'center' })
    } else if (attempt < 10) setTimeout(() => tryMark(attempt + 1), 150)
  }
  setTimeout(() => tryMark(0), 250)
}

/** Search in the PDF (⌘F): hits per page, Enter / ↓ next, ⇧Enter / ↑ previous – jumps there. */
export function PdfSearch({
  doc,
  onJump,
  onClose,
}: {
  doc: PDFDocumentProxy
  onJump: (page: number) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [index, setIndex] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return
    let cancelled = false
    void pageTexts(doc).then((pages) => {
      if (cancelled) return
      const found: Hit[] = []
      pages.forEach((text, i) => {
        const lower = text.toLowerCase()
        for (let at = lower.indexOf(q); at >= 0 && found.length < 500; at = lower.indexOf(q, at + q.length))
          found.push({ page: i + 1, snippet: text.slice(Math.max(0, at - 30), at + q.length + 30) })
      })
      setHits(found)
      setIndex(0)
      if (found[0]) {
        onJump(found[0].page)
        markOnPage(found[0].page, q)
      }
    })
    return () => {
      cancelled = true
    }
  }, [query, doc, onJump])
  const go = (step: number) => {
    if (!hits.length) return
    const next = (index + step + hits.length) % hits.length
    setIndex(next)
    onJump(hits[next]!.page)
    markOnPage(hits[next]!.page, query.trim())
  }
  const shown = query.trim().length < 2 ? [] : hits
  return (
    <div
      role="search"
      className="flex items-center gap-1 border-b border-line bg-surface px-3 py-1.5 text-sm"
    >
      <input
        ref={input}
        aria-label={t('viewer.search')}
        placeholder={t('viewer.searchPlaceholder')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'ArrowDown') {
            e.preventDefault()
            go(e.shiftKey ? -1 : 1)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            go(-1)
          } else if (e.key === 'Escape') onClose()
        }}
        className="h-7 min-w-0 flex-1 rounded-control border border-line bg-paper px-2 focus:border-accent focus:outline-none"
      />
      <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums" role="status">
        {query.trim().length < 2
          ? ''
          : shown.length
            ? t('viewer.searchHits', { n: index + 1, total: shown.length, page: shown[index]!.page })
            : t('viewer.searchNone')}
      </span>
      <IconButton size="sm" label={t('viewer.searchPrev')} onClick={() => go(-1)} disabled={!shown.length}>
        <ChevronUp size={14} />
      </IconButton>
      <IconButton size="sm" label={t('viewer.searchNext')} onClick={() => go(1)} disabled={!shown.length}>
        <ChevronDown size={14} />
      </IconButton>
      <IconButton size="sm" label={t('common.close')} onClick={onClose}>
        <X size={14} />
      </IconButton>
    </div>
  )
}
