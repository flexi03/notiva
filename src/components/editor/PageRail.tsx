import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { taskProgress } from '@/lib/blocks'
import {
  layoutRail,
  railScale,
  readingProgress,
  scrollTargetFor,
  viewportBox,
  type RailItem,
} from '@/lib/minimap'
import { cx } from '@/components/ui'
import { useScrollRoot } from '@/components/layout/scrollRoot'

const MINIMAP_WIDTH = 72
/** Free space needed right of the content (incl. its padding) before the minimap is shown. */
const MINIMAP_ROOM = MINIMAP_WIDTH + 20

interface Metrics {
  items: RailItem[]
  contentHeight: number
  contentOffset: number
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  room: boolean
}

/** Reads block positions (elements with `data-rail`) relative to the content element. */
function measure(root: HTMLElement, content: HTMLElement): Metrics {
  const rootRect = root.getBoundingClientRect()
  const contentRect = content.getBoundingClientRect()
  const items: RailItem[] = [...content.querySelectorAll<HTMLElement>('[data-rail]')].map((el) => {
    const rect = el.getBoundingClientRect()
    const kind = (el.dataset.rail ?? 'text') as RailItem['kind']
    return {
      top: rect.top - contentRect.top,
      height: rect.height,
      kind,
      ...(kind === 'heading'
        ? { level: Number(el.dataset.level ?? 1), label: el.dataset.label ?? el.textContent?.trim() ?? '' }
        : {}),
    }
  })
  return {
    items,
    contentHeight: contentRect.height,
    contentOffset: contentRect.top - rootRect.top + root.scrollTop,
    scrollTop: root.scrollTop,
    scrollHeight: root.scrollHeight,
    clientHeight: root.clientHeight,
    room: rootRect.left + root.clientWidth - contentRect.right >= MINIMAP_ROOM,
  }
}

