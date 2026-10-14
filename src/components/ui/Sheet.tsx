import { useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { IconButton } from './Button'
import { useModal } from './useModal'

interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  /** Extra buttons in the header, left of the close button. */
  actions?: ReactNode
  children: ReactNode
  closeLabel?: string
  /** The scrolling body, e.g. for scroll-linked UI inside. */
  bodyRef?: RefObject<HTMLDivElement | null>
}

/**
 * Side panel over the current screen (Notion's "peek"): slides in from the right, full screen on
 * phones. Same modal behaviour as {@link Dialog}.
 */
export function Sheet({
  open,
  onClose,
  title,
  actions,
  children,
  closeLabel = 'Schließen',
  bodyRef,
}: SheetProps) {
  const panel = useRef<HTMLDivElement>(null)
  useModal(panel, open, onClose)
  if (!open) return null
  return createPortal(
    <div
      className="fixed inset-0 z-40 flex justify-end bg-[rgb(10_14_20/0.22)]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // Focus the panel itself first, so opening an entry doesn't drop into its title field.
        tabIndex={-1}
        data-autofocus
        className="sheet flex outline-none h-full w-full flex-col border-l border-line bg-paper shadow-[var(--shadow-pop)] sm:w-[min(56rem,calc(100vw-4rem))]"
      >
        <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
          <p className="min-w-0 flex-1 truncate px-1.5 text-[14px] font-semibold">{title}</p>
          {actions}
          <IconButton label={closeLabel} onClick={onClose}>
            <X size={17} />
          </IconButton>
        </div>
        <div ref={bodyRef} className="relative min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  )
}
