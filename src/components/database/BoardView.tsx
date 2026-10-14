import { useState } from 'react'
import { Plus } from 'lucide-react'
import { t } from '@/i18n'
import { groupRows, NO_VALUE, propertyDef } from '@/lib/database'
import { Chip, cx, IconButton } from '@/components/ui'
import { RowCard } from './RowCard'
import type { DatabaseApi } from './useDatabase'

/** Kanban columns by a select/checkbox property; drag cards between columns to change it. */
export function BoardView({ db }: { db: DatabaseApi }) {
  const groupBy = db.view.groupBy ?? db.def!.properties.find((p) => p.type === 'select')?.name
  const [over, setOver] = useState<string | null>(null)
  if (!groupBy)
    return (
      <p className="py-6 text-sm text-ink-3">
        {t('db.group')}: {t('type.select')} ?
      </p>
    )
  const prop = propertyDef(db.def!, groupBy)
  const groups = groupRows(db.rows, groupBy, db.def!)
  const valueFor = (key: string) =>
    key === NO_VALUE ? null : prop?.type === 'checkbox' ? key === 'true' : key

  return (
    <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
      {groups.map((g) => (
        <section
          key={g.key}
          aria-label={g.label || t('db.noValue')}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-notiva-row')) {
              e.preventDefault()
              setOver(g.key)
            }
          }}
          onDragLeave={() => setOver(null)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(null)
            const path = e.dataTransfer.getData('application/x-notiva-row')
            if (path) void db.setValue(path, groupBy, valueFor(g.key))
          }}
          className={cx(
            'flex w-64 shrink-0 flex-col gap-2 rounded-panel bg-sunken p-2',
            over === g.key && 'ring-2 ring-accent',
          )}
        >
          <header className="flex items-center gap-2 px-1">
            {g.color ? (
              <Chip color={g.color}>{g.label}</Chip>
            ) : (
              <span className="text-[13px] font-semibold">{g.label || t('db.noValue')}</span>
            )}
            <span className="text-[13px] text-ink-3">{g.rows.length}</span>
            <span className="flex-1" />
            <IconButton
              size="sm"
              label={t('db.newRow')}
              onClick={() =>
                void db.addRow(g.key === NO_VALUE ? {} : { [groupBy]: valueFor(g.key) as string | boolean })
              }
            >
              <Plus size={14} />
            </IconButton>
          </header>
          {g.rows.map((row) => (
            <RowCard key={row.row.path} db={db} row={row} variant="board" draggable />
          ))}
        </section>
      ))}
    </div>
  )
}
