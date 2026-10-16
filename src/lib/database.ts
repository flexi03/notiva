/**
 * Databases: a page whose frontmatter contains `database:` (schema + views).
 * Rows are the Markdown files in the sibling folder with the same name:
 *
 *   Studium/Module.md        ← database page (schema, views, description)
 *   Studium/Module/Analysis.md  ← row, values in frontmatter
 *
 * Everything here is pure: callers pass rows and a relation resolver.
 */
import type { FrontmatterData, FrontmatterValue } from './frontmatter'
import { evaluateFormula, toNumber, toText, type FormulaValue } from './formula'
import { parseDate } from './dates'
import { parseWikiLink } from './links'

export const PROPERTY_TYPES = [
  'text',
  'number',
  'select',
  'multiSelect',
  'date',
  'checkbox',
  'url',
  'email',
  'formula',
  'relation',
  'rollup',
] as const
export type PropertyType = (typeof PROPERTY_TYPES)[number]

export const COLORS = ['gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'] as const
export type Color = (typeof COLORS)[number]

export interface SelectOption {
  value: string
  color: Color
}

export const AGGREGATIONS = [
  'count',
  'countNotEmpty',
  'countEmpty',
  'sum',
  'avg',
  'min',
  'max',
  'weightedAvg',
  'percentChecked',
  'earliest',
  'latest',
] as const
export type Aggregation = (typeof AGGREGATIONS)[number]

export interface PropertyDef {
  name: string
  type: PropertyType
  options?: SelectOption[]
  /** formula */
  formula?: string
  /** relation: path of the target database page */
  database?: string
  /** rollup */
  relation?: string
  property?: string
  aggregation?: Aggregation
  /** number display */
  format?: 'number' | 'percent' | 'euro'
  decimals?: number
}

export const VIEW_TYPES = ['table', 'board', 'gallery', 'list', 'calendar'] as const
export type ViewType = (typeof VIEW_TYPES)[number]

export const FILTER_OPS = [
  'eq',
  'neq',
  'contains',
  'notContains',
  'gt',
  'gte',
  'lt',
  'lte',
  'empty',
  'notEmpty',
  'checked',
  'unchecked',
  'before',
  'after',
  'pastDays',
  'nextDays',
] as const
export type FilterOp = (typeof FILTER_OPS)[number]

export interface Filter {
  property: string
  op: FilterOp
  value?: FrontmatterValue
}

export interface Sort {
  property: string
  direction: 'asc' | 'desc'
}

export interface ViewDef {
  name: string
  type: ViewType
  filter?: Filter[]
  sort?: Sort[]
  groupBy?: string
  /** calendar: date property */
  dateProperty?: string
  /** visible properties in order (default: all) */
  properties?: string[]
  /** gallery: property or "content" used as cover */
  cover?: string
}

export interface DatabaseDef {
  properties: PropertyDef[]
  views: ViewDef[]
  /** Folder (relative to the database page's folder) holding the rows. Defaults to the page name. */
  folder?: string
  /** Template body for new rows. */
  rowTemplate?: string
}

/** Implicit title property every database has. */
export const TITLE = 'Name'

export interface Row {
  path: string
  title: string
  data: FrontmatterData
  body: string
  mtime: number
}

export type RowValues = Record<string, FormulaValue>

/* ---------- parsing (files are untrusted input) ---------- */

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : fallback
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined)

