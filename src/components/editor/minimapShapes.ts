/**
 * Samples what a page looks like – text lines, headings, links, highlights, code, tiles, cards,
 * checkboxes, git changes – as rectangles relative to the content element. The minimap paints
 * them scaled down, like the minimap in a code editor.
 */

export type ShapeKind =
  | 'text'
  | 'heading'
  | 'link'
  | 'mark'
  | 'code'
  | 'muted'
  | 'box'
  | 'callout'
  | 'image'
  | 'check'
  | 'checked'
  | 'rule'
  | 'added'
  | 'modified'
  | 'deleted'

export interface Shape {
  x: number
  y: number
  w: number
  h: number
  kind: ShapeKind
}

const BOXES = '.tile, article, pre, table, img, details, .widget-error, [role="alert"]'
const MAX_SHAPES = 6000

function textKind(el: Element): ShapeKind {
  if (el.closest('h1, h2, h3, h4, h5, h6, .callout-title')) return 'heading'
  if (el.closest('mark')) return 'mark'
  if (el.closest('a, .wikilink, .tag')) return 'link'
  if (el.closest('code, pre')) return 'code'
  if (el.closest('del, s, .text-ink-3')) return 'muted'
  const task = el.closest('li')?.querySelector(':scope > input[type="checkbox"]') as HTMLInputElement | null
  if (task?.checked) return 'muted'
  return 'text'
}

/** Text fields (title, block being edited): estimate their lines from the value. */
function fieldShapes(field: HTMLInputElement | HTMLTextAreaElement, base: DOMRect, out: Shape[]): void {
  const rect = field.getBoundingClientRect()
  const style = getComputedStyle(field)
  const size = parseFloat(style.fontSize) || 16
  const lineHeight = parseFloat(style.lineHeight) || size * 1.5
  const charWidth = size * 0.52
  const lines = field.value.split('\n')
  const kind: ShapeKind = field.tagName === 'INPUT' ? 'heading' : 'text'
  let y = rect.top - base.top + (field.tagName === 'INPUT' ? (rect.height - lineHeight) / 2 : 0)
  for (const line of lines) {
    const width = Math.min(rect.width, line.trimEnd().length * charWidth)
    if (width > 0) out.push({ x: rect.left - base.left, y, w: width, h: lineHeight, kind })
    y += lineHeight
  }
}

export function sampleShapes(content: HTMLElement): Shape[] {
  const base = content.getBoundingClientRect()
  const out: Shape[] = []
  const add = (rect: DOMRect, kind: ShapeKind) => {
    if (rect.width <= 0 || rect.height <= 0) return
    out.push({ x: rect.left - base.left, y: rect.top - base.top, w: rect.width, h: rect.height, kind })
  }

  // Containers first, so text is painted on top of them.
  for (const el of content.querySelectorAll<HTMLElement>(BOXES))
    add(el.getBoundingClientRect(), el.tagName === 'IMG' ? 'image' : 'box')
  for (const el of content.querySelectorAll<HTMLElement>('blockquote.callout'))
    add(el.getBoundingClientRect(), 'callout')
  for (const el of content.querySelectorAll<HTMLElement>('hr')) add(el.getBoundingClientRect(), 'rule')

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (!node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT
      const parent = node.parentElement
      if (!parent || parent.closest('.sr-only, [aria-hidden="true"], .no-print button svg, .katex-mathml'))
        return NodeFilter.FILTER_REJECT
      return NodeFilter.FILTER_ACCEPT
    },
  })
  const range = document.createRange()
  for (let node = walker.nextNode(); node && out.length < MAX_SHAPES; node = walker.nextNode()) {
    range.selectNodeContents(node)
    const kind = textKind(node.parentElement!)
    for (const rect of range.getClientRects()) add(rect, kind)
  }

  for (const field of content.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('h1 input, textarea'))
    fieldShapes(field, base, out)

  for (const box of content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))
    add(box.getBoundingClientRect(), box.checked ? 'checked' : 'check')

  // Git change markers (set by the block editor).
  for (const el of content.querySelectorAll<HTMLElement>('[data-change]')) {
    const rect = el.getBoundingClientRect()
    const kind = el.dataset.change as 'added' | 'modified' | 'deleted'
    out.push({
      x: 0,
      y: rect.top - base.top,
      w: 0,
      h: kind === 'deleted' ? 0 : rect.height,
      kind,
    })
  }
  return out
}

