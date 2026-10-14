/**
 * Geometry of the page rail (minimap + reading progress). Pure functions, so the component only
 * measures the DOM and draws.
 */

export interface RailItem {
  /** Offset from the top of the content in px. */
  top: number
  height: number
  kind: 'heading' | 'text' | 'list' | 'box' | 'divider'
  /** Heading level 1–6 (headings only). */
  level?: number
  label?: string
}

export interface RailBox {
  top: number
  height: number
}

/** Largest scale (≤ `max`) at which the whole content fits into `available` px. */
export function railScale(contentHeight: number, available: number, max = 0.2): number {
  if (contentHeight <= 0 || available <= 0) return max
  return Math.min(max, available / contentHeight)
}

/** Reading progress in percent: 0 at the top, 100 when scrolled to the end (or nothing to scroll). */
export function readingProgress(scrollTop: number, scrollHeight: number, clientHeight: number): number {
  const range = scrollHeight - clientHeight
  if (range <= 1) return 100
  return Math.round(Math.min(1, Math.max(0, scrollTop / range)) * 100)
}

/**
 * The visible part of the content, mapped into the minimap. `contentOffset` is where the content
 * starts inside the scroll container.
 */
export function viewportBox(
  scrollTop: number,
  clientHeight: number,
  contentOffset: number,
  contentHeight: number,
  scale: number,
): RailBox {
  const start = Math.max(0, scrollTop - contentOffset)
  const end = Math.min(contentHeight, scrollTop + clientHeight - contentOffset)
  const top = Math.min(start, contentHeight)
  return { top: top * scale, height: Math.max(0, end - top) * scale }
}

/** scrollTop that centres the content position under minimap y-coordinate `y`. */
export function scrollTargetFor(
  y: number,
  scale: number,
  contentOffset: number,
  clientHeight: number,
): number {
  return Math.max(0, y / scale + contentOffset - clientHeight / 2)
}

/** Items scaled into the minimap; tiny blocks keep a minimum height so they stay visible. */
export function layoutRail(items: RailItem[], scale: number, minHeight = 2): RailItem[] {
  return items.map((item) => ({
    ...item,
    top: item.top * scale,
    height: Math.max(minHeight, item.height * scale),
  }))
}
