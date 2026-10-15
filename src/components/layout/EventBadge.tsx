import { useEffect, useState } from 'react'
import { CalendarClock, FileText } from 'lucide-react'
import { materialFolder } from '@/app/materials'
import { scriptFor } from '@/lib/semesterView'
import { timetableRows } from '@/app/schedule'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { duration, nowAndNext, upcomingEvents, type CalendarEvent } from '@/lib/schedule'
import { findStudyDashboard } from '@/lib/study/sync'
import { cx } from '@/components/ui'

/** Exams with date (and start) as events. */
function examEvents(ws: ReturnType<typeof useWorkspace>, folder: string): CalendarEvent[] {
  const db = `${folder}/Prüfungen.md`
  if (!ws.get(db)?.database) return []
  return ws.rows(db).flatMap((r) => {
    if (typeof r.data.Datum !== 'string') return []
    const time =
      typeof r.data.Beginn === 'string' && /^\d{1,2}:\d{2}$/.test(r.data.Beginn) ? r.data.Beginn : '08:00'
    const start = new Date(`${r.data.Datum}T${time.padStart(5, '0')}:00`)
    if (Number.isNaN(start.getTime())) return []
    return [
      {
        title: r.title,
        start,
        end: new Date(start.getTime() + 90 * 60_000),
        path: r.path,
        ...(typeof r.data.Raum === 'string' ? { room: r.data.Raum } : {}),
      },
    ]
  })
}

/** Small, always visible: what runs now (and how long) and what comes next – click to open it. */
export function EventBadge() {
  const ws = useWorkspace()
  const position = useApp((s) => s.settings.eventBadge)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(timer)
  }, [])
  if (position === 'off') return null
  const dash = findStudyDashboard(ws)
  if (!dash) return null
  const { current, next } = nowAndNext(
    upcomingEvents(timetableRows(ws, dash.folder), examEvents(ws, dash.folder), now),
    now,
  )
  if (!current && !next) return null
  const base = materialFolder(ws)
  const moduleRows = ws.get(`${dash.folder}/Module.md`)?.database ? ws.rows(`${dash.folder}/Module.md`) : []
  /** Where a click goes: the script of the day, else the module (exams: their page). */
  const target = (e: CalendarEvent) => {
    const module = e.module ? moduleRows.find((r) => r.title === e.module) : undefined
    const script = e.module ? scriptFor(ws, base, e.module, e.start, now) : undefined
    return { script, page: module?.path ?? e.path }
  }
  const open = (e: CalendarEvent) => {
    const { script, page } = target(e)
    if (script) useApp.getState().navigate({ name: 'file', path: script })
    else if (page) useApp.getState().openEntry(page)
  }
  const line = (label: string, e: CalendarEvent, time: string) => {
    const { script, page } = target(e)
    return (
      <button
        type="button"
        disabled={!script && !page}
        onClick={() => open(e)}
        title={
          script ? t('event.openScript', { name: script.split('/').pop() ?? '' }) : t('event.openModule')
        }
        className="flex w-full min-w-0 items-baseline gap-1.5 rounded-control text-left enabled:hover:underline"
      >
        <span className="shrink-0 text-[11px] font-semibold text-ink-3">{label}</span>
        <span className="min-w-0 truncate font-medium">{e.title}</span>
        {e.room && <span className="shrink-0 text-ink-3">{e.room}</span>}
        <span className="shrink-0 text-ink-2 tabular-nums">{time}</span>
        {script && (
          <FileText size={12} className="shrink-0 self-center text-accent" aria-label={t('event.script')} />
        )}
      </button>
    )
  }
  return (
    <div
      role="region"
      aria-label={t('event.next')}
      className={cx(
        'no-print fixed z-40 flex max-w-[min(26rem,calc(100vw-2rem))] items-start gap-2 rounded-panel border border-line bg-surface/95 px-3 py-1.5 text-[12.5px] shadow-[var(--shadow-pop)] backdrop-blur',
        position === 'top-right' ? 'top-14 right-16' : 'bottom-4 left-4',
      )}
    >
      <CalendarClock size={14} className="mt-0.5 shrink-0 text-accent" />
      <span className="min-w-0 space-y-0.5">
        {current &&
          line(
            t('event.now'),
            current,
            t('event.endsIn', { time: duration(current.end.getTime() - now.getTime()) }),
          )}
        {next &&
          line(
            t('event.next'),
            next,
            t('event.startsIn', { time: duration(next.start.getTime() - now.getTime()) }),
          )}
      </span>
    </div>
  )
}
