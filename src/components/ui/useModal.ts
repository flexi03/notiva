import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'input, textarea, select, button, [href], [tabindex]:not([tabindex="-1"])'

/**
 * Shared behaviour of modal surfaces (Dialog, Sheet): focuses the first field, traps Tab inside the
 * panel, closes on Escape and restores focus when closed. Escape that was already handled by an
 * inner element (editor, menu – they call preventDefault) does not close the surface.
 */
export function useModal(panel: RefObject<HTMLElement | null>, open: boolean, onClose: () => void): void {
  // The latest onClose without re-running the effect: callers pass a new function on every render,
  // and re-running refocused (and with select-on-focus: selected) the field after each key press.
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
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
        close.current()
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
  }, [open, panel])
}
