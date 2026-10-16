import { useEffect, useState } from 'react'
import {
  AlarmClock,
  BookOpen,
  CalendarClock,
  CheckSquare,
  FlaskConical,
  GraduationCap,
  School,
} from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { timetableRows } from '@/app/schedule'
import { useSessionFocus } from '@/app/sessionFocus'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { LAB_DATE, LAB_PREP } from '@/lib/labPlan'
import { importTargets } from '@/lib/moodle'
import { DAYS } from '@/lib/schedule'
import { findStudyDashboard } from '@/lib/study/sync'
import type { Page } from '@/lib/workspace'
import { cx } from '@/components/ui'

type Kind = 'session' | 'exam' | 'lab' | 'prep' | 'task' | 'moodle'

interface Item {
  key: string
  kind: Kind
  /** "09:00" – none: all day / due today */
  time?: string
  end?: string
  title: string
  sub?: string
  overdue?: boolean
  done?: boolean
  open: (e: React.MouseEvent) => void
}

const ICONS: Record<Kind, typeof CalendarClock> = {
  session: School,
  exam: GraduationCap,
  lab: FlaskConical,
  prep: BookOpen,
  task: CheckSquare,
  moodle: AlarmClock,
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/**
 * "Heute": everything of one day at a glance, in order – lectures and labs from the timetable,
 * exams, lab dates and preparations, tasks due (and overdue ones, today), Moodle deadlines. A click
 * opens it; a lecture opens its module with the files for that session.
 */
export function DayOverview({ date }: { date: Date }) {
  const ws = useWorkspace()
  const run = useAction()
  const snapshot = useMoodle((s) => s.snapshot)
  const openEntry = useApp((s) => s.openEntry)
  const navigate = useApp((s) => s.navigate)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  const day = isoDay(date)
  const today = isoDay(now) === day
  const weekday = DAYS[(date.getDay() + 6) % 7]
  const dash = findStudyDashboard(ws)
  const items: Item[] = []

  if (dash) {
    const modules = ws.get(`${dash.folder}/Module.md`)?.database ? ws.rows(`${dash.folder}/Module.md`) : []
    for (const r of timetableRows(ws, dash.folder)) {
      if (r.day !== weekday || !r.start) continue
      const module = modules.find((m) => m.title === r.module)
      const [h, m] = r.start.split(':').map(Number)
      const start = new Date(date)
      start.setHours(h ?? 0, m ?? 0, 0, 0)
      items.push({
        key: r.path,
        kind: 'session',
        time: r.start,
        ...(r.end ? { end: r.end } : {}),
        title: r.module ?? r.title,
        sub: [r.type, r.room].filter(Boolean).join(' · '),
        open: (e) => {
          if (!module) return openEntry(r.path, e)
          useSessionFocus.setState({
            module: module.path,
            source: r.path,
            start: start.getTime(),
            ...(r.type ? { type: r.type } : {}),
          })
          navigate({ name: 'page', path: module.path })
        },
      })
    }
    const exams = `${dash.folder}/Prüfungen.md`
    if (ws.get(exams)?.database)
      for (const e of ws.rows(exams))
        if (str(e.data.Datum).slice(0, 10) === day)
          items.push({
            key: e.path,
            kind: 'exam',
            ...(str(e.data.Beginn) ? { time: str(e.data.Beginn) } : {}),
            title: e.title,
            sub: [t('semester.exam'), str(e.data.Raum)].filter(Boolean).join(' · '),
            open: (ev) => openEntry(e.path, ev),
          })
  }

  // Tasks of every task database (Aufgaben): due this day – and, today, the overdue ones.
  const imported = new Set<string>()
  for (const target of importTargets(ws)) {
    if (!target.tasks || !ws.get(target.tasks)?.database) continue
    for (const p of ws.rows(target.tasks) as Page[]) {
      const due = str(p.data.Fällig)
      if (typeof p.data.moodle === 'string') imported.add(p.data.moodle)
      if (!due) continue
      const done = p.data.Status === 'Erledigt'
      const overdue = today && due.slice(0, 10) < day && !done
      if (due.slice(0, 10) !== day && !overdue) continue
      const time = /T(\d{2}:\d{2})/.exec(due)?.[1]
      items.push({
        key: p.path,
        kind: p.data.Art === LAB_DATE ? 'lab' : p.data.Art === LAB_PREP ? 'prep' : 'task',
        ...(time && !overdue ? { time } : {}),
        title: p.title,
        sub: overdue
          ? t('day.overdue', { date: due.slice(8, 10) + '.' + due.slice(5, 7) + '.' })
          : str(p.data.Art),
        overdue,
        done,
        open: (e) => openEntry(p.path, e),
      })
    }
  }

  // Moodle deadlines not imported as tasks.
  for (const ev of snapshot?.events ?? []) {
    const due = new Date(ev.due)
    if (isoDay(due) !== day || imported.has(ev.id)) continue
    items.push({
      key: ev.id,
      kind: 'moodle',
      time: `${pad(due.getHours())}:${pad(due.getMinutes())}`,
      title: ev.title,
      sub: ev.course?.name ?? 'Moodle',
      open: () => ev.url && void run(() => useMoodle.getState().open(ev.url!, false)),
    })
  }

  const timed = items.filter((i) => i.time).sort((a, b) => a.time!.localeCompare(b.time!))
  const allDay = items.filter((i) => !i.time).sort((a, b) => Number(!!b.overdue) - Number(!!a.overdue))
  const minutes = now.getHours() * 60 + now.getMinutes()
  const toMin = (hhmm?: string) => {
    const [h, m] = (hhmm ?? '').split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'

  const row = (i: Item) => {
    const Icon = ICONS[i.kind]
    const past = today && i.time && toMin(i.end ?? i.time) + (i.end ? 0 : 60) < minutes
    const running = today && i.time && i.end && toMin(i.time) <= minutes && minutes < toMin(i.end)
    return (
      <li key={i.key}>
        <button
          type="button"
          onClick={i.open}
          className={cx(
            'flex w-full items-center gap-3 rounded-control px-2 py-1.5 text-left hover:bg-hover',
            running && 'bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]',
            (past || i.done) && 'opacity-55',
          )}
        >
          <span className="w-24 shrink-0 text-[13px] text-ink-2 tabular-nums">
            {i.time ? `${i.time}${i.end ? `–${i.end}` : ''}` : i.overdue ? t('day.late') : t('day.due')}
          </span>
          <Icon
            size={15}
            className={cx(
              'shrink-0',
              i.overdue ? 'text-danger' : i.kind === 'exam' ? 'text-danger' : 'text-accent',
            )}
            aria-hidden
          />
          <span className="min-w-0 flex-1">
            <span className={cx('block truncate text-[14px] font-medium', i.done && 'line-through')}>
              {i.title}
            </span>
            {i.sub && <span className="block truncate text-[12px] text-ink-3">{i.sub}</span>}
          </span>
          {running && (
            <span className="shrink-0 text-[11.5px] font-semibold text-accent">{t('event.now')}</span>
          )}
        </button>
      </li>
    )
  }

  return (
    <section
      aria-label={t('day.title')}
      data-testid="day-overview"
      className="no-print mt-4 rounded-panel border border-line p-3"
    >
      <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
        <CalendarClock size={14} />
        {today
          ? t('day.today')
          : date.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
        <span className="font-normal text-ink-3">· {t('day.count', { count: items.length })}</span>
      </h2>
      {items.length === 0 ? (
        <p className="px-2 text-[13px] text-ink-3">{t('day.empty')}</p>
      ) : (
        <>
          {allDay.length > 0 && <ul className="mb-1 space-y-0.5">{allDay.map(row)}</ul>}
          {timed.length > 0 && <ul className="space-y-0.5">{timed.map(row)}</ul>}
        </>
      )}
    </section>
  )
}

/** "2026-10-16" (a daily note's title) → that day. */
export function dailyDate(page: Page): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(page.title)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}
