import { parseDocument as parseYaml, stringify } from 'yaml'

export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[] | FrontmatterData
export interface FrontmatterData {
  [key: string]: FrontmatterValue
}

export interface MarkdownDocument {
  data: FrontmatterData
  body: string
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Splits a Markdown file into YAML frontmatter and body.
 * YAML is parsed with the safe "core" schema (no custom tags) and a strict alias limit,
 * so untrusted files cannot execute code or blow up memory ("billion laughs").
 * Invalid YAML never throws: the file is treated as body-only and the error is reported.
 */
export function parseMarkdown(text: string): MarkdownDocument & { error?: string } {
  const match = FENCE.exec(text)
  if (!match) return { data: {}, body: text }
  const body = text.slice(match[0].length)
  const doc = parseYaml(match[1] ?? '', { schema: 'core', uniqueKeys: false })
  if (doc.errors.length > 0) return { data: {}, body: text, error: doc.errors[0]!.message }
  let value: unknown
  try {
    value = doc.toJS({ maxAliasCount: 50 })
  } catch (error) {
    return { data: {}, body: text, error: (error as Error).message }
  }
  if (value === null || value === undefined) return { data: {}, body }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { data: {}, body: text, error: 'Frontmatter must be a mapping' }
  }
  return { data: sanitizeData(value as Record<string, unknown>), body }
}

/** Serializes frontmatter + body. Empty frontmatter is omitted so plain notes stay plain. */
export function serializeMarkdown({ data, body }: MarkdownDocument): string {
  const clean = sanitizeData(data)
  if (Object.keys(clean).length === 0) return body
  const yaml = stringify(clean, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n${body.startsWith('\n') ? body.slice(1) : body}`
}

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/** Drops prototype-polluting keys, functions and unsupported values; converts Dates to ISO strings. */
export function sanitizeData(input: Record<string, unknown>): FrontmatterData {
  const out: FrontmatterData = {}
  for (const [key, value] of Object.entries(input)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const clean = sanitizeValue(value)
    if (clean !== undefined) out[key] = clean
  }
  return out
}

function sanitizeValue(value: unknown): FrontmatterValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10)
  if (Array.isArray(value)) {
    return value.map(sanitizeValue).filter((v): v is FrontmatterValue => v !== undefined)
  }
  if (typeof value === 'object') return sanitizeData(value as Record<string, unknown>)
  return undefined
}
