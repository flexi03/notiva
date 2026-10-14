import {
  Document,
  isCollection,
  isMap,
  isScalar,
  isSeq,
  parseDocument as parseYaml,
  Scalar,
  stringify,
  type Node,
} from 'yaml'

export type FrontmatterValue = string | number | boolean | null | FrontmatterValue[] | FrontmatterData
export interface FrontmatterData {
  [key: string]: FrontmatterValue
}

export interface MarkdownDocument {
  data: FrontmatterData
  body: string
}

export interface ParsedMarkdown extends MarkdownDocument {
  /** The YAML text between the fences as written in the file (for format-preserving saves). */
  yaml?: string
  error?: string
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * Splits a Markdown file into YAML frontmatter and body.
 * YAML is parsed with the safe "core" schema (no custom tags) and a strict alias limit,
 * so untrusted files cannot execute code or blow up memory ("billion laughs").
 * Invalid YAML never throws: the file is treated as body-only and the error is reported.
 */
export function parseMarkdown(text: string): ParsedMarkdown {
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
  const yaml = match[1] ?? ''
  if (value === null || value === undefined) return { data: {}, body, yaml }
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { data: {}, body: text, error: 'Frontmatter must be a mapping' }
  }
  return { data: sanitizeData(value as Record<string, unknown>), body, yaml }
}

/**
 * Serializes frontmatter + body. Empty frontmatter is omitted so plain notes stay plain.
 *
 * With `previousYaml` (the frontmatter as it is in the file) the save is format-preserving:
 * unchanged keys keep their exact lines (flow lists, quotes, comments, order), removed keys
 * disappear, changed keys are rewritten in their old style and new keys are appended. So a Git
 * diff only shows what was really changed.
 */
