/**
 * The tools an AI may use on a vault – one definition for the MCP server and the in-app assistant.
 * Every tool goes through {@link Workspace} (links, index and files stay consistent) and validates
 * its input first: model output is untrusted.
 */
import {
  COLORS,
  FILTER_OPS,
  PROPERTY_TYPES,
  VIEW_TYPES,
  applyFilters,
  parseDatabaseDef,
  serializeDatabaseDef,
  applySorts,
  propertyDef,
  toStoredValue,
  TITLE,
  type DatabaseDef,
  type Filter,
  type Sort,
} from '../database'
import type { FrontmatterData, FrontmatterValue } from '../frontmatter'
import type { FormulaValue } from '../formula'
import { dirname, extname, isInside } from '../path'
import { pdfText } from '../pdfText'
import { findWidgets, parseWidget, resolveFilterDates, widgetBlock, type WidgetSpec } from '../widgets'
import { parse as parseYaml } from 'yaml'
import { FORMAT_GUIDE } from './guide'
import { applyMoodleImport, importTargets, planMoodleImport, type MoodleSnapshot } from '../moodle'
import { toIsoDate } from '../dates'
import type { Page, Workspace } from '../workspace'
import { InputError, validate, type JsonSchema } from './schema'

export interface ToolContext {
  ws: Workspace
  now?: Date
  /** Current Moodle data – only in the desktop app (fresh) and its MCP server (last fetch). */
  moodle?: () => Promise<MoodleSnapshot | null>
}

export interface ToolDef {
  name: string
  /** For the model: what the tool does and when to use it. */
  description: string
  inputSchema: Extract<JsonSchema, { type: 'object' }>
  /** Changes nothing – allowed in read-only mode. */
  readOnly: boolean
  /** Removes or overwrites data – the app asks the user first. */
  destructive?: boolean
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<unknown>
}

export interface ToolOutcome {
  ok: boolean
  /** JSON (or an error message) for the model. */
  text: string
  /** Pages the tool changed or created – the app links them in the chat. */
  touched: string[]
}

const MAX_BODY = 30_000
const MAX_RESULT = 40_000
/** Frontmatter keys Notiva manages itself; the AI changes them only through dedicated tools. */
const RESERVED_KEYS = new Set(['database'])

const pageRef = (description = 'Pfad (z. B. "Studium/Module.md") oder Titel der Seite'): JsonSchema => ({
  type: 'string',
  description,
})

/** Finds a page by exact path, path without ".md", title or alias. */
export function resolvePage(ws: Workspace, ref: unknown): Page {
  if (typeof ref !== 'string' || !ref.trim()) throw new InputError('Seite fehlt')
  const clean = ref.trim().replace(/^\[\[|\]\]$/g, '')
  const path = ws.get(clean) ? clean : ws.resolveLink(clean)
  const page = path ? ws.get(path) : undefined
  if (!page)
    throw new InputError(`Seite „${ref}“ nicht gefunden. Suche sie mit search_pages oder list_pages.`)
  return page
}

function resolveDatabase(ws: Workspace, ref: unknown): Page & { database: DatabaseDef } {
  const page = resolvePage(ws, ref)
  if (!page.database)
    throw new InputError(`„${page.title}“ ist keine Datenbank. Datenbanken findest du mit list_databases.`)
  return page as Page & { database: DatabaseDef }
}

function folderOf(ws: Workspace, ref: unknown): string {
  if (ref === undefined || ref === '') return ''
  if (typeof ref !== 'string') throw new InputError('folder muss ein Text sein')
  const clean = ref.trim().replace(/^\/+|\/+$/g, '')
  // A page given as folder means "below this page".
  const page = clean.endsWith('.md') ? ws.get(clean) : undefined
  if (page) return page.path.slice(0, -3)
  if (clean.split('/').some((part) => part === '..' || part === '.'))
    throw new InputError('Ungültiger Ordner')
  return clean
}

/** Frontmatter values the AI may write: JSON scalars, lists and nested objects only. */
function toFrontmatter(value: unknown, depth = 0): FrontmatterValue {
  if (depth > 4) throw new InputError('Wert ist zu tief verschachtelt')
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map((v) => toFrontmatter(v, depth + 1))
  if (typeof value === 'object') {
    const out: FrontmatterData = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue
      out[k] = toFrontmatter(v, depth + 1)
    }
    return out
  }
  throw new InputError('Ungültiger Wert')
}

