import { useMemo, useState } from 'react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import {
  applyFilters,
  applySorts,
  propertyDef,
  TITLE,
  toStoredValue,
  type DatabaseDef,
  type Filter,
  type PropertyDef,
  type ResolvedRow,
  type ViewDef,
} from '@/lib/database'
import type { FrontmatterData } from '@/lib/frontmatter'
import type { FormulaValue } from '@/lib/formula'
import { resolveFilterDates } from '@/lib/widgets'

const VIEW_KEY = (path: string) => `notiva.view.${path}`

/** Everything a database view needs: definition, active view, filtered rows and write helpers. */
export function useDatabase(
  dbPath: string,
  options: { viewName?: string; extraFilter?: Filter[]; limit?: number } = {},
) {
  const ws = useWorkspace()
  const run = useAction()
  const openPage = useApp((s) => s.openPage)
  const page = ws.get(dbPath)
  const def: DatabaseDef | null = page?.database ?? null
  const [viewIndex, setViewIndexState] = useState(() => {
    const byName = options.viewName ? (def?.views.findIndex((v) => v.name === options.viewName) ?? -1) : -1
    if (byName >= 0) return byName
    try {
      return Number(localStorage.getItem(VIEW_KEY(dbPath)) ?? 0) || 0
    } catch {
      return 0
    }
  })
  const views = useMemo(() => def?.views ?? [], [def])
  const index = Math.min(viewIndex, Math.max(0, views.length - 1))
  const view: ViewDef = useMemo(
    () => views[index] ?? { name: t('view.table'), type: 'table' },
    [views, index],
  )

  const now = useMemo(() => new Date(), [])
  const allRows = useMemo(
    () => (def ? ws.resolvedRows(dbPath, now) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ws, ws.version, dbPath, def, now],
  )
  const rows: ResolvedRow[] = useMemo(() => {
    if (!def) return []
    const filters = [...(view.filter ?? []), ...(options.extraFilter ?? [])]
    const sorted = applySorts(
      applyFilters(allRows, resolveFilterDates(filters, now), def, now),
      view.sort,
      def,
    )
    return options.limit ? sorted.slice(0, options.limit) : sorted
  }, [allRows, def, view, options.extraFilter, options.limit, now])

  const visible: PropertyDef[] = useMemo(() => {
    if (!def) return []
    const names = view.properties ?? def.properties.map((p) => p.name)
    return names
      .map((n) => def.properties.find((p) => p.name === n))
      .filter((p): p is PropertyDef => p !== undefined)
  }, [def, view.properties])

  const setViewIndex = (i: number) => {
    setViewIndexState(i)
    try {
      localStorage.setItem(VIEW_KEY(dbPath), String(i))
    } catch {
      /* per-device convenience */
    }
  }

  return {
    ws,
    page,
    def,
    view,
    viewIndex: index,
    views,
    rows,
    allRows,
    visible,
    setViewIndex,
    updateView: (patch: Partial<ViewDef> | ((v: ViewDef) => ViewDef)) =>
      run(() =>
        ws.updateDatabase(dbPath, (d) => {
          const current = d.views[index] ?? view
          d.views[index] = typeof patch === 'function' ? patch(current) : { ...current, ...patch }
          if (d.views.length === 0) d.views.push(d.views[index]!)
          return d
        }),
      ),
    updateDef: (update: (d: DatabaseDef) => DatabaseDef) => run(() => ws.updateDatabase(dbPath, update)),
    async addRow(values: FrontmatterData = {}, open = false) {
      const prefilled = { ...defaultsFromFilters(view.filter, def), ...values }
      const path = await run(() => ws.createRow(dbPath, t('page.untitled'), prefilled))
      if (path && open) openPage(path)
      return path
    },
    setValue(rowPath: string, property: string, value: FormulaValue) {
      if (!def) return Promise.resolve(undefined)
      if (property === TITLE) return run(() => ws.rename(rowPath, String(value || t('page.untitled'))))
      const prop = propertyDef(def, property)
      if (!prop) return Promise.resolve(undefined)
      const stored = toStoredValue(prop, value)
      const empty = stored === null || stored === '' || (Array.isArray(stored) && stored.length === 0)
      return run(() => ws.setProperty(rowPath, property, empty ? undefined : stored))
    },
    openRow: openPage,
    deleteRow: (rowPath: string) => run(() => ws.trash(rowPath)),
  }
}

export type DatabaseApi = ReturnType<typeof useDatabase>

/** New rows inherit simple "is" filters of the view, so they stay visible. */
function defaultsFromFilters(filters: Filter[] | undefined, def: DatabaseDef | null): FrontmatterData {
  const out: FrontmatterData = {}
  for (const f of filters ?? []) {
    const prop = def?.properties.find((p) => p.name === f.property)
    if (!prop || f.value === undefined || Array.isArray(f.value)) continue
    if (f.op === 'eq' && (prop.type === 'select' || prop.type === 'text')) out[prop.name] = f.value
    if (f.op === 'checked') out[prop.name] = true
  }
  return out
}
