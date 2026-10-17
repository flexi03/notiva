/**
 * Annotations of a PDF live in a Markdown page next to it – the PDF itself stays untouched:
 *
 *   Unterlagen/LA/vl01.pdf
 *   Unterlagen/LA/vl01 (Notizen).md   ← frontmatter `pdf:` + `annotations:`, body = notes per page
 *
 * Highlights, sticky notes and ink are stored in PDF points (unscaled, origin top left), so they
 * fit any zoom. Page notes are plain Markdown sections "## Seite N" – readable everywhere, found by
 * search and the AI.
 */
import type { FrontmatterData, FrontmatterValue } from './frontmatter'
import { basename, dirname, joinPath } from './path'

export const ANNOTATION_COLORS = ['yellow', 'green', 'blue', 'pink', 'red'] as const
export type AnnotationColor = (typeof ANNOTATION_COLORS)[number]

export type Rect = [x: number, y: number, w: number, h: number]

export type Annotation =
  | {
      id: string
      type: 'highlight'
      page: number
      rects: Rect[]
      color: AnnotationColor
      text?: string
      comment?: string
    }
  | { id: string; type: 'note'; page: number; x: number; y: number; text: string; color: AnnotationColor }
  | {
      id: string
      type: 'ink'
      page: number
      color: AnnotationColor
      width: number
      points: Array<[number, number]>
    }
  /** Text written directly onto the page (x/y = top left, w = box width, size = font size in pt). */
  | {
      id: string
      type: 'text'
      page: number
      x: number
      y: number
      w: number
      size: number
      text: string
      color: AnnotationColor
    }

export function notesPathFor(pdfPath: string): string {
  return joinPath(dirname(pdfPath), `${basename(pdfPath).replace(/\.pdf$/i, '')} (Notizen).md`)
}