/** Stores a property value: typed via the database schema for rows, as given otherwise. */
function storedValue(ws: Workspace, page: Page, key: string, value: unknown): FrontmatterValue | undefined {
  if (RESERVED_KEYS.has(key)) throw new InputError(`„${key}“ kann hier nicht geändert werden`)
  if (value === null) return undefined
  const db = page.parentDatabase ? ws.get(page.parentDatabase)?.database : undefined
  const def = db ? propertyDef(db, key) : undefined
  if (!def) return toFrontmatter(value)
  if (def.type === 'formula' || def.type === 'rollup')
    throw new InputError(`„${key}“ wird berechnet und kann nicht gesetzt werden`)
  if (def.type === 'relation') {
    const targets = (Array.isArray(value) ? value : [value]).map((v) => {
      const target = resolvePage(ws, v)
      return ws.linkText(target.path)
    })
    return toStoredValue(def, targets)
  }
  if ((def.type === 'select' || def.type === 'multiSelect') && def.options?.length) {
    const allowed = def.options.map((o) => o.value)
    const values = Array.isArray(value) ? value : [value]
    const unknown = values.filter((v) => !allowed.includes(String(v)))
    if (unknown.length)
      throw new InputError(
        `Erlaubte Werte für „${key}“: ${allowed.join(', ')} (nicht: ${unknown.join(', ')})`,
      )
  }
  return toStoredValue(def, toFrontmatter(value) as FormulaValue)
}

function summary(page: Page) {
  return {
    path: page.path,
    title: page.title,
    ...(page.icon ? { icon: page.icon } : {}),
    ...(page.tags.length ? { tags: page.tags } : {}),
    ...(page.database ? { isDatabase: true } : {}),
    ...(page.parentDatabase ? { database: page.parentDatabase } : {}),
  }
}

function schemaOf(def: DatabaseDef) {
  return def.properties.map((p) => ({
    name: p.name,
    type: p.type,
    ...(p.options?.length ? { options: p.options.map((o) => o.value) } : {}),
    ...(p.formula ? { formula: p.formula } : {}),
    ...(p.database ? { relationTo: p.database } : {}),
  }))
}

const filterSchema: JsonSchema = {
  type: 'array',
  maxItems: 10,
  description: 'Filter (alle müssen passen)',
  items: {
    type: 'object',
    properties: {
      property: { type: 'string', description: 'Name der Eigenschaft' },
      op: { type: 'string', enum: FILTER_OPS },
      value: { description: 'Vergleichswert; Datumswerte als YYYY-MM-DD oder "today"' },
    },
    required: ['property', 'op'],
  },
}

async function moodleData(ctx: ToolContext): Promise<MoodleSnapshot> {
  const snapshot = ctx.moodle ? await ctx.moodle() : null
  if (!snapshot)
    throw new InputError(
      'Moodle ist nicht verbunden. Der Nutzer kann es in der Desktop-App unter Einstellungen → Moodle verbinden.',
    )
  return snapshot
}

/** File types read_file returns as text. */
const TEXT_FILES = new Set([
  'txt',
  'md',
  'csv',
  'tsv',
  'json',
  'ics',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'tex',
  'bib',
])
const MAX_FILE = 25 * 1024 * 1024

/**
 * Checks a widget written by the AI: valid YAML, known tile types, existing databases/views/pages.
 * Problems the dashboard would silently skip become errors the model can fix.
 */
