import type { ReactNode } from 'react'
import type { Color } from '@/lib/database'
import { cx } from './cx'

/** Colored pill for select options and tags. */
export function Chip({
  color = 'gray',
  children,
  className,
  onRemove,
  removeLabel,
}: {
  color?: Color
  children: ReactNode
  className?: string
  onRemove?: () => void
  removeLabel?: string
}) {
  return (
    <span
      className={cx(
        'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-px text-[12.5px] leading-5 font-medium',
        className,
      )}
      style={{ background: `var(--opt-${color})`, color: `var(--opt-${color}-ink)` }}
    >
      <span className="truncate">{children}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-mr-1 rounded-full px-1 opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  )
}
