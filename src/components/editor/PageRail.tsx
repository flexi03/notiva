import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { taskProgress } from '@/lib/blocks'
import { railScale, readingProgress, scrollTargetFor, viewportBox } from '@/lib/minimap'
import { cx } from '@/components/ui'
import { useScrollRoot } from '@/components/layout/scrollRoot'
import { paintShapes, readPalette, sampleShapes, type Shape } from './minimapShapes'

export const MINIMAP_WIDTH = 96
/** Free space needed right of the content (incl. its padding) before the minimap is shown. */
const MINIMAP_ROOM = MINIMAP_WIDTH + 20

interface Heading {
  top: number
  label: string
}

/** Expensive part (DOM sampling) – only after resizes and content changes. */
interface Layout {
  shapes: Shape[]
  headings: Heading[]
  contentWidth: number
  contentHeight: number
  contentOffset: number
  clientHeight: number
  room: boolean
}

/** Cheap part – on every scroll. */
interface ScrollState {
  scrollTop: number
  scrollHeight: number
}

function measureLayout(root: HTMLElement, content: HTMLElement): Layout {
  const rootRect = root.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()
  const room = rootRect.left + root.clientWidth - contentRect.right >= MINIMAP_ROOM
  return {
    shapes: room ? sampleShapes(content) : [],
    headings: [...content.querySelectorAll<HTMLElement>('[data-rail="heading"]')].map((el) => ({
      top: el.getBoundingClientRect().top - contentRect.top,
      label: el.dataset.label ?? el.textContent?.trim() ?? '',
    })),
    contentWidth: contentRect.width,
    contentHeight: contentRect.height,
    contentOffset: contentRect.top - rootRect.top + root.scrollTop,
    clientHeight: root.clientHeight,
    room,
  }
}

/**
 * Right edge of a page: a minimap that shows the page like a code editor does – every text line,
 * heading, link, highlight, tile, checkbox and git change – with the visible part highlighted like
 * a text marker, plus reading and task progress. Falls back to a slim progress line when there is
 * no room (phones, narrow windows) or when the setting asks for it.
 */