export function parseDatabaseDef(raw: unknown): DatabaseDef | null {
  if (!isObject(raw)) return null
  const properties: PropertyDef[] = []
  const seen = new Set<string>([TITLE.toLowerCase()])
  for (const p of Array.isArray(raw.properties) ? raw.properties : []) {
    if (!isObject(p) || !str(p.name) || seen.has(String(p.name).toLowerCase())) continue
    seen.add(String(p.name).toLowerCase())
    const def: PropertyDef = { name: String(p.name).trim(), type: oneOf(PROPERTY_TYPES, p.type, 'text') }
    if (Array.isArray(p.options)) {
      def.options = p.options
        .map((o, i) =>
          typeof o === 'string'
            ? { value: o, color: COLORS[i % COLORS.length]! }
            : isObject(o) && str(o.value)
              ? { value: String(o.value), color: oneOf(COLORS, o.color, COLORS[i % COLORS.length]!) }
              : null,
        )
        .filter((o): o is SelectOption => o !== null)
    }
    if (str(p.formula)) def.formula = String(p.formula)
    if (str(p.database)) def.database = String(p.database)
    if (str(p.relation)) def.relation = String(p.relation)
    if (str(p.property)) def.property = String(p.property)
    if (p.aggregation !== undefined) def.aggregation = oneOf(AGGREGATIONS, p.aggregation, 'count')
    if (p.format !== undefined) def.format = oneOf(['number', 'percent', 'euro'] as const, p.format, 'number')
    if (typeof p.decimals === 'number') def.decimals = Math.max(0, Math.min(6, Math.round(p.decimals)))
    properties.push(def)
  }
  const views: ViewDef[] = []
  for (const v of Array.isArray(raw.views) ? raw.views : []) {
    if (!isObject(v)) continue
    const view: ViewDef = {
      name: str(v.name) ?? `Ansicht ${views.length + 1}`,
      type: oneOf(VIEW_TYPES, v.type, 'table'),
    }
    const filters = Array.isArray(v.filter)
      ? v.filter.map(parseFilter).filter((f): f is Filter => f !== null)
      : []
    if (filters.length) view.filter = filters
    const sorts = Array.isArray(v.sort)
      ? v.sort
          .filter(isObject)
          .filter((s) => str(s.property))
          .map((s) => ({
            property: String(s.property),
            direction: s.direction === 'desc' ? ('desc' as const) : ('asc' as const),
          }))
      : []
    if (sorts.length) view.sort = sorts
    if (str(v.groupBy)) view.groupBy = String(v.groupBy)
    if (str(v.dateProperty)) view.dateProperty = String(v.dateProperty)
    if (str(v.cover)) view.cover = String(v.cover)
    if (Array.isArray(v.properties))
      view.properties = v.properties.filter((x): x is string => typeof x === 'string')
    views.push(view)
  }
  if (views.length === 0) views.push({ name: 'Tabelle', type: 'table' })
  const def: DatabaseDef = { properties, views }
  if (str(raw.folder)) def.folder = String(raw.folder)
  if (str(raw.rowTemplate)) def.rowTemplate = String(raw.rowTemplate)
  return def
}

function parseFilter(f: unknown): Filter | null {
  if (!isObject(f) || !str(f.property)) return null
  const filter: Filter = { property: String(f.property), op: oneOf(FILTER_OPS, f.op, 'eq') }
  if (f.value !== undefined) filter.value = f.value as FrontmatterValue
  return filter
}

/** Serializable form for frontmatter (drops undefined fields). */
export function serializeDatabaseDef(def: DatabaseDef): FrontmatterData {
  return JSON.parse(JSON.stringify(def)) as FrontmatterData
}

/* ---------- values ---------- */

export interface ValueContext {
  now?: Date
  /** Resolves a relation link ("[[Analysis]]") to a row of another database. */
  resolveRow?: (link: string) => { row: Row; def: DatabaseDef } | null
  /** Prevents infinite recursion through relation/rollup cycles. */
  depth?: number
}

/** Extracts link targets from a relation value ("[[A]]", ["[[A]]", "B"]). */
export function relationTargets(value: FrontmatterValue | undefined): string[] {
  const list = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value]
  return list
    .map((v) => String(toText(v as FormulaValue) ?? '').trim())
    .filter(Boolean)
    .map((v) => {
      const match = /^\[\[([^\]]+)\]\]$/.exec(v)
      return match ? parseWikiLink(match[1]!).target : v
    })
}

