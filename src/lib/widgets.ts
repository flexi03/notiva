/**
 * Widgets live in fenced code blocks so the Markdown stays readable in any editor:
 *
 * ```notiva
 * type: tiles
 * tiles:
 *   - { type: stat, title: Notenschnitt, source: Module, aggregation: weightedAvg, property: Note, weight: ECTS }
 *   - { type: progress, title: ECTS, source: Module, property: ECTS, goal: 180 }
 * ```
 *
 * Parsing is defensive (files are untrusted); computing is pure given a Workspace.
 */
import { parse } from 'yaml'
import {
  AGGREGATIONS,
  aggregate,
  applyFilters,
  applySorts,
  formatValue,
  propertyDef,
  TITLE,
  type Aggregation,
  type Filter,
  type ResolvedRow,
  type Sort,
} from './database'
import { addDays, daysBetween, parseDate, startOfDay, toIsoDate } from './dates'
import { sanitizeData, type FrontmatterValue } from './frontmatter'
import type { FormulaValue } from './formula'
import type { Workspace } from './workspace'
import { resolveTermPlaceholder } from './study/terms'

export const TILE_TYPES = ['stat', 'progress', 'countdown', 'list', 'link', 'text', 'week'] as const
export type TileType = (typeof TILE_TYPES)[number]

export interface TileSpec {
  type: TileType
  title?: string
  icon?: string
  /** Database reference (title, link or path). */
  source?: string
  aggregation?: Aggregation
  property?: string
  weight?: string
  filter?: Filter[]
  sort?: Sort[]
  goal?: number
  unit?: string
  decimals?: number
  dateProperty?: string
  limit?: number
  /** list: property shown next to each entry */
  show?: string
  /** link */
  page?: string
  description?: string
  /** text (Markdown) */
  text?: string
  /** week */
  start?: string
  end?: string
  /** grid span 1–4 */
  span?: number
  color?: string
}

export type WidgetSpec =
  | { type: 'tiles'; columns?: number; tiles: TileSpec[] }
  | { type: 'view'; source: string; view?: string; limit?: number; filter?: Filter[] }
  /** Everything linked to the page, grouped by database (module page: courses, notes, exams …). */
  | { type: 'related' }
  /** PDFs with own highlights/notes, newest first. */
  | { type: 'annotated' }
  /** Moodle courses that belong to no module (orientation, faculty news …), from the last fetch. */
  | { type: 'moodle-courses' }

