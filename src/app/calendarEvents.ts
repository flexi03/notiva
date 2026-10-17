import { timetableRows } from '@/app/schedule'
import { t } from '@/i18n'
import { DAYS } from '@/lib/schedule'
import { LAB_DATE, LAB_PREP } from '@/lib/labPlan'
import { importTargets, type MoodleSnapshot, type Submission } from '@/lib/moodle'
import { findStudyDashboard } from '@/lib/study/sync'
import type { Workspace } from '@/lib/workspace'

/**
 * Everything with a date or a weekly time in the study folder – lectures from the timetable, exams,
 * tasks (lab dates and preparations among them), Moodle deadlines not imported as tasks. One list
 * for "Heute" and for the calendar feed, so both always show the same.
 */
export type EventKind = 'session' | 'exam' | 'lab' | 'prep' | 'task' | 'moodle'

export interface StudyEvent {
  key: string
  kind: EventKind
  title: string
  /** type, room, course … */
  sub?: string
  room?: string
  /** a one-off event: its day (YYYY-MM-DD) */
  date?: string
  /** a weekly session: its weekday ("Mo" … "So") */
  weekday?: string
  /** "09:00" – none: all day / due that day */
  time?: string
  end?: string
  /** minutes (exams: "90 Min.") */
  minutes?: number
  done?: boolean
  /** the page behind it (timetable row, exam, task) */
  path?: string
  /** a Moodle link */
  url?: string
  /** a session's module page */
  module?: string
  /** a session's type ("Vorlesung") */
  type?: string
  /** a Moodle assignment's state (also on tasks imported from it) */
  submission?: Submission
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const pad = (n: number) => String(n).padStart(2, '0')
const isoDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function studyEvents(ws: Workspace, snapshot: MoodleSnapshot | null | undefined): StudyEvent[] {
  const out: StudyEvent[] = []
  const dash = findStudyDashboard(ws)
  if (dash) {
    const modules = ws.get(`${dash.folder}/Module.md`)?.database ? ws.rows(`${dash.folder}/Module.md`) : []
    for (const r of timetableRows(ws, dash.folder)) {
      if (!r.day || !r.start) continue
      const module = modules.find((m) => m.title === r.module)
      out.push({
        key: r.path,
        kind: 'session',
        weekday: r.day,
        time: r.start,
        ...(r.end ? { end: r.end } : {}),
        title: r.module ?? r.title,
        sub: [r.type, r.room].filter(Boolean).join(' · '),
        ...(r.room ? { room: r.room } : {}),
        ...(r.type ? { type: r.type } : {}),
        path: r.path,
        ...(module ? { module: module.path } : {}),
      })
    }
    const exams = `${dash.folder}/Prüfungen.md`
    if (ws.get(exams)?.database)
      for (const e of ws.rows(exams)) {
        const date = str(e.data.Datum).slice(0, 10)
        if (!/^\d{4}-\d\d-\d\d$/.test(date)) continue
        const minutes = Number(/(\d+)/.exec(str(e.data.Dauer))?.[1] ?? 0)
        out.push({
          key: e.path,
          kind: 'exam',
          date,
          ...(str(e.data.Beginn) ? { time: str(e.data.Beginn) } : {}),
          ...(minutes ? { minutes } : {}),
          title: e.title,
          ...(str(e.data.Raum) ? { room: str(e.data.Raum) } : {}),
          path: e.path,
        })
      }
  }

  // Tasks of every task database (Aufgaben).
  const imported = new Set<string>()
  const submissions = new Map(
    (snapshot?.events ?? []).flatMap((e) => (e.submission ? [[e.id, e.submission] as const] : [])),
  )
  for (const target of importTargets(ws)) {
    if (!target.tasks || !ws.get(target.tasks)?.database) continue
    for (const p of ws.rows(target.tasks)) {
      const due = str(p.data.Fällig)
      if (typeof p.data.moodle === 'string') imported.add(p.data.moodle)
      if (!/^\d{4}-\d\d-\d\d/.test(due)) continue
      const time = /T(\d{2}:\d{2})/.exec(due)?.[1]
      const submission = typeof p.data.moodle === 'string' ? submissions.get(p.data.moodle) : undefined
      out.push({
        key: p.path,
        kind: p.data.Art === LAB_DATE ? 'lab' : p.data.Art === LAB_PREP ? 'prep' : 'task',
        date: due.slice(0, 10),
        ...(time ? { time } : {}),
        title: p.title,
        sub: str(p.data.Art),
        done: p.data.Status === 'Erledigt',
        path: p.path,
        ...(submission ? { submission } : {}),
      })
    }
  }

  // Moodle deadlines not imported as tasks.
  for (const ev of snapshot?.events ?? []) {
    if (imported.has(ev.id)) continue
    const due = new Date(ev.due)
    if (Number.isNaN(due.getTime())) continue
    out.push({
      key: ev.id,
      kind: 'moodle',
      date: isoDay(due),
      time: `${pad(due.getHours())}:${pad(due.getMinutes())}`,
      title: ev.title,
      sub: ev.course?.name ?? 'Moodle',
      ...(ev.url ? { url: ev.url } : {}),
      ...(ev.submission ? { submission: ev.submission } : {}),
      // Handed in: like a done task.
      done: ev.submission?.state === 'submitted' || ev.submission?.state === 'graded',
    })
  }
  return out
}

export interface AgendaItem {
  key: string
  kind: EventKind
  time?: string
  end?: string
  title: string
  sub: string
  overdue?: boolean
  done?: boolean
  event: StudyEvent
}

/**
 * One day of `events`: what is on that day (lectures of its weekday, exams, tasks, deadlines –
 * today also the overdue tasks) and "Demnächst" (tasks, labs and deadlines of the next 7 days,
 * exams of the next 14). Used by "Heute" and the iPhone app.
 */
export function dayAgenda(
  events: StudyEvent[],
  day: string,
  isToday: boolean,
): { items: AgendaItem[]; upcoming: Array<AgendaItem & { date: string }> } {
  const weekday = DAYS[(new Date(`${day}T12:00:00`).getDay() + 6) % 7]
  const until = (n: number) => {
    const d = new Date(`${day}T12:00:00`)
    d.setDate(d.getDate() + n)
    return isoDay(d)
  }
  const soon = (iso: string, n: number) => iso > day && iso <= until(n)
  const items: AgendaItem[] = []
  const upcoming: Array<AgendaItem & { date: string }> = []
  for (const ev of events) {
    if (ev.kind === 'session') {
      if (ev.weekday === weekday)
        items.push({
          key: ev.key,
          kind: 'session',
          time: ev.time,
          ...(ev.end ? { end: ev.end } : {}),
          title: ev.title,
          sub: ev.sub ?? '',
          event: ev,
        })
      continue
    }
    const evDay = ev.date!
    const base = { key: ev.key, kind: ev.kind, title: ev.title, event: ev }
    // An assignment's state next to its course: "abgegeben", "bewertet 1,7" …
    const state = ev.submission
      ? t(`submission.${ev.submission.state}`, { grade: ev.submission.grade ?? '' })
      : ''
    const subOf = (s?: string) => [s, state].filter(Boolean).join(' · ')
    if (ev.kind === 'exam') {
      const sub = [t('semester.exam'), ev.room].filter(Boolean).join(' · ')
      if (soon(evDay, 14)) upcoming.push({ ...base, date: evDay, ...(ev.time ? { time: ev.time } : {}), sub })
      if (evDay === day) items.push({ ...base, ...(ev.time ? { time: ev.time } : {}), sub })
    } else if (ev.kind === 'moodle') {
      if (soon(evDay, 7))
        upcoming.push({ ...base, date: evDay, time: ev.time, sub: subOf(ev.sub), done: !!ev.done })
      if (evDay === day) items.push({ ...base, time: ev.time, sub: subOf(ev.sub), done: !!ev.done })
    } else {
      // Tasks: due this day – and, today, the overdue ones.
      const overdue = isToday && evDay < day && !ev.done
      if (!ev.done && soon(evDay, 7))
        upcoming.push({ ...base, date: evDay, ...(ev.time ? { time: ev.time } : {}), sub: subOf(ev.sub) })
      if (evDay !== day && !overdue) continue
      items.push({
        ...base,
        ...(ev.time && !overdue ? { time: ev.time } : {}),
        sub: overdue
          ? t('day.overdue', { date: `${evDay.slice(8, 10)}.${evDay.slice(5, 7)}.` })
          : subOf(ev.sub),
        overdue,
        done: !!ev.done,
      })
    }
  }
  return { items, upcoming }
}