export function serializeMarkdown({ data, body }: MarkdownDocument, previousYaml?: string): string {
  const clean = sanitizeData(data)
  if (Object.keys(clean).length === 0) return body
  const yaml =
    (previousYaml !== undefined ? patchYaml(previousYaml, clean) : null) ??
    stringify(clean, { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n${body}`
}

/** Line-preserving update of a top-level YAML mapping; null if the source has an unusual shape. */
export function patchYaml(source: string, data: FrontmatterData): string | null {
  const doc = parseYaml(source, { schema: 'core', uniqueKeys: false })
  if (doc.errors.length > 0 || !isMap(doc.contents) || doc.contents.flow) return null
  try {
    const first = doc.contents.items[0]?.key as Node | undefined
    const prefix = first ? source.slice(0, lineStart(source, first.range![0])) : ''
    return (prefix + spliceMap(source, doc.contents, data, source.length)).trimEnd()
  } catch {
    return null
  }
}

type Pair = { key: unknown; value: unknown }

/**
 * Block mapping: keeps the source lines of unchanged pairs, descends into changed block maps and
 * lists, renders other changed values fresh (in the old style). `end` = where the last pair ends.
 */
function spliceMap(source: string, map: { items: Pair[] }, next: FrontmatterData, end: number): string {
  const pairs = map.items
  const keys = pairs.map((p) => (isScalar(p.key) ? String(p.key.value) : null))
  if (keys.some((k) => k === null) || new Set(keys).size !== keys.length) throw new Error('unsupported')
  const starts = pairs.map((p) => lineStart(source, (p.key as Node).range![0]))
  const indent = starts.length > 0 ? leadingSpace(source, starts[0]!) : ''
  let out = ''
  pairs.forEach((pair, i) => {
    const key = keys[i]!
    if (!Object.hasOwn(next, key)) return
    const segment = source.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : end)
    const node = pair.value as Node | null
    const old = sanitizeValue(node === null ? null : node.toJSON())
    const value = next[key]!
    if (deepEqual(old, value)) out += withNewline(segment)
    else if (node && !nodeFlow(node) && isMap(node) && isPlainObject(old) && isPlainObject(value)) {
      out += withNewline(headerLine(source, starts[i]!))
      out += spliceMap(source, node, value, starts[i]! + segment.length)
    } else if (node && !nodeFlow(node) && isSeq(node) && Array.isArray(old) && Array.isArray(value)) {
      out += withNewline(headerLine(source, starts[i]!))
      out += spliceSeq(source, node, old, value, starts[i]! + segment.length)
    } else out += reindent(renderPair(key, patchNode(node, old, value), padding(source, node)), indent)
  })
  for (const key of Object.keys(next)) {
    if (!keys.includes(key)) out += reindent(renderPair(key, next[key]!, padding(source, null)), indent)
  }
  return out
}

/** Block list: unchanged items keep their lines (even when moved), others are rendered fresh. */
function spliceSeq(
  source: string,
  seq: { items: unknown[] },
  old: FrontmatterValue[],
  next: FrontmatterValue[],
  end: number,
): string {
  const items = seq.items as Node[]
  const starts = items.map((n) => lineStart(source, n.range![0]))
  if (new Set(starts).size !== starts.length) throw new Error('unsupported')
  const indent = starts.length > 0 ? leadingSpace(source, starts[0]!) : ''
  const used = new Set<number>()
  let out = ''
  next.forEach((value, i) => {
    const same = old.findIndex((o, j) => !used.has(j) && deepEqual(o, value))
    if (same >= 0) {
      used.add(same)
      out += withNewline(source.slice(starts[same], same + 1 < starts.length ? starts[same + 1] : end))
      return
    }
    const node = items[i] ?? null
    const doc = new Document([])
    const fresh = patchNode(node, old[i], value)
    ;(doc.contents as unknown as { items: unknown[] }).items = [
      isNodeLike(fresh) ? fresh : doc.createNode(fresh),
    ]
    out += reindent(doc.toString({ lineWidth: 0, flowCollectionPadding: padding(source, node) }), indent)
  })
  return out
}

function lineStart(text: string, offset: number): number {
  return text.lastIndexOf('\n', offset - 1) + 1
}

function leadingSpace(source: string, start: number): string {
  return /^[ \t]*/.exec(source.slice(start))![0]
}

/** "key:" line of a nested block (incl. a trailing comment). */
function headerLine(source: string, start: number): string {
  const nl = source.indexOf('\n', start)
  return source.slice(start, nl < 0 ? source.length : nl)
}

function withNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`
}

function reindent(text: string, indent: string): string {
  return withNewline(
    text
      .trimEnd()
      .split('\n')
      .map((line) => (line ? indent + line : line))
      .join('\n'),
  )
}

function nodeFlow(node: Node): boolean {
  return isCollection(node) && !!node.flow
}

/** Whether the old node was written as "[ a ]" or "[a]" (new keys: style of the file). */
function padding(source: string, node: Node | null): boolean {
  const text = node?.range ? source.slice(node.range[0], node.range[1]) : source
  if (/[[{] /.test(text)) return true
  if (/[[{][^ \]}]/.test(text)) return false
  return /[[{] /.test(source)
}

function renderPair(key: string, value: unknown, flowPadding: boolean): string {
  const doc = new Document({})
  ;(doc.contents as unknown as { set: (k: unknown, v: unknown) => void }).set(
    doc.createNode(key),
    isNodeLike(value) ? value : doc.createNode(value),
  )
  return doc.toString({ lineWidth: 0, flowCollectionPadding: flowPadding })
}

function isNodeLike(value: unknown): value is Node {
  return isScalar(value) || isCollection(value)
}

/**
 * New YAML node for a changed value that keeps the old node's style: flow lists stay flow lists,
 * quoted strings stay quoted, unchanged entries of maps and lists keep their nodes.
 */
function patchNode(node: Node | null, old: FrontmatterValue | undefined, next: FrontmatterValue): unknown {
  if (node && deepEqual(old, next)) return node
  if (isMap(node) && isPlainObject(old) && isPlainObject(next)) {
    const doc = new Document({})
    const map = doc.contents as unknown as { flow?: boolean; set: (k: unknown, v: unknown) => void }
    map.flow = node.flow
    const oldNodes = new Map(node.items.map((p) => [isScalar(p.key) ? String(p.key.value) : '', p.value]))
    for (const [k, v] of Object.entries(next)) {
      const child = oldNodes.get(k) as Node | null | undefined
      const value = patchNode(child ?? null, child !== undefined ? old[k] : undefined, v)
      map.set(doc.createNode(k), isNodeLike(value) ? value : doc.createNode(value))
    }
    return doc.contents
  }
  if (isSeq(node) && Array.isArray(old) && Array.isArray(next)) {
    const doc = new Document([])
    const seq = doc.contents as unknown as { flow?: boolean; items: unknown[] }
    seq.flow = node.flow
    const used = new Set<number>()
    seq.items = next.map((v, i) => {
      const same = old.findIndex((o, j) => !used.has(j) && deepEqual(o, v))
      if (same >= 0) {
        used.add(same)
        return node.items[same]
      }
      const value = patchNode((node.items[i] as Node | undefined) ?? null, old[i], v)
      return isNodeLike(value) ? value : doc.createNode(value)
    })
    return doc.contents
  }
  const fresh = new Document(next).contents
  if (isCollection(node) && isCollection(fresh)) fresh.flow = node.flow
  if (isScalar(node) && typeof next === 'string' && fresh instanceof Scalar) {
    if (node.type === 'QUOTE_DOUBLE' || node.type === 'QUOTE_SINGLE') fresh.type = node.type
  }
  return fresh
}

function isPlainObject(value: unknown): value is FrontmatterData {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]))
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    return (
      ka.length === Object.keys(b).length && ka.every((k) => Object.hasOwn(b, k) && deepEqual(a[k], b[k]))
    )
  }
  return false
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
