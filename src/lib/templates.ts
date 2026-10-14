/**
 * Templates: single page templates (Markdown files in the templates folder) and template packs
 * (several files, e.g. the study dashboard). Placeholders:
 *
 *   {{title}}  {{date}}  {{date:DD.MM.YYYY}}  {{time}}  {{weekday}}  {{<variable>}}
 *   {{title|yaml}} – value as a quoted YAML/JSON string (safe inside frontmatter)
 *   {{date+7}}    – date in 7 days (also date-3, date+14:DD.MM.)
 *
 * Unknown placeholders are kept unchanged. Values are plain text; templates cannot run code.
 */
import { addDays, formatDate } from './dates'
import { parseMarkdown, type FrontmatterData } from './frontmatter'
import { assertSafePath, joinPath } from './path'

export type TemplateVars = Record<string, string | number>

export interface TemplateVariable {
  key: string
  label: string
  type?: 'text' | 'number' | 'date'
  default?: string
}

export interface TemplateFile {
  /** Path relative to the target folder; may contain placeholders. */
  path: string
  content: string
}

export interface TemplatePack {
  id: string
  name: string
  description: string
  icon: string
  variables?: TemplateVariable[]
  files: TemplateFile[]
  /** File (relative, after placeholder expansion) to open after creating. */
  entry: string
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
const PLACEHOLDER = /\{\{\s*([\p{L}\p{N}_]+)([+-]\d+)?(?::([^|}]+))?(?:\|(\w+))?\s*\}\}/gu

export function renderTemplate(text: string, vars: TemplateVars = {}, now = new Date()): string {
  return text.replace(PLACEHOLDER, (full, key: string, offset?: string, format?: string, filter?: string) => {
    let value: string | undefined
    const date = offset ? addDays(now, Number(offset)) : now
    if (key === 'date') value = formatDate(date, format?.trim() || 'YYYY-MM-DD')
    else if (key === 'time') value = formatDate(now, format?.trim() || 'HH:mm')
    else if (key === 'weekday') value = WEEKDAYS[date.getDay()]
    else if (Object.hasOwn(vars, key)) value = String(vars[key])
    if (value === undefined) return full
    return filter === 'yaml' ? JSON.stringify(value) : value
  })
}

/** Applies a page template: returns frontmatter (without template-only keys) and body. */
export function applyPageTemplate(
  text: string,
  vars: TemplateVars,
  now = new Date(),
): { data: FrontmatterData; body: string } {
  const { data, body } = parseMarkdown(renderTemplate(text, vars, now))
  const clean = { ...data }
  delete clean.template
  delete clean.title
  return { data: clean, body }
}

/** Expands a pack into concrete files below `folder`. Throws on unsafe paths. */
export function expandPack(
  pack: TemplatePack,
  folder: string,
  vars: TemplateVars,
  now = new Date(),
): { files: TemplateFile[]; entry: string } {
  // Defaults may contain placeholders themselves (e.g. "{{date-21}}").
  const defaults = Object.fromEntries(
    (pack.variables ?? []).map((v) => [v.key, renderTemplate(v.default ?? '', {}, now)]),
  )
  const all = { ...defaults, ...vars }
  const files = pack.files.map((f) => ({
    path: assertSafePath(joinPath(folder, renderTemplate(f.path, all, now))),
    content: renderTemplate(f.content, all, now),
  }))
  return { files, entry: assertSafePath(joinPath(folder, renderTemplate(pack.entry, all, now))) }
}
