import { memo, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { useApp, useWorkspace } from '@/app/store'
import { renderMarkdown } from '@/lib/markdown'
import { dirname, isSafePath, joinPath, normalizePath } from '@/lib/path'
import { cx } from '@/components/ui'

interface MarkdownViewProps {
  markdown: string
  /** Path of the page (for relative links/images and link proximity). */
  from?: string
  className?: string
  onToggleTask?: (index: number) => void
  /** Content not from the vault (AI answers): remote media is not loaded. */
  untrusted?: boolean
}

const objectUrls = new Map<string, string>()

/** Rendered, sanitized Markdown with app navigation for wiki links, tags and vault images. */
export const MarkdownView = memo(function MarkdownView({
  markdown,
  from,
  className,
  onToggleTask,
  untrusted,
}: MarkdownViewProps) {
  const ws = useWorkspace()
  const { openPage, navigate } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () =>
      renderMarkdown(markdown, {
        resolveLink: (target) => ws.resolveLink(target, from),
        ...(untrusted ? { untrusted } : {}),
      }),
    // ws.version: re-render when pages appear/disappear (missing links)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markdown, from, ws, ws.version, untrusted],
  )

  // Vault images (relative paths) are loaded through the vault and shown as blob URLs.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
      const src = img.getAttribute('src') ?? ''
      if (/^(https?:|data:|blob:)/i.test(src)) continue
      let decoded: string
      try {
        decoded = decodeURIComponent(src)
      } catch {
        continue
      }
      const path = normalizePath(
        decoded.startsWith('/') ? decoded : joinPath(from ? dirname(from) : '', decoded),
      )
      if (!isSafePath(path)) continue
      const cached = objectUrls.get(path)
      if (cached) {
        img.src = cached
        continue
      }
      void ws.vault
        .readBinary(path)
        .then((data) => {
          const type = path.endsWith('.svg') ? 'image/svg+xml' : undefined
          const url = URL.createObjectURL(new Blob([data as BlobPart], type ? { type } : {}))
          objectUrls.set(path, url)
          img.src = url
        })
        .catch(() => img.classList.add('opacity-40'))
    }
  }, [html, from, ws])

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const checkbox = target.closest<HTMLInputElement>('input.task-checkbox')
    if (checkbox) {
      e.preventDefault()
      e.stopPropagation()
      onToggleTask?.(Number(checkbox.dataset.taskIndex))
      return
    }
    const link = target.closest<HTMLAnchorElement>('a')
    if (!link) return
    if (link.classList.contains('wikilink')) {
      e.preventDefault()
      e.stopPropagation()
      const resolved = ws.resolveLink(link.dataset.target ?? '', from)
      if (resolved) openPage(resolved)
      else {
        const title = link.dataset.target ?? ''
        void ws.createPage({ folder: from ? dirname(from) : '', title }).then(openPage)
      }
    } else if (link.classList.contains('tag')) {
      e.preventDefault()
      e.stopPropagation()
      navigate({ name: 'tag', tag: link.dataset.tag ?? '' })
    } else {
      e.stopPropagation()
    }
  }

  return (
    <div
      ref={ref}
      className={cx('md', className)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
