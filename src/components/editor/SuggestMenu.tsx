import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '@/components/ui'
import { scrollIntoContainer } from '@/lib/scroll'

export interface Suggestion {
  id: string
  label: string
  detail?: string
  icon?: ReactNode
}

interface SuggestMenuProps {
  /** Element to position below (the textarea). */
  anchor: HTMLElement | null
  items: Suggestion[]
  active: number
  onPick: (item: Suggestion) => void
  onHover: (index: number) => void
  empty: string
  label: string
}

/** Floating list for "/" commands and "[[" link completion. Keyboard handled by the editor. */
export function SuggestMenu({ anchor, items, active, onPick, onHover, empty, label }: SuggestMenuProps) {
  const list = useRef<HTMLDivElement>(null)
  useEffect(() => {
    scrollIntoContainer(list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`))
  }, [active])
  if (!anchor) return null
  const rect = anchor.getBoundingClientRect()
  const height = 300
  const below = window.innerHeight - rect.bottom > height + 16
  const style = {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
    ...(below ? { top: rect.bottom + 4 } : { bottom: window.innerHeight - rect.top + 4 }),
  }
  return createPortal(
    <div
      ref={list}
      role="listbox"
      aria-label={label}
      className="fixed z-50 max-h-[300px] w-72 overflow-auto rounded-panel border border-line bg-surface p-1 text-sm shadow-[var(--shadow-pop)]"
      style={style}
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 && <div className="px-2 py-1.5 text-ink-3">{empty}</div>}
      {items.map((item, i) => (
        <div
          key={item.id}
          role="option"
          aria-selected={i === active}
          data-index={i}
          onMouseEnter={() => onHover(i)}
          onClick={() => onPick(item)}
          className={cx(
            'flex cursor-pointer items-center gap-2.5 rounded-[5px] px-2 py-1.5',
            i === active && 'bg-hover',
          )}
        >
          {item.icon && (
            <span className="flex size-7 items-center justify-center rounded-control border border-line bg-paper text-ink-2">
              {item.icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-ink">{item.label}</span>
            {item.detail && <span className="block truncate text-xs text-ink-3">{item.detail}</span>}
          </span>
        </div>
      ))}
    </div>,
    document.body,
  )
}
