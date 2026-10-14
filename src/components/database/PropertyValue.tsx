import { Check, ExternalLink } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { formatValue, optionColor, type PropertyDef } from '@/lib/database'
import type { FormulaValue } from '@/lib/formula'
import { Chip, cx } from '@/components/ui'

/** Read-only display of one property value, consistent across all views. */
export function PropertyValue({
  def,
  value,
  compact,
}: {
  def: PropertyDef
  value: FormulaValue | undefined
  compact?: boolean
}) {
  const ws = useWorkspace()
  const openEntry = useApp((s) => s.openEntry)
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) {
    return def.type === 'checkbox' ? <CheckMark checked={false} /> : null
  }
  switch (def.type) {
    case 'select':
      return <Chip color={optionColor(def, String(value))}>{String(value)}</Chip>
    case 'multiSelect':
      return (
        <span className={cx('flex gap-1', compact ? 'flex-nowrap overflow-hidden' : 'flex-wrap')}>
          {(value as FormulaValue[]).map((v) => (
            <Chip key={String(v)} color={optionColor(def, String(v))}>
              {String(v)}
            </Chip>
          ))}
        </span>
      )
    case 'checkbox':
      return <CheckMark checked={value === true} />
    case 'relation':
      return (
        <span className={cx('flex gap-1', compact ? 'flex-nowrap overflow-hidden' : 'flex-wrap')}>
          {(value as string[]).map((target) => {
            const path = ws.resolveLink(target)
            const page = path ? ws.get(path) : undefined
            return (
              <button
                key={target}
                type="button"
                data-interactive
                onClick={(e) => {
                  e.stopPropagation()
                  if (path) openEntry(path, e)
                }}
                className={cx(
                  'inline-flex max-w-full items-center gap-1 truncate rounded-[5px] px-1.5 text-[13px] hover:bg-hover',
                  path ? 'text-ink underline decoration-line-strong underline-offset-2' : 'text-ink-3',
                )}
              >
                {page?.icon && <span>{page.icon}</span>}
                <span className="truncate">{page?.title ?? target}</span>
              </button>
            )
          })}
        </span>
      )
    case 'url':
      return (
        <a
          href={/^https?:\/\//i.test(String(value)) ? String(value) : `https://${String(value)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-interactive
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full items-center gap-1 truncate text-accent underline underline-offset-2"
        >
          <span className="truncate">{String(value).replace(/^https?:\/\//, '')}</span>
          <ExternalLink size={12} className="shrink-0" />
        </a>
      )
    case 'email':
      return (
        <a
          href={`mailto:${String(value)}`}
          data-interactive
          onClick={(e) => e.stopPropagation()}
          className="truncate text-accent underline underline-offset-2"
        >
          {String(value)}
        </a>
      )
    case 'number':
    case 'rollup':
    case 'formula':
      return (
        <span className={cx('truncate', typeof value === 'number' && 'tabular-nums')}>
          {typeof value === 'boolean' ? (value ? '✓' : '–') : formatValue(def, value)}
        </span>
      )
    default:
      return <span className="truncate">{formatValue(def, value)}</span>
  }
}

function CheckMark({ checked }: { checked: boolean }) {
  return (
    <span
      aria-label={checked ? 'Ja' : 'Nein'}
      className={cx(
        'inline-flex size-4 items-center justify-center rounded-[4px] border',
        checked ? 'border-accent bg-accent text-on-accent' : 'border-line-strong',
      )}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </span>
  )
}
