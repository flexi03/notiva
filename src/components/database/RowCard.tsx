import type { DragEvent } from 'react'
import { toPlainText } from '@/lib/markdown'
import type { ResolvedRow } from '@/lib/database'
import { cx } from '@/components/ui'
import { PropertyValue } from './PropertyValue'
import type { DatabaseApi } from './useDatabase'

/** Card used by board and gallery – same look, different layout around it. */
export function RowCard({
  db,
  row,
  variant,
  draggable,
}: {
  db: DatabaseApi
  row: ResolvedRow
  variant: 'board' | 'gallery'
  draggable?: boolean
}) {
  const page = db.ws.get(row.row.path)
  const preview = variant === 'gallery' ? toPlainText(row.row.body).slice(0, 140) : ''
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('application/x-notiva-row', row.row.path)
    e.dataTransfer.effectAllowed = 'move'
  }
  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      className={cx(
        'group flex flex-col rounded-panel border border-line bg-surface text-left transition-shadow hover:border-line-strong',
        draggable && 'cursor-grab active:cursor-grabbing',
      )}
    >
      {variant === 'gallery' && (
        <div
          className="flex h-20 items-end rounded-t-panel border-b border-line bg-sunken px-3 pb-2 text-3xl"
          aria-hidden
        >
          {page?.icon ?? <span className="text-sm text-ink-3">{preview ? '' : ' '}</span>}
        </div>
      )}
      <div className="flex flex-col gap-1.5 p-2.5">
        <button
          type="button"
          onClick={() => db.openRow(row.row.path)}
          className="flex items-start gap-1.5 text-left font-semibold leading-snug hover:underline hover:decoration-marker hover:decoration-2 hover:underline-offset-4"
        >
          {variant === 'board' && page?.icon && <span aria-hidden>{page.icon}</span>}
          <span className="min-w-0 break-words">{row.row.title}</span>
        </button>
        {preview && <p className="line-clamp-2 text-[13px] text-ink-2">{preview}</p>}
        {db.visible
          .filter((p) => p.name !== db.view.groupBy)
          .map((p) => {
            const value = row.values[p.name]
            if (
              value === null ||
              value === undefined ||
              value === '' ||
              (Array.isArray(value) && !value.length) ||
              (p.type === 'checkbox' && value !== true)
            )
              return null
            return (
              <div key={p.name} className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2">
                <span className="sr-only">{p.name}:</span>
                <PropertyValue def={p} value={value} compact />
                {p.type === 'checkbox' && <span>{p.name}</span>}
              </div>
            )
          })}
      </div>
    </article>
  )
}
