import { useMemo, useState } from 'react'
import { FilePlus, Search } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import { cx, Dialog } from '@/components/ui'
import { PageIcon } from '@/components/layout/PageIcon'

/** ⌘K: full-text search + quick switcher + "create page". */
export function SearchDialog() {
  const ws = useWorkspace()
  const { setSearch, openPage } = useApp()
  const actions = usePageActions(ws)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

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
  const canCreate =
    query.trim().length > 0 && !results.some((r) => r.title.toLowerCase() === query.trim().toLowerCase())
  const count = results.length + (canCreate ? 1 : 0)

  const choose = (index: number) => {
    const hit = results[index]
    if (hit) openPage(hit.path)
    else if (canCreate) void actions.createPage('', query.trim())
    setSearch(false)
  }

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
        {results.map((hit, i) => {
          const page = ws.get(hit.path) ?? null
          return (
            <li key={hit.path} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(i)}
                className={cx(
                  'flex w-full items-start gap-3 rounded-control px-3 py-2 text-left',
                  i === active && 'bg-hover',
                )}
              >
                <span className="mt-0.5">
                  <PageIcon page={page} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{hit.title}</span>
                  {hit.snippet && (
                    <span className="block truncate text-[13px] text-ink-3">{hit.snippet}</span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
        {canCreate && (
          <li role="option" aria-selected={active === results.length}>
            <button
              type="button"
              onMouseEnter={() => setActive(results.length)}
              onClick={() => choose(results.length)}
              className={cx(
                'flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-ink-2',
                active === results.length && 'bg-hover',
              )}
            >
              <FilePlus size={16} /> {t('search.create', { title: query.trim() })}
            </button>
          </li>
        )}
        {query.trim() && results.length === 0 && (
          <li className="px-3 py-2 text-sm text-ink-3">{t('search.noResults', { query })}</li>
        )}
      </ul>
      <p className="border-t border-line px-4 py-2 text-xs text-ink-3">{t('search.hint')}</p>
    </Dialog>
  )
}