/** Raw stored value coerced to the property's type. */
export function coerceValue(def: PropertyDef, raw: FrontmatterValue | undefined): FormulaValue {
  if (raw === undefined || raw === null)
    return def.type === 'checkbox' ? false : def.type === 'multiSelect' ? [] : null
  switch (def.type) {
    case 'number': {
      const n = toNumber(raw as FormulaValue)
      return Number.isNaN(n) ? null : n
    }
    case 'checkbox':
      return raw === true || raw === 'true' || raw === 'x' || raw === 1
    case 'multiSelect':
      return (Array.isArray(raw) ? raw : String(raw).split(','))
        .map((v) => String(toText(v as FormulaValue) ?? '').trim())
        .filter(Boolean)
    case 'relation':
      return relationTargets(raw)
    case 'date':
      return typeof raw === 'string' && parseDate(raw) ? raw : null
    default:
      return Array.isArray(raw)
        ? raw.map((v) => toText(v as FormulaValue)).join(', ')
        : toText(raw as FormulaValue)
  }
}

/** All property values of a row, including formulas and rollups. */
export function rowValues(row: Row, def: DatabaseDef, ctx: ValueContext = {}): RowValues {
  const values: RowValues = { [TITLE]: row.title }
  for (const p of def.properties) {
    if (p.type !== 'formula' && p.type !== 'rollup') values[p.name] = coerceValue(p, row.data[p.name])
  }
  for (const p of def.properties) {
    if (p.type === 'rollup') values[p.name] = rollupValue(p, values, def, ctx)
  }
  // Formulas may reference each other; evaluate in schema order.
  for (const p of def.properties) {
    if (p.type === 'formula')
      values[p.name] = evaluateFormula(p.formula ?? '', { props: values, now: ctx.now }).value
  }
  return values
}

function rollupValue(p: PropertyDef, values: RowValues, def: DatabaseDef, ctx: ValueContext): FormulaValue {
  const depth = ctx.depth ?? 0
  if (!p.relation || !ctx.resolveRow || depth > 2) return null
  const relation = def.properties.find((x) => x.name === p.relation && x.type === 'relation')
  if (!relation) return null
  const targets = (values[relation.name] as string[] | null) ?? []
  const related = targets
    .map((t) => ctx.resolveRow!(t))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map(({ row, def: targetDef }) => rowValues(row, targetDef, { ...ctx, depth: depth + 1 }))
  return aggregate(related, p.aggregation ?? 'count', p.property ?? TITLE)
}

export function propertyDef(def: DatabaseDef, name: string): PropertyDef | undefined {
  if (name === TITLE) return { name: TITLE, type: 'text' }
  return def.properties.find((p) => p.name === name)
}

/* ---------- filter / sort / group ---------- */

const isEmptyValue = (v: FormulaValue | undefined) =>
  v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)

function compareValues(
  a: FormulaValue | undefined,
  b: FormulaValue | undefined,
  type: PropertyType | undefined,
): number {
  if (isEmptyValue(a) && isEmptyValue(b)) return 0
  if (isEmptyValue(a)) return 1 // empty values always last
  if (isEmptyValue(b)) return -1
  if (type === 'date') return (parseDate(String(a))?.getTime() ?? 0) - (parseDate(String(b))?.getTime() ?? 0)
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b)
  const na = Number(a)
  const nb = Number(b)
  if (
    typeof a === 'string' &&
    typeof b === 'string' &&
    a.trim() &&
    b.trim() &&
    !Number.isNaN(na) &&
    !Number.isNaN(nb)
  )
    return na - nb
  return toText(a as FormulaValue).localeCompare(toText(b as FormulaValue), 'de', {
    numeric: true,
    sensitivity: 'base',
  })
}

