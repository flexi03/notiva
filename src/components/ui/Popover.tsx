import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cx } from './cx'

interface PopoverProps {
  anchor: RefObject<HTMLElement | null>
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  align?: 'start' | 'end'
  /** Accessible label for the dialog-like panel. */
  label?: string
}

/**
 * Floating panel anchored to an element. Positions itself inside the viewport (flips upwards
 * when there is no room below), closes on outside click and Escape, and returns focus.
 */
export function Popover({
  anchor,
  open,
  onClose,
  children,
  className,
  align = 'start',
  label,
}: PopoverProps) {
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !anchor.current || !panel.current) return
    const place = () => {
      const a = anchor.current!.getBoundingClientRect()
      const p = panel.current!.getBoundingClientRect()
      const margin = 8
      const below = window.innerHeight - a.bottom - margin
      const above = a.top - margin
      const openUp = below < Math.min(p.height, 280) && above > below
      const maxHeight = Math.max(160, (openUp ? above : below) - 4)
      const top = openUp ? Math.max(margin, a.top - Math.min(p.height, maxHeight) - 4) : a.bottom + 4
      let left = align === 'end' ? a.right - p.width : a.left
      left = Math.max(margin, Math.min(left, window.innerWidth - p.width - margin))
      setPos({ top, left, maxHeight })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, anchor, align])

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = panel.current
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (panel.current?.contains(target) || anchor.current?.contains(target)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
      if (previous && document.contains(previous) && node?.contains(document.activeElement)) previous.focus()
    }
  }, [open, onClose, anchor])

  if (!open) return null
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      className={cx(
        'fixed z-50 min-w-48 overflow-auto rounded-panel border border-line bg-surface p-1 text-sm shadow-[var(--shadow-pop)]',
        className,
      )}
      style={pos ? { top: pos.top, left: pos.left, maxHeight: pos.maxHeight } : { top: -9999, left: -9999 }}
    >
      {children}
    </div>,
    document.body,
  )
}

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: string
}

/** Vertical list of actions with arrow-key navigation. */
export function MenuList({ items, onDone }: { items: Array<MenuItem | 'divider'>; onDone?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = buttons[(index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]
    next?.focus()
  }
  return (
    <div ref={ref} role="menu" onKeyDown={onKeyDown}>
      {items.map((item, i) =>
        item === 'divider' ? (
          <div key={`d${i}`} className="my-1 border-t border-line" role="separator" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onSelect()
              onDone?.()
            }}
            className={cx(
              'flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left hover:bg-hover focus:bg-hover focus:outline-none disabled:opacity-40',
              item.danger ? 'text-danger' : 'text-ink',
            )}
          >
            {item.icon && (
              <span className="flex size-4 items-center justify-center text-ink-2">{item.icon}</span>
            )}
            <span className="flex-1 truncate">{item.label}</span>
            {item.hint && <span className="text-xs text-ink-3">{item.hint}</span>}
          </button>
        ),
      )}
    </div>
  )
}

/** Button + popover menu in one. */
export function useDisclosure(initial = false) {
  const [open, setOpen] = useState(initial)
  return { open, setOpen, toggle: () => setOpen((o) => !o), close: () => setOpen(false) }
}
