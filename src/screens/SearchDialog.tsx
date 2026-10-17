import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { FilePlus, FileText, Search } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { ensurePdfIndex, usePdfSearch } from '@/app/pdfIndex'
import { t } from '@/i18n'
import { cx, Dialog } from '@/components/ui'
import { PageIcon } from '@/components/layout/PageIcon'

/** ⌘K: full-text search (pages, then the text of the PDFs) + quick switcher + "create page". */
export function SearchDialog() {
  const ws = useWorkspace()
  const { setSearch, openPage, navigate } = useApp()
  const actions = usePageActions(ws)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  // The PDFs' text: up to date when searching (new scripts are read in the background).
  useEffect(() => void ensurePdfIndex(ws).catch(() => undefined), [ws])
  const pdfVersion = usePdfSearch((s) => s.version)
  const indexing = usePdfSearch((s) => s.indexing)

  const results = useMemo(() => {
    if (!query.trim()) {
      return ws
        .all()
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 8)
        .map((p) => ({ path: p.path, title: p.title, snippet: p.path.slice(0, -3) }))
    }
    return ws.search(query, 20)
  }, [ws, query])
  const pdfHits = useMemo(
    () => (query.trim() ? usePdfSearch.getState().search.search(query, 15) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pdfVersion: the index grew
    [query, pdfVersion],
  )
  const canCreate =
    query.trim().length > 0 && !results.some((r) => r.title.toLowerCase() === query.trim().toLowerCase())
  const count = results.length + pdfHits.length + (canCreate ? 1 : 0)

  const choose = (index: number) => {
    const hit = results[index]
    const pdf = pdfHits[index - results.length]
    if (hit) openPage(hit.path)
    else if (pdf) navigate({ name: 'file', path: pdf.path, page: pdf.page })
    else if (canCreate) void actions.createPage('', query.trim())
    setSearch(false)
  }

  const row = (i: number, key: string, icon: ReactNode, title: ReactNode, snippet?: string) => (
    <li key={key} role="option" aria-selected={i === active}>
      <button
        type="button"
        onMouseEnter={() => setActive(i)}
        onClick={() => choose(i)}
        className={cx(
          'flex w-full items-start gap-3 rounded-control px-3 py-2 text-left',
          i === active && 'bg-hover',
        )}
      >
        <span className="mt-0.5">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{title}</span>
          {snippet && <span className="block truncate text-[13px] text-ink-3">{snippet}</span>}
        </span>
      </button>
    </li>
  )

  return (
    <Dialog
      open
      onClose={() => setSearch(false)}
      title={t('search.title')}
      hideTitle
      size="lg"
      position="top"
      closeLabel={t('common.close')}
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search size={17} className="text-ink-3" />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results"
          aria-label={t('search.placeholder')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(
                (a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(count, 1)) % Math.max(count, 1),
              )
            } else if (e.key === 'Enter') {
              e.preventDefault()
              choose(active)
            }
          }}
          className="h-14 flex-1 bg-transparent text-[16px] outline-none placeholder:text-ink-3"
        />
      </div>
      <ul id="search-results" role="listbox" className="max-h-[55vh] overflow-auto p-2">
        {results.map((hit, i) =>
          row(i, hit.path, <PageIcon page={ws.get(hit.path) ?? null} />, hit.title, hit.snippet),
        )}
        {pdfHits.length > 0 && (
          <li role="presentation" className="px-3 pt-3 pb-1 text-[12px] font-semibold text-ink-3">
            {t('pdfSearch.section')}
          </li>
        )}
        {pdfHits.map((hit, i) =>
          row(
            results.length + i,
            `${hit.path}#${hit.page}`,
            <FileText size={16} className="text-ink-3" />,
            <>
              {hit.path.slice(hit.path.lastIndexOf('/') + 1)}
              <span className="ml-2 font-normal text-ink-3">{t('pdfSearch.page', { page: hit.page })}</span>
            </>,
            hit.snippet,
          ),
        )}
        {canCreate && (
          <li role="option" aria-selected={active === count - 1}>
            <button
              type="button"
              onMouseEnter={() => setActive(count - 1)}
              onClick={() => choose(count - 1)}
              className={cx(
                'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-ink-2',
                active === count - 1 && 'bg-hover',
              )}
            >
              <FilePlus size={16} /> {t('search.create', { title: query.trim() })}
            </button>
          </li>
        )}
        {query.trim() && results.length === 0 && pdfHits.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-3">{t('search.noResults', { query })}</li>
        )}
      </ul>
      <p className="flex border-t border-line px-4 py-2 text-xs text-ink-3">
        <span className="flex-1">{t('search.hint')}</span>
        {indexing && <span data-testid="pdf-indexing">{t('pdfSearch.reading')}</span>}
      </p>
    </Dialog>
  )
}