export function matchesFilter(
  values: RowValues,
  filter: Filter,
  def: DatabaseDef,
  now = new Date(),
): boolean {
  const value = values[filter.property]
  const type = propertyDef(def, filter.property)?.type
  const target = filter.value as FormulaValue | undefined
  const text = (v: FormulaValue | undefined) => toText((v ?? null) as FormulaValue).toLowerCase()
  const listContains = (v: FormulaValue | undefined, t: FormulaValue | undefined) =>
    Array.isArray(v) ? v.some((x) => text(x) === text(t)) : text(v).includes(text(t))
  switch (filter.op) {
    case 'empty':
      return isEmptyValue(value)
    case 'notEmpty':
      return !isEmptyValue(value)
    case 'checked':
      return value === true
    case 'unchecked':
      return value !== true
    case 'eq':
      if (Array.isArray(target))
        return target.some((t) => (Array.isArray(value) ? listContains(value, t) : text(value) === text(t)))
      return Array.isArray(value)
        ? listContains(value, target)
        : compareValues(value, target, type) === 0 && !isEmptyValue(value)
    case 'neq':
      if (Array.isArray(target))
        return !target.some((t) => (Array.isArray(value) ? listContains(value, t) : text(value) === text(t)))
      return Array.isArray(value)
        ? !listContains(value, target)
        : isEmptyValue(value) || compareValues(value, target, type) !== 0
    case 'contains':
      return listContains(value, target)
    case 'notContains':
      return !listContains(value, target)
    case 'gt':
    case 'after':
      return !isEmptyValue(value) && compareValues(value, target, type) > 0
    case 'gte':
      return !isEmptyValue(value) && compareValues(value, target, type) >= 0
    case 'lt':
    case 'before':
      return !isEmptyValue(value) && compareValues(value, target, type) < 0
    case 'lte':
      return !isEmptyValue(value) && compareValues(value, target, type) <= 0
    case 'nextDays':
    case 'pastDays': {
      const date = typeof value === 'string' ? parseDate(value) : null
      if (!date) return false
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      const diff = Math.round(
        (new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime() - today) / 86_400_000,
      )
      const n = toNumber((target ?? 7) as FormulaValue)
      return filter.op === 'nextDays' ? diff >= 0 && diff <= n : diff <= 0 && diff >= -n
    }
  }
}

export interface ResolvedRow {
  row: Row
  values: RowValues
}

export function applyFilters(
  rows: ResolvedRow[],
  filters: Filter[] | undefined,
  def: DatabaseDef,
  now?: Date,
): ResolvedRow[] {
  if (!filters?.length) return rows
  return rows.filter((r) => filters.every((f) => matchesFilter(r.values, f, def, now)))
}

export function applySorts(rows: ResolvedRow[], sorts: Sort[] | undefined, def: DatabaseDef): ResolvedRow[] {
  const list = sorts?.length ? sorts : [{ property: TITLE, direction: 'asc' as const }]
  return rows.slice().sort((a, b) => {
    for (const s of list) {
      const type = propertyDef(def, s.property)?.type
      const va = a.values[s.property]
      const vb = b.values[s.property]
      let result = compareValues(va, vb, type)
      // Empty values stay last regardless of direction.
      if (s.direction === 'desc' && !isEmptyValue(va) && !isEmptyValue(vb)) result = -result
      if (result !== 0) return result
    }
    return 0
  })
}

export interface Group {
  key: string
  label: string
  color?: Color
  rows: ResolvedRow[]
}

export const NO_VALUE = '__none__'

/** Groups rows by a property. Select options keep their schema order; empty values go to "no value". */
export function groupRows(rows: ResolvedRow[], property: string, def: DatabaseDef): Group[] {
  const prop = propertyDef(def, property)
  const groups = new Map<string, Group>()
  for (const option of prop?.options ?? [])
    groups.set(option.value, { key: option.value, label: option.value, color: option.color, rows: [] })
  if (prop?.type === 'checkbox') {
    groups.set('true', { key: 'true', label: '✓', rows: [] })
    groups.set('false', { key: 'false', label: '–', rows: [] })
  }
  for (const r of rows) {
    const value = r.values[property]
    const keys = Array.isArray(value)
      ? value.length
        ? value.map((v) => toText(v))
        : [NO_VALUE]
      : [isEmptyValue(value) ? NO_VALUE : toText(value ?? null)]
    for (const key of keys) {
      if (!groups.has(key)) groups.set(key, { key, label: key === NO_VALUE ? '' : key, rows: [] })
      groups.get(key)!.rows.push(r)
    }
  }
  const none = groups.get(NO_VALUE)
  groups.delete(NO_VALUE)
  const list = [...groups.values()]
  if (none) list.push(none)
  return list
}