export function newAnnotationId(): string {
  return `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
const color = (v: unknown): AnnotationColor =>
  ANNOTATION_COLORS.includes(v as AnnotationColor) ? (v as AnnotationColor) : 'yellow'
const text = (v: unknown, max = 5000) => (typeof v === 'string' ? v.slice(0, max) : undefined)

/** Ink is stored compactly as "x,y x,y …". */
function parsePoints(v: unknown): Array<[number, number]> {
  if (typeof v !== 'string') return []
  return v
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(',').map(Number) as [number, number])
    .filter((p) => p.length === 2 && p.every(Number.isFinite))
    .slice(0, 5000)
}

/** Reads annotations from the notes page's frontmatter (untrusted: skips what doesn't fit). */
export function parseAnnotations(raw: unknown): Annotation[] {
  if (!Array.isArray(raw)) return []
  const out: Annotation[] = []
  for (const a of raw.slice(0, 5000)) {
    if (typeof a !== 'object' || a === null) continue
    const r = a as Record<string, unknown>
    const id = text(r.id, 40)
    const page = num(r.page)
    if (!id || !page || page < 1) continue
    if (r.type === 'highlight' && Array.isArray(r.rects)) {
      const rects = r.rects
        .filter((x): x is unknown[] => Array.isArray(x) && x.length === 4)
        .map((x) => x.map(num))
        .filter((x): x is Rect => x.every((v) => v !== null))
      if (!rects.length) continue
      const t = text(r.text)
      const comment = text(r.comment)
      out.push({
        id,
        type: 'highlight',
        page,
        rects,
        color: color(r.color),
        ...(t ? { text: t } : {}),
        ...(comment ? { comment } : {}),
      })
    } else if (r.type === 'note') {
      const x = num(r.x)
      const y = num(r.y)
      if (x === null || y === null) continue
      out.push({ id, type: 'note', page, x, y, text: text(r.text) ?? '', color: color(r.color) })
    } else if (r.type === 'text') {
      const x = num(r.x)
      const y = num(r.y)
      const t = text(r.text)
      if (x === null || y === null || !t) continue
      out.push({
        id,
        type: 'text',
        page,
        x,
        y,
        w: Math.min(800, Math.max(40, num(r.w) ?? 220)),
        size: Math.min(48, Math.max(6, num(r.size) ?? 12)),
        text: t,
        color: color(r.color),
      })
    } else if (r.type === 'ink') {
      const points = parsePoints(r.points)
      if (points.length < 2) continue
      out.push({
        id,
        type: 'ink',
        page,
        color: color(r.color),
        width: Math.min(20, Math.max(0.5, num(r.width) ?? 2)),
        points,
      })
    }
  }
  return out
}

export function serializeAnnotations(list: Annotation[]): FrontmatterValue {
  return list.map((a) => {
    if (a.type === 'ink')
      return {
        id: a.id,
        type: a.type,
        page: a.page,
        color: a.color,
        width: a.width,
        points: a.points.map(([x, y]) => `${round(x)},${round(y)}`).join(' '),
      }
    if (a.type === 'highlight')
      return {
        id: a.id,
        type: a.type,
        page: a.page,
        color: a.color,
        rects: a.rects.map((r) => r.map(round)),
        ...(a.text ? { text: a.text } : {}),
        ...(a.comment ? { comment: a.comment } : {}),
      }
    return {
      id: a.id,
      type: a.type,
      page: a.page,
      color: a.color,
      x: round(a.x),
      y: round(a.y),
      // Text on the page keeps its box width and font size.
      ...(a.type === 'text' ? { w: round(a.w), size: round(a.size) } : {}),
      text: a.text,
    }
  }) as unknown as FrontmatterValue
}

const round = (v: number) => Math.round(v * 10) / 10

/** Frontmatter for a new notes page. */
export function notesPageData(pdfPath: string): FrontmatterData {
  return { pdf: basename(pdfPath), icon: '📝', annotations: [] }
}

/**
 * Merges selection rectangles of one line into one (browsers return one rect per text span) and
 * drops tiny or duplicate ones.
 */
export function mergeRects(rects: Rect[]): Rect[] {
  const sorted = rects.filter(([, , w, h]) => w > 0.5 && h > 0.5).sort((a, b) => a[1] - b[1] || a[0] - b[0])
  const out: Rect[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    const sameLine = last && Math.abs(last[1] - r[1]) < Math.min(last[3], r[3]) * 0.5
    if (last && sameLine && r[0] <= last[0] + last[2] + 4) {
      const x = Math.min(last[0], r[0])
      const right = Math.max(last[0] + last[2], r[0] + r[2])
      const y = Math.min(last[1], r[1])
      const bottom = Math.max(last[1] + last[3], r[1] + r[3])
      out[out.length - 1] = [x, y, right - x, bottom - y]
    } else out.push(r)
  }
  return out.map((r) => r.map(round) as Rect)
}

/* ---------- page notes in the body ("## Seite N") ---------- */

const HEADING = /^## (?:Seite|Page) (\d+)\s*$/

/** Splits the body into its intro and the sections per page. */
function sections(body: string): { intro: string; pages: Map<number, string> } {
  const lines = body.split('\n')
  const pages = new Map<number, string>()
  let current: number | null = null
  const intro: string[] = []
  let buffer: string[] = []
  const flush = () => {
    if (current !== null) pages.set(current, buffer.join('\n').trim())
    buffer = []
  }
  for (const line of lines) {
    const m = HEADING.exec(line)
    if (m) {
      flush()
      current = Number(m[1])
    } else if (current === null) intro.push(line)
    else buffer.push(line)
  }
  flush()
  return { intro: intro.join('\n').trim(), pages }
}

export function pageNote(body: string, page: number): string {
  return sections(body).pages.get(page) ?? ''
}

export function notedPages(body: string): number[] {
  return [...sections(body).pages].filter(([, text]) => text).map(([n]) => n)
}

/** Sets the note of one page; sections stay sorted by page, empty ones disappear. */
export function setPageNote(body: string, page: number, note: string, heading = 'Seite'): string {
  const { intro, pages } = sections(body)
  pages.set(page, note.trim())
  const parts = [
    intro,
    ...[...pages]
      .filter(([, t]) => t)
      .sort(([a], [b]) => a - b)
      .map(([n, t]) => `## ${heading} ${n}\n\n${t}`),
  ]
  const out = parts.filter(Boolean).join('\n\n')
  return out ? `${out}\n` : ''
}
