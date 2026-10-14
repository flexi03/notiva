import type { ReactNode } from 'react'
import { cx } from './cx'

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center text-ink-2">
      {icon && <div className="text-ink-3">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {children && <div className="max-w-sm text-sm">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-sunken px-1.5 py-px font-code text-[11px] text-ink-2">
      {children}
    </kbd>
  )
}

export function Spinner({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex items-center justify-center p-8">
      <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
    </div>
  )
}

/** Small heading for sidebar sections and panels (sentence case, no all-caps). */
export function SectionLabel({
  children,
  className,
  action,
}: {
  children: ReactNode
  className?: string
  action?: ReactNode
}) {
  return (
    <div
      className={cx(
        'flex items-center justify-between px-2 pt-4 pb-1 text-xs font-semibold text-ink-3',
        className,
      )}
    >
      <span>{children}</span>
      {action}
    </div>
  )
}

/** Horizontal marker-style progress bar – the app's signature element. */
export function MarkerBar({ percent, label }: { percent: number; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      className="h-2.5 w-full overflow-hidden rounded-full bg-sunken"
    >
      <div
        className="h-full rounded-full bg-marker transition-[width] duration-500"
        style={{ width: `${percent}%` }}
      />
    </div>
  )
}