export interface WidgetParseResult {
  widget: WidgetSpec | null
  error?: string
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

function parseFilters(v: unknown): Filter[] | undefined {
  if (!Array.isArray(v)) return undefined
  const list = v
    .filter(isObject)
    .filter((f) => str(f.property))
    .map((f) => ({
      property: str(f.property)!,
      op: (str(f.op) ?? 'eq') as Filter['op'],
      ...(f.value !== undefined ? { value: f.value as FrontmatterValue } : {}),
    }))
  return list.length ? list : undefined
}

function parseSorts(v: unknown): Sort[] | undefined {
  if (!Array.isArray(v)) return undefined
  const list = v
    .filter(isObject)
    .filter((s) => str(s.property))
    .map((s) => ({
      property: str(s.property)!,
      direction: s.direction === 'desc' ? ('desc' as const) : ('asc' as const),
    }))
  return list.length ? list : undefined
}

function parseTile(raw: unknown): TileSpec | null {
  if (!isObject(raw)) return null
  const type = str(raw.type)
  if (!type || !(TILE_TYPES as readonly string[]).includes(type)) return null
  const tile: TileSpec = { type: type as TileType }
  for (const key of [
    'title',
    'icon',
    'source',
    'property',
    'weight',
    'unit',
    'dateProperty',
    'show',
    'page',
    'description',
    'text',
    'start',
    'end',
    'color',
  ] as const) {
    const value = str(raw[key])
    if (value !== undefined) tile[key] = value
  }
  const agg = str(raw.aggregation)
  if (agg && (AGGREGATIONS as readonly string[]).includes(agg)) tile.aggregation = agg as Aggregation
  for (const key of ['goal', 'decimals', 'limit', 'span'] as const) {
    const value = num(raw[key])
    if (value !== undefined) tile[key] = value
  }
  const filter = parseFilters(raw.filter)
  if (filter) tile.filter = filter
  const sort = parseSorts(raw.sort)
  if (sort) tile.sort = sort
  return tile
}

export function parseWidget(source: string): WidgetParseResult {
  let raw: unknown
  try {
    raw = parse(source, { schema: 'core', maxAliasCount: 20 })
  } catch (error) {
    return { widget: null, error: (error as Error).message }
  }
  if (!isObject(raw))
    return { widget: null, error: 'Widget braucht „type: tiles“, „type: view“ oder „type: related“' }
  const data = sanitizeData(raw)
  if (data.type === 'tiles') {
    const tiles = (Array.isArray(data.tiles) ? data.tiles : [])
      .map(parseTile)
      .filter((t): t is TileSpec => t !== null)
    const columns = num(data.columns)
    return {
      widget: {
        type: 'tiles',
        tiles,
        ...(columns ? { columns: Math.max(1, Math.min(6, Math.round(columns))) } : {}),
      },
    }
  }
  if (data.type === 'view') {
    const src = str(data.source)
    if (!src) return { widget: null, error: '„source“ fehlt' }
    const filter = parseFilters(data.filter)
    const view = str(data.view)
    const limit = num(data.limit)
    return {
      widget: {
        type: 'view',
        source: src,
        ...(view ? { view } : {}),
        ...(limit ? { limit } : {}),
        ...(filter ? { filter } : {}),
      },
    }
  }
  if (data.type === 'related') return { widget: { type: 'related' } }
  if (data.type === 'annotated') return { widget: { type: 'annotated' } }
  if (data.type === 'moodle-courses') return { widget: { type: 'moodle-courses' } }
  return { widget: null, error: `Unbekannter Widget-Typ: ${String(data.type)}` }
}

/** Extracts the YAML inside a ```notiva fence. */
export function widgetSource(blockText: string): string {
  return blockText.replace(/^```notiva[^\n]*\n?/, '').replace(/\n?```\s*$/, '')
}

export interface WidgetLocation {
  /** Offsets of the whole fenced block in the body. */
  start: number
  end: number
  yaml: string
}

/** All top-level ```notiva blocks of a Markdown body, in order. */
export function findWidgets(body: string): WidgetLocation[] {
  const found: WidgetLocation[] = []
  const fence = /^```notiva[^\n]*\n([\s\S]*?)^```[ \t]*$/gm
  for (let m = fence.exec(body); m; m = fence.exec(body)) {
    found.push({ start: m.index, end: m.index + m[0].length, yaml: (m[1] ?? '').replace(/\n$/, '') })
  }
  return found
}

export function widgetBlock(yaml: string): string {
  return `\`\`\`notiva\n${yaml.trimEnd()}\n\`\`\``
}

/* ---------- computing ---------- */

/**
 * Replaces relative values in filters: dates ("today", "today+7") and semesters ("@semester",
 * "@nextSemester", "@lastSemester" → "WiSe 26/27").
 */
export function resolveFilterDates(filters: Filter[] | undefined, now: Date): Filter[] | undefined {
  return filters?.map((f) => {
    if (typeof f.value !== 'string') return f
    const match = /^today([+-]\d+)?$/i.exec(f.value.trim())
    if (match) return { ...f, value: toIsoDate(addDays(now, Number(match[1] ?? 0))) }
    const term = resolveTermPlaceholder(f.value, now)
    return term ? { ...f, value: term } : f
  })
}

export type TileResult =
  | { kind: 'value'; value: string; raw: FormulaValue; caption?: string }
  | { kind: 'progress'; value: number; goal: number; percent: number; label: string }
  | { kind: 'countdown'; days: number | null; label: string; date?: string; path?: string }
  | { kind: 'list'; items: Array<{ path: string; title: string; detail: string }>; total: number }
  | { kind: 'link'; path: string | null; title: string; description?: string; icon?: string }
  | { kind: 'text'; text: string }
  | { kind: 'week'; week: number; total: number | null; label: string }
  | { kind: 'error'; message: string }

function rowsFor(
  ws: Workspace,
  tile: TileSpec,
  from: string | undefined,
  now: Date,
): { rows: ResolvedRow[]; dbPath: string } | string {
  if (!tile.source) return 'Keine Datenbank angegeben (source)'
  const db = ws.findDatabase(tile.source, from)
  if (!db?.database) return `Datenbank „${tile.source}“ nicht gefunden`
  const rows = applyFilters(
    ws.resolvedRows(db.path, now),
    resolveFilterDates(tile.filter, now),
    db.database,
    now,
  )
  return { rows, dbPath: db.path }
}

export function computeTile(ws: Workspace, tile: TileSpec, from?: string, now = new Date()): TileResult {
  switch (tile.type) {
    case 'link': {
      const path = tile.page ? ws.resolveLink(tile.page.replace(/^\[\[|\]\]$/g, ''), from) : null
      const page = path ? ws.get(path) : undefined
      return {
        kind: 'link',
        path,
        title: tile.title ?? page?.title ?? tile.page ?? '',
        ...(tile.description ? { description: tile.description } : {}),
        ...((tile.icon ?? page?.icon) ? { icon: (tile.icon ?? page?.icon)! } : {}),
      }
    }
    case 'text':
      return { kind: 'text', text: tile.text ?? '' }
    case 'week': {
      const start = tile.start ? parseDate(tile.start) : null
      if (!start) return { kind: 'error', message: '„start“ (Datum) fehlt' }
      const end = tile.end ? parseDate(tile.end) : null
      const week = Math.floor(daysBetween(start, now) / 7) + 1
      const total = end ? Math.floor(daysBetween(start, end) / 7) + 1 : null
      const label =
        week < 1
          ? `beginnt in ${-daysBetween(start, now)} Tagen`
          : total && week > total
            ? 'vorbei'
            : `Woche ${week}${total ? ` von ${total}` : ''}`
      return { kind: 'week', week, total, label }
    }
    default:
      break
  }
  const found = rowsFor(ws, tile, from, now)
  if (typeof found === 'string') return { kind: 'error', message: found }
  const { rows, dbPath } = found
  const def = ws.get(dbPath)!.database!
  const values = rows.map((r) => r.values)
  switch (tile.type) {
    case 'stat': {
      const property = tile.property ?? TITLE
      const raw = aggregate(values, tile.aggregation ?? 'count', property, tile.weight)
      const pd = propertyDef(def, property)
      const formatted =
        typeof raw === 'number'
          ? formatValue(
              {
                ...(pd ?? { name: property, type: 'number' }),
                ...(tile.decimals !== undefined ? { decimals: tile.decimals } : {}),
              },
              raw,
            )
          : raw === null
            ? '–'
            : formatValue(pd, raw)
      return {
        kind: 'value',
        value: `${formatted}${tile.unit && raw !== null ? ` ${tile.unit}` : ''}`,
        raw,
        caption: `${rows.length} Einträge`,
      }
    }
    case 'progress': {
      const value = Number(
        aggregate(values, tile.aggregation ?? 'sum', tile.property ?? TITLE, tile.weight) ?? 0,
      )
      const goal = tile.goal && tile.goal > 0 ? tile.goal : 100
      const percent = Math.max(0, Math.min(100, Math.round((value / goal) * 100)))
      const fmt = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 })
      return {
        kind: 'progress',
        value,
        goal,
        percent,
        label: `${fmt(value)} / ${fmt(goal)}${tile.unit ? ` ${tile.unit}` : ''}`,
      }
    }
    case 'countdown': {
      const prop = tile.dateProperty ?? def.properties.find((p) => p.type === 'date')?.name
      if (!prop) return { kind: 'error', message: 'Keine Datums-Eigenschaft' }
      const today = startOfDay(now)
      const next = rows
        .map((r) => ({
          r,
          d: typeof r.values[prop] === 'string' ? parseDate(r.values[prop] as string) : null,
        }))
        .filter((x): x is { r: ResolvedRow; d: Date } => x.d !== null && x.d >= today)
        .sort((a, b) => a.d.getTime() - b.d.getTime())[0]
      if (!next) return { kind: 'countdown', days: null, label: 'Nichts geplant' }
      return {
        kind: 'countdown',
        days: daysBetween(now, next.d),
        label: next.r.row.title,
        date: toIsoDate(next.d),
        path: next.r.row.path,
      }
    }
    case 'list': {
      const sorted = applySorts(rows, tile.sort, def)
      const limit = tile.limit ?? 5
      const pd = tile.show ? propertyDef(def, tile.show) : undefined
      return {
        kind: 'list',
        total: rows.length,
        items: sorted.slice(0, limit).map((r) => ({
          path: r.row.path,
          title: r.row.title,
          detail: tile.show ? formatValue(pd, r.values[tile.show]) : '',
        })),
      }
    }
  }
}