function checkWidget(ws: Workspace, page: Page, yaml: string): WidgetSpec {
  const { widget, error } = parseWidget(yaml)
  if (!widget) throw new InputError(`Widget ungültig: ${error ?? 'unbekannt'}. Format: notiva_format`)
  const problems: string[] = []
  const database = (ref: string | undefined, what: string) => {
    if (!ref) return null
    const db = ws.findDatabase(ref, page.path)
    if (!db) problems.push(`${what}: Datenbank „${ref}“ gibt es nicht (list_databases)`)
    return db
  }
  if (widget.type === 'tiles') {
    const raw = (parseYaml(yaml) as { tiles?: unknown }).tiles
    const count = Array.isArray(raw) ? raw.length : 0
    if (widget.tiles.length === 0) problems.push('mindestens eine Kachel nötig')
    if (count !== widget.tiles.length)
      problems.push(`${count - widget.tiles.length} Kachel(n) mit unbekanntem oder fehlendem „type“`)
    widget.tiles.forEach((tile, i) => {
      const what = `Kachel ${i + 1} (${tile.title ?? tile.type})`
      const db = database(tile.source, what)
      for (const prop of [
        tile.property,
        tile.weight,
        tile.dateProperty,
        tile.show,
        ...(tile.filter ?? []).map((f) => f.property),
      ]) {
        if (db?.database && prop && prop !== TITLE && !propertyDef(db.database, prop))
          problems.push(`${what}: Eigenschaft „${prop}“ fehlt in „${db.title}“`)
      }
      if (tile.type === 'link' && tile.page && !ws.resolveLink(tile.page, page.path))
        problems.push(`${what}: Seite „${tile.page}“ gibt es nicht`)
      if (['stat', 'progress', 'countdown', 'list'].includes(tile.type) && !tile.source)
        problems.push(`${what}: „source“ fehlt`)
    })
  } else {
    const db = database(widget.source, 'Ansicht')
    if (db?.database && widget.view && !db.database.views.some((v) => v.name === widget.view))
      problems.push(
        `Ansicht „${widget.view}“ fehlt in „${db.title}“ (vorhanden: ${db.database.views.map((v) => v.name).join(', ')})`,
      )
  }
  if (problems.length) throw new InputError(`Widget nicht gespeichert:\n- ${problems.join('\n- ')}`)
  return widget
}