/**
 * Right edge of a page: a minimap of its blocks with the visible part highlighted like a text
 * marker, reading progress and task progress. Falls back to a slim progress bar when there is no
 * room (phones, narrow windows) or when the setting asks for it.
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
  const rootRef = useScrollRoot()
  const [m, setM] = useState<Metrics | null>(null)
  const frame = useRef(0)
  const dragging = useRef(false)
  const tasks = useMemo(() => taskProgress(body), [body])

  const update = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const root = rootRef?.current
      const content = contentRef.current
      if (root && content) setM(measure(root, content))
    })
  }, [rootRef, contentRef])

  useEffect(() => {
    const root = rootRef?.current
    const content = contentRef.current
    if (mode === 'off' || !root || !content) return
    update()
    root.addEventListener('scroll', update, { passive: true })
    const resize = new ResizeObserver(update)
    resize.observe(root)
    resize.observe(content)
    const mutations = new MutationObserver(update)
    mutations.observe(content, { childList: true, subtree: true })
    return () => {
      cancelAnimationFrame(frame.current)
      root.removeEventListener('scroll', update)
      resize.disconnect()
      mutations.disconnect()
    }
  }, [mode, rootRef, contentRef, update])

  if (mode === 'off' || !m) return null
  const percent = readingProgress(m.scrollTop, m.scrollHeight, m.clientHeight)
  const top = embedded ? 24 : 72

  if (mode === 'progress' || !m.room) {
    // A thin line under the top bar: takes no space and works on every screen width.
    return (
      <div aria-hidden className="no-print pointer-events-none absolute inset-x-0 top-0 h-full">
        <div className={cx('sticky z-10 h-0.5', embedded ? 'top-0' : 'top-12')}>
          <div className="h-full bg-accent" style={{ width: `${percent}%` }} />
        </div>
      </div>
    )
  }

  const available = Math.max(120, m.clientHeight - top - 96)
  const scale = railScale(m.contentHeight, available)
  const items = layoutRail(m.items, scale)
  const view = viewportBox(m.scrollTop, m.clientHeight, m.contentOffset, m.contentHeight, scale)
  const mapHeight = Math.max(view.top + view.height, m.contentHeight * scale)

  const scrollTo = (y: number) =>
    rootRef?.current?.scrollTo({ top: scrollTargetFor(y, scale, m.contentOffset, m.clientHeight) })
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
      className="no-print absolute inset-y-0 right-4 overflow-clip"
      style={{ width: MINIMAP_WIDTH }}
    >
      <div className="sticky space-y-2" style={{ top }}>
        <div
          className="relative cursor-pointer touch-none select-none"
          style={{ height: mapHeight }}
          onPointerDown={onPointerDown}
          onPointerMove={(e) => dragging.current && scrollTo(pointerY(e))}
          onPointerUp={() => (dragging.current = false)}
          onPointerCancel={() => (dragging.current = false)}
          data-testid="minimap"
        >
          <div aria-hidden className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-line">
            <div className="w-full rounded-full bg-accent" style={{ height: `${percent}%` }} />
          </div>
          {items.map((item, i) =>
            item.kind === 'heading' ? (
              <button
                key={i}
                type="button"
                aria-label={t('rail.jump', { title: item.label ?? '' })}
                title={item.label}
                onClick={() =>
                  rootRef?.current?.scrollTo({
                    top: Math.max(0, m.items[i]!.top + m.contentOffset - top),
                    behavior: 'smooth',
                  })
                }
                className="group absolute left-2.5 flex h-2 -translate-y-0.5 items-center"
                style={{ top: item.top, width: `${HEADING_WIDTH[item.level ?? 1] ?? 50}%` }}
              >
                <span className="h-[3px] w-full rounded-full bg-ink-2 group-hover:bg-accent group-focus-visible:bg-accent" />
              </button>
            ) : (
              <div
                key={i}
                aria-hidden
                className={cx('absolute right-0', ITEM_STYLE[item.kind])}
                style={{ top: item.top, height: item.kind === 'divider' ? 1 : item.height }}
              />
            ),
          )}
          {/* Drawn last: the visible part is "highlighted" over the blocks like a text marker. */}
          <div
            aria-hidden
            data-testid="minimap-view"
            className="pointer-events-none absolute right-0 left-1.5 rounded-[3px] bg-[color-mix(in_srgb,var(--marker)_45%,transparent)]"
            style={{ top: view.top, height: Math.max(6, view.height) }}
          />
        </div>
        <p
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-label={t('rail.progress', { percent })}
          className="pl-2.5 text-[11px] leading-none text-ink-3 tabular-nums"
        >
          {percent} %
        </p>
        {tasks.total > 0 && (
          <p
            className="pl-2.5 text-[11px] leading-tight text-ink-3 tabular-nums"
            title={t('rail.tasks', tasks)}
          >
            <span className="sr-only">{t('rail.tasks', tasks)}</span>
            <span aria-hidden>
              ✓ {tasks.done}/{tasks.total}
            </span>
            <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-sunken">
              <span
                className="block h-full rounded-full bg-marker"
                style={{ width: `${Math.round((tasks.done / tasks.total) * 100)}%` }}
              />
            </span>
          </p>
        )}
      </div>
    </nav>
  )
}

const HEADING_WIDTH: Record<number, number> = { 1: 82, 2: 68, 3: 56 }

/** Text blocks look like ruled lines, boxes like small cards. */
const ITEM_STYLE: Record<RailItem['kind'], string> = {
  heading: '',
  text: 'left-2.5 bg-[repeating-linear-gradient(to_bottom,var(--line-strong)_0_1.5px,transparent_1.5px_3.5px)] opacity-80',
  list: 'left-4 bg-[repeating-linear-gradient(to_bottom,var(--line-strong)_0_1.5px,transparent_1.5px_3.5px)] opacity-80',
  box: 'left-2.5 rounded-[2px] border border-line-strong bg-sunken',
  divider: 'left-2.5 bg-line-strong',
}