/* ---------- aggregation ---------- */

export function aggregate(
  values: RowValues[],
  fn: Aggregation,
  property: string,
  weightProperty?: string,
): FormulaValue {
  const column = values.map((v) => v[property])
  const numbers = column
    .map((v) => (v === null || v === undefined || v === '' ? NaN : toNumber(v)))
    .filter((n) => !Number.isNaN(n))
  switch (fn) {
    case 'count':
      return values.length
    case 'countNotEmpty':
      return column.filter((v) => !isEmptyValue(v)).length
    case 'countEmpty':
      return column.filter((v) => isEmptyValue(v)).length
    case 'sum':
      return round(numbers.reduce((s, n) => s + n, 0))
    case 'avg':
      return numbers.length ? round(numbers.reduce((s, n) => s + n, 0) / numbers.length) : null
    case 'min':
      return numbers.length ? Math.min(...numbers) : null
    case 'max':
      return numbers.length ? Math.max(...numbers) : null
    case 'weightedAvg': {
      let total = 0
      let weights = 0
      for (const v of values) {
        const x = v[property]
        const w = weightProperty ? toNumber(v[weightProperty] ?? null) : 1
        if (
          x === null ||
          x === undefined ||
          x === '' ||
          Number.isNaN(toNumber(x)) ||
          Number.isNaN(w) ||
          w <= 0
        )
          continue
        total += toNumber(x) * w
        weights += w
      }
      return weights > 0 ? round(total / weights) : null
    }
    case 'percentChecked':
      return values.length ? round((column.filter((v) => v === true).length / values.length) * 100) : null
    case 'earliest':
    case 'latest': {
      const dates = column.filter((v): v is string => typeof v === 'string' && parseDate(v) !== null).sort()
      return dates.length ? (fn === 'earliest' ? dates[0]! : dates[dates.length - 1]!) : null
    }
  }
}

const round = (n: number) => Math.round(n * 1e6) / 1e6

/* ---------- formatting ---------- */

export function formatValue(def: PropertyDef | undefined, value: FormulaValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && def) {
    const digits = def.decimals ?? (Number.isInteger(value) ? 0 : 2)
    const opts = { minimumFractionDigits: digits, maximumFractionDigits: digits }
    if (def.format === 'percent') return `${value.toLocaleString('de-DE', opts)} %`
    if (def.format === 'euro')
      return value.toLocaleString('de-DE', { ...opts, style: 'currency', currency: 'EUR' })
    return value.toLocaleString('de-DE', opts)
  }
  if (def?.type === 'date' && typeof value === 'string') {
    const d = parseDate(value)
    if (d) {
      const day = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      // With a time ("2026-10-22T09:00") it is shown too.
      return /T\d{2}:\d{2}/.test(value) ? `${day}, ${value.slice(11, 16)}` : day
    }
  }
  return toText(value)
}

/** Converts edited UI input back into a frontmatter value. */
export function toStoredValue(def: PropertyDef, input: FormulaValue): FrontmatterValue {
  switch (def.type) {
    case 'number': {
      const n = toNumber(input)
      return Number.isNaN(n) ? null : n
    }
    case 'checkbox':
      return input === true
    case 'multiSelect':
      return Array.isArray(input) ? input.map((v) => toText(v)) : []
    case 'relation':
      return (Array.isArray(input) ? input : [input])
        .filter((v) => toText(v).trim())
        .map((v) => `[[${toText(v)}]]`)
    default:
      return input === null ? null : toText(input)
  }
}

export function optionColor(def: PropertyDef | undefined, value: string): Color {
  return def?.options?.find((o) => o.value === value)?.color ?? 'gray'
}