export const TOOLS: ToolDef[] = [
  {
    name: 'search_pages',
    description: 'Volltextsuche über alle Seiten (Titel, Tags, Text). Liefert Pfade mit Textausschnitt.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Suchbegriffe' },
        limit: { type: 'number', minimum: 1, maximum: 50 },
      },
      required: ['query'],
    },
    async run({ ws }, input) {
      return ws.search(String(input.query), Number(input.limit ?? 15)).map((h) => ({
        path: h.path,
        title: h.title,
        snippet: h.snippet,
      }))
    },
  },
  {
    name: 'list_pages',
    description:
      'Listet Seiten, optional nur unterhalb eines Ordners bzw. einer Seite. Zeigt, welche Seiten Datenbanken oder Einträge sind.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Ordner oder Seitenpfad, z. B. "Studium" (leer = alles)' },
        limit: { type: 'number', minimum: 1, maximum: 500 },
      },
    },
    async run({ ws }, input) {
      const folder = folderOf(ws, input.folder)
      const pages = ws.all().filter((p) => !folder || p.path === `${folder}.md` || isInside(p.path, folder))
      const limit = Number(input.limit ?? 200)
      return {
        total: pages.length,
        pages: pages
          .sort((a, b) => a.path.localeCompare(b.path, 'de'))
          .slice(0, limit)
          .map(summary),
      }
    },
  },
  {
    name: 'read_page',
    description:
      'Liest eine Seite: Eigenschaften (Frontmatter) und Markdown-Inhalt. Bei Datenbanken auch das Schema.',
    readOnly: true,
    inputSchema: { type: 'object', properties: { page: pageRef() }, required: ['page'] },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const properties = Object.fromEntries(Object.entries(page.data).filter(([k]) => !RESERVED_KEYS.has(k)))
      const truncated = page.body.length > MAX_BODY
      return {
        ...summary(page),
        properties,
        body: truncated ? page.body.slice(0, MAX_BODY) : page.body,
        ...(truncated ? { truncated: true } : {}),
        ...(page.database ? { schema: schemaOf(page.database), rows: ws.rows(page.path).length } : {}),
        backlinks: ws.backlinks(page.path).map((p) => p.path),
      }
    },
  },
  {
    name: 'list_databases',
    description: 'Listet alle Datenbanken mit ihren Eigenschaften (Name, Typ, erlaubte Werte).',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    async run({ ws }) {
      return ws.databases().map((db) => ({
        path: db.path,
        title: db.title,
        rows: ws.rows(db.path).length,
        properties: schemaOf(db.database!),
      }))
    },
  },
  {
    name: 'query_database',
    description:
      'Liest Einträge einer Datenbank mit berechneten Werten (Formeln, Relationen), optional gefiltert und sortiert.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        database: pageRef('Pfad oder Titel der Datenbank'),
        filter: filterSchema,
        sort: {
          type: 'array',
          maxItems: 5,
          items: {
            type: 'object',
            properties: {
              property: { type: 'string' },
              direction: { type: 'string', enum: ['asc', 'desc'] },
            },
            required: ['property'],
          },
        },
        limit: { type: 'number', minimum: 1, maximum: 200 },
      },
      required: ['database'],
    },
    async run({ ws, now = new Date() }, input) {
      const db = resolveDatabase(ws, input.database)
      const def = db.database
      const filters = ((input.filter as Filter[] | undefined) ?? []).map((f) => {
        if (f.property !== TITLE && !propertyDef(def, f.property))
          throw new InputError(
            `Unbekannte Eigenschaft „${f.property}“. Vorhanden: ${def.properties.map((p) => p.name).join(', ')}`,
          )
        return f
      })
      const sorts = ((input.sort as Array<Partial<Sort> & { property: string }> | undefined) ?? []).map(
        (s) => ({ property: s.property, direction: s.direction ?? 'asc' }) as Sort,
      )
      const rows = applySorts(
        applyFilters(ws.resolvedRows(db.path, now), resolveFilterDates(filters, now), def, now),
        sorts,
        def,
      )
      const limit = Number(input.limit ?? 50)
      return {
        database: db.path,
        total: rows.length,
        rows: rows.slice(0, limit).map((r) => ({ path: r.row.path, title: r.row.title, values: r.values })),
      }
    },
  },
  {
    name: 'get_backlinks',
    description: 'Seiten, die auf eine Seite verlinken.',
    readOnly: true,
    inputSchema: { type: 'object', properties: { page: pageRef() }, required: ['page'] },
    async run({ ws }, input) {
      return ws.backlinks(resolvePage(ws, input.page).path).map(summary)
    },
  },
  {
    name: 'list_tags',
    description: 'Alle Tags mit den Seiten, die sie verwenden.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    async run({ ws }) {
      return Object.fromEntries(ws.tags())
    },
  },
  {
    name: 'create_page',
    description:
      'Legt eine neue Markdown-Seite an. Links auf andere Seiten als [[Titel]], Aufgaben als "- [ ] …". Gibt den Pfad zurück.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        folder: { type: 'string', description: 'Ordner oder übergeordnete Seite (leer = oberste Ebene)' },
        body: { type: 'string', description: 'Inhalt als Markdown' },
        properties: {
          type: 'object',
          properties: {},
          additionalProperties: true,
          description: 'Eigenschaften (Frontmatter), z. B. {"tags": ["lernzettel"], "icon": "📘"}',
        },
      },
      required: ['title'],
    },
    async run({ ws }, input) {
      const data: FrontmatterData = {}
      for (const [k, v] of Object.entries((input.properties as Record<string, unknown>) ?? {})) {
        if (RESERVED_KEYS.has(k)) throw new InputError(`„${k}“ kann hier nicht gesetzt werden`)
        if (v !== null) data[k] = toFrontmatter(v)
      }
      const path = await ws.createPage({
        folder: folderOf(ws, input.folder),
        title: String(input.title),
        data,
        body: String(input.body ?? ''),
      })
      return { path }
    },
  },
  {
    name: 'create_row',
    description:
      'Legt einen Eintrag in einer Datenbank an. Werte passend zum Schema (list_databases); Relationen als Titel der Zielseite.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        database: pageRef('Pfad oder Titel der Datenbank'),
        title: { type: 'string' },
        values: { type: 'object', properties: {}, additionalProperties: true },
        body: { type: 'string', description: 'Optionaler Inhalt als Markdown' },
      },
      required: ['database', 'title'],
    },
    async run({ ws }, input) {
      const db = resolveDatabase(ws, input.database)
      const values: FrontmatterData = {}
      // Validate against the schema before anything is written.
      const probe = { parentDatabase: db.path } as Page
      for (const [k, v] of Object.entries((input.values as Record<string, unknown>) ?? {})) {
        if (!propertyDef(db.database, k))
          throw new InputError(
            `Unbekannte Eigenschaft „${k}“. Vorhanden: ${db.database.properties.map((p) => p.name).join(', ')}`,
          )
        const stored = storedValue(ws, probe, k, v)
        if (stored !== undefined) values[k] = stored
      }
      const path = await ws.createRow(db.path, String(input.title), values)
      if (typeof input.body === 'string' && input.body) await ws.save(path, { body: input.body })
      return { path }
    },
  },
  {
    name: 'set_properties',
    description:
      'Setzt Eigenschaften einer Seite oder eines Datenbank-Eintrags. null entfernt eine Eigenschaft. Berechnete Werte (Formeln) gehen nicht.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        page: pageRef(),
        properties: { type: 'object', properties: {}, additionalProperties: true },
      },
      required: ['page', 'properties'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const data = { ...page.data }
      for (const [k, v] of Object.entries(input.properties as Record<string, unknown>)) {
        const stored = storedValue(ws, page, k, v)
        if (stored === undefined) delete data[k]
        else data[k] = stored
      }
      await ws.save(page.path, { data })
      return { path: page.path }
    },
  },
  {
    name: 'append_to_page',
    description: 'Hängt Markdown an das Ende einer Seite an (ändert den bestehenden Text nicht).',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: { page: pageRef(), markdown: { type: 'string' } },
      required: ['page', 'markdown'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const body = page.body.trimEnd()
      await ws.save(page.path, { body: `${body}${body ? '\n\n' : ''}${String(input.markdown).trim()}\n` })
      return { path: page.path }
    },
  },
  {
    name: 'edit_page_text',
    description:
      'Ersetzt eine Textstelle im Markdown einer Seite. "find" muss genau einmal vorkommen – so bleibt der Rest der Datei unverändert.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        page: pageRef(),
        find: { type: 'string', description: 'Exakter bisheriger Text' },
        replace: { type: 'string', description: 'Neuer Text' },
      },
      required: ['page', 'find', 'replace'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const find = String(input.find)
      if (!find) throw new InputError('find darf nicht leer sein')
      const count = page.body.split(find).length - 1
      if (count !== 1)
        throw new InputError(
          count === 0
            ? 'Text nicht gefunden – lies die Seite mit read_page und kopiere die Stelle exakt.'
            : `Text kommt ${count}× vor – nimm mehr Kontext, damit er eindeutig ist.`,
        )
      await ws.save(page.path, { body: page.body.replace(find, () => String(input.replace)) })
      return { path: page.path }
    },
  },
  {
    name: 'replace_page_body',
    description:
      'Ersetzt den gesamten Markdown-Inhalt einer Seite. Nur nutzen, wenn wirklich alles neu soll.',
    readOnly: false,
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: { page: pageRef(), body: { type: 'string' } },
      required: ['page', 'body'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      await ws.save(page.path, { body: String(input.body) })
      return { path: page.path }
    },
  },
  {
    name: 'notiva_format',
    description:
      'Erklärt Notivas Formate: Kacheln/Widgets, Datenbanken, Filter, das Studien-Dashboard. Vor dem Anpassen von Dashboards oder Datenbanken lesen.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    async run() {
      return { guide: FORMAT_GUIDE }
    },
  },
  {
    name: 'list_widgets',
    description:
      'Zeigt die Widgets (Kachel-Blöcke und eingebettete Ansichten) einer Seite mit Nummer und YAML – für update_widget.',
    readOnly: true,
    inputSchema: { type: 'object', properties: { page: pageRef() }, required: ['page'] },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      return {
        path: page.path,
        widgets: findWidgets(page.body).map((w, index) => {
          const { widget, error } = parseWidget(w.yaml)
          return {
            index,
            type: widget?.type ?? 'ungültig',
            ...(widget?.type === 'tiles' ? { tiles: widget.tiles.length } : {}),
            ...(error ? { error } : {}),
            yaml: w.yaml,
          }
        }),
      }
    },
  },
  {
    name: 'update_widget',
    description:
      'Ersetzt ein Widget einer Seite (index aus list_widgets) oder fügt mit index = -1 ein neues am Ende an. Das YAML wird geprüft (Kachel-Typen, Datenbanken, Eigenschaften, Ansichten) – bei Fehlern bleibt die Seite unverändert.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        page: pageRef(),
        index: { type: 'number', description: 'Nummer des Widgets, -1 = neu am Ende', minimum: -1 },
        yaml: { type: 'string', description: 'YAML ohne die ```notiva-Zäune, Format: notiva_format' },
      },
      required: ['page', 'index', 'yaml'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const yaml = String(input.yaml)
        .replace(/^```notiva[^\n]*\n?|\n?```\s*$/g, '')
        .trim()
      const widget = checkWidget(ws, page, yaml)
      const index = Math.round(Number(input.index))
      const widgets = findWidgets(page.body)
      let body: string
      if (index === -1) {
        const base = page.body.trimEnd()
        body = `${base}${base ? '\n\n' : ''}${widgetBlock(yaml)}\n`
      } else {
        const target = widgets[index]
        if (!target) throw new InputError(`Widget ${index} gibt es nicht (Seite hat ${widgets.length})`)
        body = page.body.slice(0, target.start) + widgetBlock(yaml) + page.body.slice(target.end)
      }
      await ws.save(page.path, { body })
      return {
        path: page.path,
        type: widget.type,
        ...(widget.type === 'tiles' ? { tiles: widget.tiles.length } : {}),
      }
    },
  },
  {
    name: 'remove_widget',
    description: 'Entfernt ein Widget (index aus list_widgets) von einer Seite.',
    readOnly: false,
    destructive: true,
    inputSchema: {
      type: 'object',
      properties: { page: pageRef(), index: { type: 'number', minimum: 0 } },
      required: ['page', 'index'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const target = findWidgets(page.body)[Math.round(Number(input.index))]
      if (!target) throw new InputError('Widget nicht gefunden – list_widgets zeigt die Nummern')
      const body = (
        page.body.slice(0, target.start).trimEnd() +
        '\n\n' +
        page.body.slice(target.end).trimStart()
      ).trim()
      await ws.save(page.path, { body: body ? `${body}\n` : '' })
      return { path: page.path }
    },
  },
  {
    name: 'update_database',
    description:
      'Erweitert eine Datenbank: neue Eigenschaften, neue Auswahl-Optionen oder neue Ansichten. Löscht und überschreibt nichts.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        database: pageRef('Datenbank (Pfad oder Titel)'),
        add_properties: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: PROPERTY_TYPES },
              options: {
                type: 'array',
                items: { type: 'string' },
                maxItems: 50,
                description: 'select/multiSelect',
              },
              formula: { type: 'string', description: 'formula' },
              relationTo: { type: 'string', description: 'relation: Ziel-Datenbank' },
              decimals: { type: 'number', minimum: 0, maximum: 6 },
            },
            required: ['name', 'type'],
          },
        },
        add_options: {
          type: 'array',
          maxItems: 20,
          items: {
            type: 'object',
            properties: {
              property: { type: 'string' },
              values: { type: 'array', items: { type: 'string' }, maxItems: 50 },
              color: { type: 'string', enum: COLORS },
            },
            required: ['property', 'values'],
          },
        },
        add_views: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: VIEW_TYPES },
              groupBy: { type: 'string' },
              dateProperty: { type: 'string' },
              properties: { type: 'array', items: { type: 'string' }, maxItems: 30 },
              filter: filterSchema,
              sort: {
                type: 'array',
                maxItems: 5,
                items: {
                  type: 'object',
                  properties: {
                    property: { type: 'string' },
                    direction: { type: 'string', enum: ['asc', 'desc'] },
                  },
                  required: ['property'],
                },
              },
            },
            required: ['name', 'type'],
          },
        },
      },
      required: ['database'],
    },
    async run({ ws }, input) {
      const db = resolveDatabase(ws, input.database)
      const def = structuredClone(db.database)
      const has = (name: string) =>
        name.toLowerCase() === TITLE.toLowerCase() ||
        def.properties.some((p) => p.name.toLowerCase() === name.toLowerCase())
      const added: string[] = []
      for (const raw of (input.add_properties ?? []) as Array<Record<string, unknown>>) {
        const name = String(raw.name).trim()
        if (!name) throw new InputError('Eigenschaft ohne Namen')
        if (has(name)) throw new InputError(`Eigenschaft „${name}“ gibt es schon`)
        const prop: Record<string, unknown> = { name, type: raw.type }
        if (Array.isArray(raw.options)) prop.options = raw.options.map(String)
        if (raw.formula !== undefined) prop.formula = String(raw.formula)
        if (raw.decimals !== undefined) prop.decimals = raw.decimals
        if (raw.type === 'relation') {
          const target = resolveDatabase(ws, raw.relationTo)
          prop.database = target.path
        }
        def.properties.push(parseDatabaseDef({ properties: [prop] })!.properties[0]!)
        added.push(`Eigenschaft ${name}`)
      }
      for (const raw of (input.add_options ?? []) as Array<Record<string, unknown>>) {
        const prop = def.properties.find((p) => p.name === raw.property)
        if (!prop || (prop.type !== 'select' && prop.type !== 'multiSelect'))
          throw new InputError(`„${String(raw.property)}“ ist keine Auswahl-Eigenschaft`)
        prop.options ??= []
        for (const value of (raw.values as unknown[]).map((v) => String(v).trim()).filter(Boolean)) {
          if (prop.options.some((o) => o.value === value)) continue
          const color =
            (raw.color as (typeof COLORS)[number] | undefined) ?? COLORS[prop.options.length % COLORS.length]!
          prop.options.push({ value, color })
          added.push(`Option ${prop.name}: ${value}`)
        }
      }
      for (const raw of (input.add_views ?? []) as Array<Record<string, unknown>>) {
        const name = String(raw.name).trim()
        if (def.views.some((v) => v.name === name)) throw new InputError(`Ansicht „${name}“ gibt es schon`)
        const view = parseDatabaseDef({ views: [raw] })!.views[0]!
        for (const prop of [
          view.groupBy,
          view.dateProperty,
          ...(view.properties ?? []),
          ...(view.filter ?? []).map((f) => f.property),
        ])
          if (prop && !has(prop)) throw new InputError(`Ansicht „${name}“: Eigenschaft „${prop}“ fehlt`)
        if (view.type === 'board' && !view.groupBy) throw new InputError('Board braucht groupBy')
        if (view.type === 'calendar' && !view.dateProperty)
          throw new InputError('Kalender braucht dateProperty')
        def.views.push(view)
        added.push(`Ansicht ${name}`)
      }
      if (added.length === 0)
        throw new InputError('Nichts zu ändern: add_properties, add_options oder add_views angeben')
      await ws.updateDatabase(db.path, () => parseDatabaseDef(serializeDatabaseDef(def))!)
      return { path: db.path, added }
    },
  },
  {
    name: 'list_files',
    description:
      'Listet die Dateien im Ordner, die keine Seiten sind (PDFs, Bilder, CSV …) – z. B. Modulhandbuch, Notenspiegel, Stundenplan. Lesen mit read_file.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: { folder: { type: 'string', description: 'Nur in diesem Ordner (optional)' } },
    },
    async run({ ws }, input) {
      const folder = folderOf(ws, input.folder)
      return {
        files: ws
          .assets()
          .filter((f) => !folder || isInside(f.path, folder))
          .slice(0, 300)
          .map((f) => ({ path: f.path, size: f.size, readable: readable(f.path) })),
      }
    },
  },
  {
    name: 'read_file',
    description:
      'Liest eine Datei aus dem Ordner als Text: PDF (Text wird erkannt), CSV, TXT, JSON, ICS (Kalender) u. a. Bilder kann es nicht lesen.',
    readOnly: true,
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Pfad aus list_files' },
        offset: {
          type: 'number',
          minimum: 0,
          description: 'Ab diesem Zeichen weiterlesen (bei langen Dateien)',
        },
      },
      required: ['path'],
    },
    async run({ ws }, input) {
      const path = String(input.path).trim()
      const file = ws.assets().find((f) => f.path === path)
      if (!file) throw new InputError(`Datei „${path}“ nicht gefunden (list_files)`)
      if (!readable(path))
        throw new InputError(
          `Dateityp ${extname(path) || '(ohne Endung)'} kann nicht als Text gelesen werden`,
        )
      if (file.size > MAX_FILE) throw new InputError('Datei ist zu groß (max. 25 MB)')
      let text: string
      let pages: number | undefined
      if (extname(path).toLowerCase() === '.pdf') {
        const result = await pdfText(await ws.vault.readBinary(path))
        text = result.text
        pages = result.pages
        if (!text.replace(/--- Seite \d+ ---/g, '').trim())
          throw new InputError('Das PDF enthält keinen Text (vermutlich eingescannt).')
      } else text = await ws.vault.read(path)
      const offset = Math.max(0, Math.round(Number(input.offset ?? 0)))
      const chunk = text.slice(offset, offset + MAX_BODY)
      return {
        path,
        ...(pages ? { pages } : {}),
        text: chunk,
        ...(offset + MAX_BODY < text.length
          ? { more: true, nextOffset: offset + MAX_BODY, length: text.length }
          : {}),
      }
    },
  },
  {
    name: 'moodle_overview',
    description:
      'Holt Kurse, anstehende Abgaben/Termine und (falls freigegeben) Bewertungen aus dem verbundenen Moodle des Nutzers.',
    readOnly: true,
    inputSchema: { type: 'object', properties: {} },
    async run(ctx) {
      const snap = await moodleData(ctx)
      const today = toIsoDate(ctx.now ?? new Date())
      return {
        site: snap.site,
        source: snap.source,
        fetchedAt: snap.fetchedAt,
        courses: snap.courses.map((c) => ({
          name: c.name,
          ...(c.shortname ? { shortname: c.shortname } : {}),
        })),
        deadlines: snap.events
          .filter((e) => toIsoDate(new Date(e.due)) >= today)
          .map((e) => ({
            title: e.title,
            due: e.due,
            ...(e.course ? { course: e.course.name } : {}),
            kind: e.kind,
          })),
        grades: snap.grades,
      }
    },
  },
  {
    name: 'import_moodle',
    description:
      'Übernimmt Moodle-Kurse als Module und anstehende Abgaben als Aufgaben ins Studien-Dashboard (verknüpft, ohne Doppelte; aktualisiert verschobene Termine, löscht nichts).',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Ordner des Dashboards, z. B. "Studium" (optional)' },
        only: { type: 'string', enum: ['all', 'tasks', 'modules'], description: 'Standard: all' },
      },
    },
    async run(ctx, input) {
      const snap = await moodleData(ctx)
      const targets = importTargets(ctx.ws)
      const folder = typeof input.folder === 'string' ? input.folder.trim().replace(/\/+$/, '') : undefined
      const target = folder ? targets.find((t) => t.folder === folder) : targets[0]
      if (!target)
        throw new InputError(
          'Kein Dashboard mit den Datenbanken „Aufgaben“ oder „Module“ gefunden – erst die Vorlage „Studium“ anlegen.',
        )
      const only = input.only ?? 'all'
      const plan = planMoodleImport(ctx.ws, snap, target, ctx.now).filter(
        (p) => only === 'all' || (only === 'tasks' ? p.what === 'task' : p.what === 'module'),
      )
      const touched = await applyMoodleImport(ctx.ws, plan)
      return {
        folder: target.folder,
        created: plan.filter((p) => p.kind === 'create').map((p) => p.title),
        updated: plan.filter((p) => p.kind === 'update').map((p) => p.title),
        paths: touched,
      }
    },
  },
  {
    name: 'rename_page',
    description: 'Benennt eine Seite um; Links auf sie werden überall angepasst.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: { page: pageRef(), title: { type: 'string' } },
      required: ['page', 'title'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      return { path: await ws.rename(page.path, String(input.title)) }
    },
  },
  {
    name: 'move_page',
    description:
      'Verschiebt eine Seite (mit Unterseiten) in einen anderen Ordner bzw. unter eine andere Seite.',
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: { page: pageRef(), folder: { type: 'string', description: 'Ziel (leer = oberste Ebene)' } },
      required: ['page', 'folder'],
    },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const folder = folderOf(ws, input.folder)
      if (folder === dirname(page.path)) return { path: page.path }
      return { path: await ws.moveTo(page.path, folder) }
    },
  },
  {
    name: 'trash_page',
    description:
      'Legt eine Seite (mit Unterseiten) in den Papierkorb. Sie kann dort wiederhergestellt werden.',
    readOnly: false,
    destructive: true,
    inputSchema: { type: 'object', properties: { page: pageRef() }, required: ['page'] },
    async run({ ws }, input) {
      const page = resolvePage(ws, input.page)
      const entry = await ws.trash(page.path)
      return { trashed: page.path, files: entry.files.length }
    },
  },
]

