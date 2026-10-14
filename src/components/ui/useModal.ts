import { useEffect, type RefObject } from 'react'

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'

/**
 * Shared behaviour of modal surfaces (Dialog, Sheet): focuses the first field, traps Tab inside the
 * panel, closes on Escape and restores focus when closed. Escape that was already handled by an
 * inner element (editor, menu – they call preventDefault) does not close the surface.
 */
export function useModal(panel: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const focusables = () =>
      [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
        (el) => !el.hasAttribute('disabled') && !el.closest('[inert]'),
      )
    const first = panel.current?.hasAttribute('data-autofocus')
      ? panel.current
      : (panel.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea') ?? focusables()[0])
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
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
      if (previous && document.contains(previous)) previous.focus()
    }
  }, [open, onClose, panel])
}