export interface Palette {
  text: string
  heading: string
  link: string
  mark: string
  code: string
  muted: string
  boxFill: string
  boxLine: string
  callout: string
  added: string
  modified: string
  deleted: string
}

export function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    text: v('--ink-2'),
    heading: v('--ink'),
    link: v('--accent'),
    mark: v('--marker'),
    code: v('--opt-purple-ink') || v('--ink-2'),
    muted: v('--line-strong'),
    boxFill: v('--sunken'),
    boxLine: v('--line-strong'),
    callout: v('--accent-soft') || v('--sunken'),
    added: v('--git-added') || '#3f9b5a',
    modified: v('--git-modified') || '#3b7dd8',
    deleted: v('--git-deleted') || '#c8463b',
  }
}

/**
 * Paints shapes scaled by (sx, sy). Text lines become thin bars like a code minimap; the left
 * 3 px column carries git change markers.
 */
export function paintShapes(
  ctx: CanvasRenderingContext2D,
  shapes: Shape[],
  sx: number,
  sy: number,
  width: number,
  palette: Palette,
): void {
  const gutter = 4
  for (const s of shapes) {
    const x = gutter + s.x * sx
    const y = s.y * sy
    const w = Math.max(1, s.w * sx)
    const h = s.h * sy
    switch (s.kind) {
      case 'box':
      case 'image':
        ctx.fillStyle = palette.boxFill
        ctx.fillRect(x, y, w, Math.max(1, h))
        ctx.strokeStyle = palette.boxLine
        ctx.lineWidth = 0.5
        ctx.strokeRect(x + 0.25, y + 0.25, w - 0.5, Math.max(0.5, h - 0.5))
        break
      case 'callout':
        ctx.fillStyle = palette.callout
        ctx.fillRect(x, y, w, Math.max(1, h))
        break
      case 'rule':
        ctx.fillStyle = palette.boxLine
        ctx.fillRect(x, y, w, 0.75)
        break
      case 'check':
      case 'checked': {
        const size = Math.max(1.5, Math.min(h, s.w * sx))
        ctx.strokeStyle = s.kind === 'checked' ? palette.link : palette.text
        ctx.lineWidth = 0.75
        ctx.strokeRect(x, y, size, size)
        if (s.kind === 'checked') {
          ctx.fillStyle = palette.link
          ctx.fillRect(x, y, size, size)
        }
        break
      }
      case 'added':
      case 'modified':
        ctx.fillStyle = palette[s.kind]
        ctx.fillRect(0, y, 2.5, Math.max(1.5, h))
        break
      case 'deleted':
        ctx.fillStyle = palette.deleted
        ctx.beginPath()
        ctx.moveTo(0, y - 2)
        ctx.lineTo(3, y)
        ctx.lineTo(0, y + 2)
        ctx.fill()
        break
      default: {
        // A line of text: a bar a bit thinner than the line, vertically centred.
        const bar = Math.max(1, h * (s.kind === 'heading' ? 0.62 : 0.45))
        if (s.kind === 'mark') {
          ctx.fillStyle = palette.mark
          ctx.fillRect(x, y, w, Math.max(1, h * 0.8))
        }
        ctx.globalAlpha = s.kind === 'text' ? 0.55 : s.kind === 'muted' ? 0.9 : 1
        ctx.fillStyle =
          s.kind === 'heading'
            ? palette.heading
            : s.kind === 'link'
              ? palette.link
              : s.kind === 'code'
                ? palette.code
                : s.kind === 'muted'
                  ? palette.muted
                  : palette.text
        ctx.fillRect(x, y + (h - bar) / 2, Math.min(w, width - x), bar)
        ctx.globalAlpha = 1
      }
    }
  }
}