function readable(path: string): boolean {
  const ext = extname(path).slice(1).toLowerCase()
  return ext === 'pdf' || TEXT_FILES.has(ext)
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}

/** Paths a successful tool call created or changed (for links in the chat). */
function touchedPaths(tool: ToolDef, result: unknown): string[] {
  if (tool.readOnly || typeof result !== 'object' || result === null) return []
  const { path, paths } = result as { path?: unknown; paths?: unknown }
  if (Array.isArray(paths)) return paths.filter((p): p is string => typeof p === 'string')
  return typeof path === 'string' ? [path] : []
}

/** Validates and runs one tool call; errors become text the model can react to. */
export async function runTool(ctx: ToolContext, name: string, input: unknown): Promise<ToolOutcome> {
  const tool = findTool(name)
  if (!tool) return { ok: false, text: `Unbekanntes Werkzeug: ${name}`, touched: [] }
  try {
    const args = input ?? {}
    validate(tool.inputSchema, args)
    const result = await tool.run(ctx, args as Record<string, unknown>)
    const text = JSON.stringify(result, null, 1)
    return {
      ok: true,
      text: text.length > MAX_RESULT ? `${text.slice(0, MAX_RESULT)}\n… (gekürzt)` : text,
      touched: touchedPaths(tool, result),
    }
  } catch (error) {
    return { ok: false, text: error instanceof Error ? error.message : String(error), touched: [] }
  }
}
