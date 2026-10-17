import { studyEvents } from '@/app/calendarEvents'
import { modulePages, modulePlan, today } from '@/app/studyPlan'
import { t } from '@/i18n'
import { toIcs, type IcsEvent } from '@/lib/ics'
import type { MoodleSnapshot } from '@/lib/moodle'
import { DAYS } from '@/lib/schedule'
import { planFrom } from '@/lib/studyPlan'
import { findStudyDashboard } from '@/lib/study/sync'
import { textHash } from '@/lib/textHash'
import type { Workspace } from '@/lib/workspace'

/**
 * The calendar for the phone: lectures weekly through the semester, exams, tasks, lab dates and
 * preparations, Moodle deadlines and the study plan's portions – from the same list as "Heute".
 */

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00`)
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/** The current semester's lecture period (database "Semester"), else the next four months. */
export function semesterRange(ws: Workspace, day = today()): { start: string; end: string } {
  const dash = findStudyDashboard(ws)
  const db = dash ? `${dash.folder}/Semester.md` : ''
  const rows = db && ws.get(db)?.database ? ws.rows(db) : []
  const current = rows
    .map((r) => ({ start: str(r.data.Beginn).slice(0, 10), end: str(r.data.Ende).slice(0, 10) }))
    .find((r) => r.start && r.end && r.start <= day && day <= r.end)
  return current ?? { start: day, end: addDays(day, 120) }
}

/** First day on or after `from` that is the weekday "Mo" … "So". */
function firstWeekday(from: string, weekday: string): string {
  const index = DAYS.indexOf(weekday as (typeof DAYS)[number])
  const d = new Date(`${from}T12:00:00`)
  while ((d.getDay() + 6) % 7 !== index) d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function calendarEvents(ws: Workspace, snapshot: MoodleSnapshot | null | undefined): IcsEvent[] {
  const day = today()
  const semester = semesterRange(ws, day)
  const uid = (key: string) => `${textHash(key)}@notiva`
  const out: IcsEvent[] = []
  for (const ev of studyEvents(ws, snapshot)) {
    if (ev.kind === 'session') {
      if (!ev.weekday || !ev.time) continue
      out.push({
        uid: uid(ev.key),
        summary: ev.type ? `${ev.title} (${ev.type})` : ev.title,
        date: firstWeekday(semester.start, ev.weekday),
        time: ev.time,
        ...(ev.end ? { end: ev.end } : { minutes: 90 }),
        weeklyUntil: semester.end,
        ...(ev.room ? { location: ev.room } : {}),
      })
      continue
    }
    if (ev.done || !ev.date) continue
    const summary =
      ev.kind === 'exam'
        ? `${t('calendar.exam')}: ${ev.title}`
        : ev.kind === 'moodle'
          ? `${t('calendar.deadline')}: ${ev.title}`
          : ev.title
    out.push({
      uid: uid(ev.key),
      summary,
      date: ev.date,
      ...(ev.time ? { time: ev.time } : {}),
      ...(ev.minutes ? { minutes: ev.minutes } : {}),
      ...(ev.room ? { location: ev.room } : {}),
      ...(ev.sub ? { description: ev.sub } : {}),
    })
  }
  // The study plans: one all-day entry per day with that day's topics.
  for (const module of modulePages(ws)) {
    const plan = modulePlan(ws, module)
    if (!plan) continue
    for (const d of planFrom(plan.topics, plan.done, plan.settings, day)) {
      if (!d.topics.length) continue
      out.push({
        uid: uid(`plan:${module.path}:${d.date}`),
        summary: `${t('calendar.study')}: ${module.title}`,
        date: d.date,
        description: d.topics.map((x) => x.key.replace(/\.[^.]+$/, '')).join('\n'),
      })
    }
  }
  return out
}

export const calendarFeed = (ws: Workspace, snapshot: MoodleSnapshot | null | undefined) =>
  toIcs(calendarEvents(ws, snapshot), { name: t('calendar.name') })
