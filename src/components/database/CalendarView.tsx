import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { getLanguage, t } from '@/i18n'
import { isSameDay, monthGrid, parseDate, toIsoDate } from '@/lib/dates'
import { Button, cx, IconButton } from '@/components/ui'
import type { DatabaseApi } from './useDatabase'

/** Month calendar; entries placed by a date property, drag to reschedule, + to create on a day. */
export function CalendarView({ db }: { db: DatabaseApi }) {
  const dateProp = db.view.dateProperty ?? db.def!.properties.find((p) => p.type === 'date')?.name
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const [over, setOver] = useState<string | null>(null)
  if (!dateProp) return <p className="py-6 text-sm text-ink-3">{t('type.date')} ?</p>
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const days = monthGrid(cursor.year, cursor.month)
  const today = new Date()
  const byDay = new Map<string, typeof db.rows>()
  for (const row of db.rows) {
    const value = row.values[dateProp]
    const date = typeof value === 'string' ? parseDate(value) : null
    if (!date) continue
    const key = toIsoDate(date)
    byDay.set(key, [...(byDay.get(key) ?? []), row])
  }
  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1)
      return { year: d.getFullYear(), month: d.getMonth() }
    })
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'short' }),
  )

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <h3 className="flex-1 text-[15px] font-bold">
          {new Date(cursor.year, cursor.month, 1).toLocaleDateString(locale, {
            month: 'long',
            year: 'numeric',
          })}
        </h3>
        <IconButton size="sm" label={t('db.previous')} onClick={() => shift(-1)}>
          <ChevronLeft size={15} />
        </IconButton>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setCursor({ year: today.getFullYear(), month: today.getMonth() })}
        >
          {t('db.today')}
        </Button>
        <IconButton size="sm" label={t('db.next')} onClick={() => shift(1)}>
          <ChevronRight size={15} />
        </IconButton>
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[36rem] grid-cols-7 overflow-hidden rounded-panel border border-line bg-line [gap:1px]">
          {weekdays.map((w) => (
            <div key={w} className="bg-sunken px-2 py-1 text-xs font-semibold text-ink-3">
              {w}
            </div>
          ))}
          {days.map((day) => {
            const key = toIsoDate(day)
            const entries = byDay.get(key) ?? []
            const inMonth = day.getMonth() === cursor.month
            return (
              <div
                key={key}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes('application/x-notiva-row')) {
                    e.preventDefault()
                    setOver(key)
                  }
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  setOver(null)
                  const path = e.dataTransfer.getData('application/x-notiva-row')
                  if (path) void db.setValue(path, dateProp, key)
                }}
                className={cx(
                  'group/day flex min-h-24 flex-col gap-1 bg-surface p-1',
                  !inMonth && 'bg-paper text-ink-3',
                  over === key && 'ring-2 ring-inset ring-accent',
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cx(
                      'flex size-6 items-center justify-center rounded-full text-xs',
                      isSameDay(day, today) && 'bg-marker font-bold text-ink',
                    )}
                  >
                    {day.getDate()}
                  </span>
                  <IconButton
                    size="sm"
                    label={`${t('db.newRow')} ${key}`}
                    onClick={() => void db.addRow({ [dateProp]: key })}
                    className="opacity-0 group-hover/day:opacity-100 focus:opacity-100"
                  >
                    <Plus size={12} />
                  </IconButton>
                </div>
                {entries.map((row) => (
                  <button
                    key={row.row.path}
                    type="button"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('application/x-notiva-row', row.row.path)}
                    onClick={() => db.openRow(row.row.path)}
                    className="truncate rounded-[5px] bg-accent-soft px-1.5 py-0.5 text-left text-xs font-semibold text-accent hover:brightness-95"
                  >
                    {db.ws.get(row.row.path)?.icon} {row.row.title}
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