export function PageRail({
  contentRef,
  body,
  embedded,
}: {
  contentRef: RefObject<HTMLElement | null>
  body: string
  embedded?: boolean
}) {
  const mode = useApp((s) => s.settings.pageRail)
  const theme = useApp((s) => `${s.settings.theme}|${s.settings.accent}|${s.settings.marker}`)
  const rootRef = useScrollRoot()
  const [layout, setLayout] = useState<Layout | null>(null)
  const [scroll, setScroll] = useState<ScrollState>({ scrollTop: 0, scrollHeight: 0 })
  const canvas = useRef<HTMLCanvasElement>(null)
  const layoutTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const frame = useRef(0)
  const dragging = useRef(false)
  const tasks = useMemo(() => taskProgress(body), [body])

  const relayout = useCallback(() => {
    clearTimeout(layoutTimer.current)
    layoutTimer.current = setTimeout(() => {
      const root = rootRef?.current
      const content = contentRef.current
      if (!root || !content) return
      setLayout(measureLayout(root, content))
      setScroll({ scrollTop: root.scrollTop, scrollHeight: root.scrollHeight })
    }, 120)
  }, [rootRef, contentRef])

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const root = rootRef?.current
      if (root) setScroll({ scrollTop: root.scrollTop, scrollHeight: root.scrollHeight })
    })
  }, [rootRef])

  useEffect(() => {
    const root = rootRef?.current
    const content = contentRef.current
    if (mode === 'off' || !root || !content) return
    relayout()
    root.addEventListener('scroll', onScroll, { passive: true })
    const resize = new ResizeObserver(relayout)
    resize.observe(root)
    resize.observe(content)
    const mutations = new MutationObserver(relayout)
    mutations.observe(content, {
      childList: true,
      subtree: true,
      characterData: true,
      attributeFilter: ['data-change', 'checked'],
    })
    content.addEventListener('input', relayout)
    return () => {
      clearTimeout(layoutTimer.current)
      cancelAnimationFrame(frame.current)
      root.removeEventListener('scroll', onScroll)
      content.removeEventListener('input', relayout)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [mode, rootRef, contentRef, relayout, onScroll])

  const top = embedded ? 24 : 72
  const showMap = mode === 'minimap' && layout?.room === true
  const available = layout ? Math.max(120, layout.clientHeight - top - 96) : 0
  const scale = layout ? railScale(layout.contentHeight, available, 0.16) : 0
  const mapHeight = layout ? Math.ceil(layout.contentHeight * scale) : 0

  // Paint the page into the canvas whenever the layout or the colours change.
  useEffect(() => {
    const el = canvas.current
    if (!showMap || !el || !layout) return
    const dpr = window.devicePixelRatio || 1
    el.width = Math.round(MINIMAP_WIDTH * dpr)
    el.height = Math.max(1, Math.round(mapHeight * dpr))
    const ctx = el.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, MINIMAP_WIDTH, mapHeight)
    const sx = (MINIMAP_WIDTH - 6) / Math.max(1, layout.contentWidth)
    paintShapes(ctx, layout.shapes, sx, scale, MINIMAP_WIDTH, readPalette())
  }, [showMap, layout, scale, mapHeight, theme])

  if (mode === 'off' || !layout) return null
  const clientHeight = layout.clientHeight
  const percent = readingProgress(scroll.scrollTop, scroll.scrollHeight, clientHeight)

  if (!showMap) {
    // A thin line under the top bar: takes no space and works on every screen width.
    return (
      <div aria-hidden className="no-print pointer-events-none absolute inset-x-0 top-0 h-full">
        <div className={cx('sticky z-10 h-0.5', embedded ? 'top-0' : 'top-12')}>
          <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }

  const view = viewportBox(scroll.scrollTop, clientHeight, layout.contentOffset, layout.contentHeight, scale)
  const scrollTo = (y: number) =>
    rootRef?.current?.scrollTo({ top: scrollTargetFor(y, scale, layout.contentOffset, clientHeight) })
  const pointerY = (e: PointerEvent<HTMLDivElement>) =>
    e.clientY - e.currentTarget.getBoundingClientRect().top
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button')) return
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    scrollTo(pointerY(e))
  }

  return (
    <nav
      aria-label={t('rail.label')}
      className="no-print absolute inset-y-0 right-3 overflow-clip"
      style={{ width: MINIMAP_WIDTH }}
    >
      <div className="sticky space-y-2" style={{ top }}>
        <div className="space-y-1.5 pl-1">
          <p
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t('rail.progress', { percent })}
            className="flex items-center gap-1.5 text-[11px] leading-none text-ink-3 tabular-nums"
          >
            <span aria-hidden className="block h-1 flex-1 overflow-hidden rounded-full bg-sunken">
              <span className="block h-full rounded-full bg-accent" style={{ width: `${percent}%` }} />
            </span>
            {percent} %
          </p>
          {tasks.total > 0 && (
            <p
              className="flex items-center gap-1.5 text-[11px] leading-none text-ink-3 tabular-nums"
              title={t('rail.tasks', tasks)}
            >
              <span className="sr-only">{t('rail.tasks', tasks)}</span>
              <span aria-hidden className="block h-1 flex-1 overflow-hidden rounded-full bg-sunken">
                <span
                  className="block h-full rounded-full bg-marker"
                  style={{ width: `${Math.round((tasks.done / tasks.total) * 100)}%` }}
                />
              </span>
              <span aria-hidden>
                ✓ {tasks.done}/{tasks.total}
              </span>
            </p>
          )}
        </div>
        <div
          className="relative cursor-pointer touch-none select-none"
          style={{ height: Math.max(mapHeight, view.top + view.height) }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => dragging.current && scrollTo(pointerY(e))}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          data-testid="minimap"
        >
          <canvas
            ref={canvas}
            aria-hidden
            className="absolute top-0 left-0"
            style={{ width: MINIMAP_WIDTH, height: mapHeight }}
          />
          {/* The visible part, "highlighted" like a text marker. */}
          <div
            aria-hidden
            data-testid="minimap-view"
            className="pointer-events-none absolute inset-x-0 rounded-[3px] border border-[color-mix(in_srgb,var(--marker)_75%,var(--ink))] bg-[color-mix(in_srgb,var(--marker)_28%,transparent)]"
            style={{ top: view.top, height: Math.max(6, view.height) }}
          />
          {/* Headings stay reachable by keyboard and screen readers. */}
          {layout.headings.map((h, i) => (
            <button
              key={i}
              type="button"
              aria-label={t('rail.jump', { title: h.label })}
              title={h.label}
              onClick={() =>
                rootRef?.current?.scrollTo({
                  top: Math.max(0, h.top + layout.contentOffset - top),
                  behavior: 'smooth',
                })
              }
              className="absolute right-0 left-0 h-2.5 -translate-y-1/2 rounded-[2px] hover:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)] focus-visible:bg-[color-mix(in_srgb,var(--accent)_22%,transparent)]"
              style={{ top: h.top * scale + 4 }}
            />
          ))}
        </div>
      </div>
    </nav>
  )
}
