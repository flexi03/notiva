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
import { dayAgenda, studyEvents, type StudyEvent } from '@/app/calendarEvents'
import { useSessionFocus } from '@/app/sessionFocus'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import type { Page } from '@/lib/workspace'
import { cx } from '@/components/ui'
import { StudyPlanDay } from './StudyPlanSection'

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
  /** instead of the time: "Fr 18.10. 09:00" (upcoming days) */
  label?: string
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
  const openOf = (ev: StudyEvent) => (e: React.MouseEvent) =>
    ev.url ? void run(() => useMoodle.getState().open(ev.url!, false)) : ev.path && openEntry(ev.path, e)
  /** A lecture opens its module with the files for that session; the rest opens its page. */
  const openItem = (ev: StudyEvent) => (e: React.MouseEvent) => {
    if (ev.kind !== 'session' || !ev.module) return openOf(ev)(e)
    const [h, m] = (ev.time ?? '').split(':').map(Number)
    const start = new Date(date)
    start.setHours(h ?? 0, m ?? 0, 0, 0)
    useSessionFocus.setState({
      module: ev.module,
      source: ev.path!,
      start: start.getTime(),
      ...(ev.type ? { type: ev.type } : {}),
    })
    navigate({ name: 'page', path: ev.module })
  }
  const agenda = dayAgenda(studyEvents(ws, snapshot), day, today)
  const items: Item[] = agenda.items.map((i) => ({ ...i, open: openItem(i.event) }))
  // "Demnächst": what is due in the next days (tasks, labs, deadlines a week, exams two weeks).
  const upcoming: Array<Item & { date: string }> = agenda.upcoming.map((i) => ({
    ...i,
    open: openItem(i.event),
  }))

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
            {i.label ??
              (i.time ? `${i.time}${i.end ? `–${i.end}` : ''}` : i.overdue ? t('day.late') : t('day.due'))}
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
      <StudyPlanDay date={day} />
      {upcoming.length > 0 && (
        <div className="mt-3 border-t border-line pt-2" data-testid="day-upcoming">
          <h3 className="mb-1 px-2 text-[12.5px] font-semibold text-ink-2">{t('day.upcoming')}</h3>
          <ul className="space-y-0.5">
            {upcoming
              .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
              .map((i) =>
                row({
                  ...i,
                  key: `soon:${i.key}`,
                  time: undefined,
                  label: `${new Date(`${i.date}T00:00`).toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}${i.time ? ` ${i.time}` : ''}`,
                }),
              )}
          </ul>
        </div>
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
