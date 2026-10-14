import { useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { cx } from './cx'

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  /** Hide the visible heading (still announced to screen readers). */
  hideTitle?: boolean
  closeLabel?: string
  position?: 'center' | 'top'
}

const SIZES = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-3xl' }

/** Modal dialog: traps focus, closes on Escape / backdrop, restores focus on close. */
export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  hideTitle,
  closeLabel = 'Schließen',
  position = 'center',
}: DialogProps) {
  const panel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () =>
      [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((el) => !el.hasAttribute('disabled'))
    const first =
      panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea') ?? focusables()[0]
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Tab') {
        const list = focusables()
        if (list.length === 0) return
        const firstEl = list[0]!
        const lastEl = list[list.length - 1]!
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault()
          lastEl.focus()
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault()
          firstEl.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null
  return createPortal(
    <div
      className={cx(
        'fixed inset-0 z-40 flex justify-center bg-[rgb(10_14_20/0.38)] p-4',
        position === 'top' ? 'items-start pt-[12vh]' : 'items-center',
      )}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'flex max-h-[85vh] w-full flex-col overflow-hidden rounded-panel border border-line bg-surface shadow-[var(--shadow-pop)]',
          SIZES[size],
        )}
      >
        {!hideTitle && (
          <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
            <h2 className="text-base font-bold">{title}</h2>
            <IconButton label={closeLabel} size="sm" onClick={onClose}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className={cx('min-h-0 flex-1 overflow-auto', !hideTitle && 'p-4')}>{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-4 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}
