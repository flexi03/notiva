import { useRef, useState } from 'react'

/** Width (or height) remembered on this device. */
export function useStoredWidth(key: string, initial: number, min: number, max: number) {
  const [width, setWidth] = useState(() => {
    try {
      const n = Number(localStorage.getItem(`notiva:size:${key}`))
      return n >= min && n <= max ? n : initial
    } catch {
      return initial
    }
  })
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const set = (value: number) => {
    const next = Math.round(Math.min(max, Math.max(min, value)))
    setWidth(next)
    // Stored once the dragging pauses, not on every pixel.
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(`notiva:size:${key}`, String(next))
      } catch {
        /* private mode */
      }
    }, 250)
  }
  return [width, set] as const
}

/**
 * Drag handle on the edge of a panel (like VS Code): drag to resize, double click resets, arrow
 * keys for the keyboard. `side` is the edge it sits on; `vertical` resizes the height instead.
 */
export function ResizeHandle({
  side,
  width,
  onResize,
  label,
  reset,
}: {
  /** where the handle sits on the resized panel ('bottom': drag down = taller) */
  side: 'left' | 'right' | 'top' | 'bottom'
  width: number
  onResize: (width: number) => void
  label: string
  reset?: number
}) {
  const vertical = side === 'top' || side === 'bottom'
  const start = (e: React.PointerEvent) => {
    e.preventDefault()
    const origin = vertical ? e.clientY : e.clientX
    const base = width
    let frame = 0
    let latest = base
    // At most one layout per frame; no width animations while dragging (smooth like VS Code).
    const move = (ev: PointerEvent) => {
      const delta = (vertical ? ev.clientY : ev.clientX) - origin
      latest = side === 'right' || side === 'bottom' ? base + delta : base - delta
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          onResize(latest)
        })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      cancelAnimationFrame(frame)
      onResize(latest)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      delete document.body.dataset.resizing
    }
    document.body.dataset.resizing = ''
    document.body.style.cursor = vertical ? 'row-resize' : 'col-resize'
    document.body.style.userSelect = 'none'
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'horizontal' : 'vertical'}
      aria-label={`${label}: Größe ändern`}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={start}
      onDoubleClick={() => reset && onResize(reset)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 40 : 10
        const grow = vertical
          ? e.key === (side === 'bottom' ? 'ArrowDown' : 'ArrowUp')
          : side === 'right'
            ? e.key === 'ArrowRight'
            : e.key === 'ArrowLeft'
        const shrink = vertical
          ? e.key === (side === 'bottom' ? 'ArrowUp' : 'ArrowDown')
          : side === 'right'
            ? e.key === 'ArrowLeft'
            : e.key === 'ArrowRight'
        if (grow) onResize(width + step)
        else if (shrink) onResize(width - step)
        else return
        e.preventDefault()
      }}
      className={
        vertical
          ? `absolute inset-x-0 ${side === 'bottom' ? '-bottom-1' : '-top-1'} z-10 h-2 cursor-row-resize hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none`
          : `absolute inset-y-0 ${side === 'left' ? '-left-1' : '-right-1'} z-10 w-2 cursor-col-resize hover:bg-accent/30 focus-visible:bg-accent/40 focus-visible:outline-none`
      }
    />
  )
}
