import { t } from '@/i18n'
import { groupRows, NO_VALUE, type ResolvedRow } from '@/lib/database'
import { Chip } from '@/components/ui'
import { PropertyValue } from './PropertyValue'
import type { DatabaseApi } from './useDatabase'

export function ListView({ db }: { db: DatabaseApi }) {
  const groups = db.view.groupBy
    ? groupRows(db.rows, db.view.groupBy, db.def!).filter((g) => g.rows.length)
    : null
  return groups ? (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.label || t('db.noValue')}>
          <h3 className="mb-1 flex items-center gap-2 px-1 text-[13px] font-semibold text-ink-2">
            {g.color ? (
              <Chip color={g.color}>{g.label}</Chip>
            ) : g.key === NO_VALUE ? (
              t('db.noValue')
            ) : (
              g.label
            )}
            <span className="font-normal text-ink-3">{g.rows.length}</span>
          </h3>
          <Rows db={db} rows={g.rows} />
        </section>
      ))}
    </div>
  ) : (
    <Rows db={db} rows={db.rows} />
  )
}

function Rows({ db, rows }: { db: DatabaseApi; rows: ResolvedRow[] }) {
  return (
    <ul className="divide-y divide-line">
      {rows.map((row) => {
        const page = db.ws.get(row.row.path)
        return (
          <li key={row.row.path} className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 px-1 py-1.5">
            <button
              type="button"
              onClick={(e) => db.openRow(row.row.path, e)}
              className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold hover:underline hover:decoration-marker hover:decoration-2 hover:underline-offset-4"
            >
              {page?.icon && <span aria-hidden>{page.icon}</span>}
              <span className="truncate">{row.row.title}</span>
            </button>
            <span className="flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              {db.visible
                .filter((p) => p.name !== db.view.groupBy)
                .map((p) => (
                  <PropertyValue key={p.name} def={p} value={row.values[p.name]} compact />
                ))}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
