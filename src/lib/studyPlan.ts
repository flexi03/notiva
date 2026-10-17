/**
 * Study plan backwards from the exam date. Nothing is scheduled in advance: every day the topics
 * still open are spread over the study days left – a missed day simply moves its portion to the
 * others. Lecture slides first (in their order), the last days before the exam for old and
 * practice exams. Pure logic; settings live in the module page (`lernplan:`), ticks in
 * `vorbereitet:` (shared with the exam preparation).
 */
import { examPrep } from './examPrep'

export interface StudyPlanSettings {
  /** first study day (YYYY-MM-DD) */
  start: string
  /** exam day – studying ends the day before */
  exam: string
  /** study weekdays, 0 = Monday … 6 = Sunday */
  weekdays: number[]
  /** single days off (YYYY-MM-DD) */
  skip: string[]
  /** how many of the last study days belong to old/practice exams */
  examDays: number
}

export interface Topic {
  /** file name – what is ticked in `vorbereitet` */
  key: string
  path: string
  kind: 'lecture' | 'exam'
}

export interface PlanDay {
  date: string
  topics: Topic[]
}

export const WEEKDAYS = [0, 1, 2, 3, 4] as const
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6] as const

const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parse = (iso: string) => new Date(`${iso}T12:00:00`)
const addDays = (iso: string, n: number) => {
  const d = parse(iso)
  d.setDate(d.getDate() + n)
  return isoDate(d)
}

/** Validates `lernplan:` from a module page (untrusted). */
export function parsePlanSettings(raw: unknown): StudyPlanSettings | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const r = raw as Record<string, unknown>
  const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d\d-\d\d$/.test(v) ? v : null)
  const start = day(r.start)
  const exam = day(r.exam)
  if (!start || !exam) return null
  const weekdays = Array.isArray(r.weekdays)
    ? [...new Set(r.weekdays.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort()
    : [...WEEKDAYS]
  return {
    start,
    exam,
    weekdays: weekdays.length ? weekdays : [...WEEKDAYS],
    skip: Array.isArray(r.skip) ? r.skip.map(day).filter((d): d is string => !!d) : [],
    examDays: Math.max(0, Math.min(14, Math.round(Number(r.examDays ?? 3)) || 0)),
  }
}

/**
 * The topics of a module: lecture slides of the current course ("…/Vorlesung/", not the archive)
 * in their order, then old and practice exams (from the exam preparation).
 */
export function planTopics(paths: string[], moduleFolder: string): Topic[] {
  const lectures = paths
    .filter(
      (p) =>
        p.startsWith(`${moduleFolder}/Vorlesung/`) &&
        /\.(pdf|pptx?|key)$/i.test(p) &&
        !/\(neu \d{4}-\d\d-\d\d\)/.test(p),
    )
    .sort((a, b) => name(a).localeCompare(name(b), 'de', { numeric: true }))
    .map((path) => ({ key: name(path), path, kind: 'lecture' as const }))
  const exams = examPrep(
    paths.filter((p) => !p.includes('/Archiv/') || /klausur|exam/i.test(name(p))),
  ).exams.map((e) => ({ key: name(e.path), path: e.path, kind: 'exam' as const }))
  return [...lectures, ...exams]
}

/** The study days from `from` (or the start, if later) to the day before the exam. */
export function studyDays(settings: StudyPlanSettings, from: string): string[] {
  const out: string[] = []
  const skip = new Set(settings.skip)
  for (let d = from > settings.start ? from : settings.start; d < settings.exam; d = addDays(d, 1)) {
    const weekday = (parse(d).getDay() + 6) % 7
    if (settings.weekdays.includes(weekday) && !skip.has(d)) out.push(d)
    if (out.length > 400) break
  }
  return out
}

/** Spreads `items` over `days` as evenly as possible, the earlier days taking the extra ones. */
function spread<T>(items: T[], days: string[]): PlanDay[] {
  if (!days.length) return []
  const per = Math.floor(items.length / days.length)
  let extra = items.length % days.length
  let i = 0
  return days.map((date) => {
    const n = per + (extra-- > 0 ? 1 : 0)
    const topics = items.slice(i, i + n) as Topic[]
    i += n
    return { date, topics }
  })
}

/**
 * The plan from `today` on for the topics not done yet: lectures over the first days, exams over
 * the last `examDays` (all days when only exams are left). On the exam day or after: nothing.
 */
export function planFrom(
  topics: Topic[],
  done: Set<string>,
  settings: StudyPlanSettings,
  today: string,
): PlanDay[] {
  const open = topics.filter((t) => !done.has(t.key))
  const days = studyDays(settings, today)
  if (!days.length || !open.length) return days.map((date) => ({ date, topics: [] }))
  const lectures = open.filter((t) => t.kind === 'lecture')
  const exams = open.filter((t) => t.kind === 'exam')
  const examDays = !lectures.length
    ? days.length
    : exams.length
      ? Math.min(settings.examDays, days.length - 1)
      : 0
  const cut = days.length - examDays
  return [...spread(lectures, days.slice(0, cut)), ...spread(exams, days.slice(cut))]
}

/** What to do today (empty when today is no study day). */
export function todaysPortion(
  topics: Topic[],
  done: Set<string>,
  settings: StudyPlanSettings,
  today: string,
): Topic[] {
  const [first] = planFrom(topics, done, settings, today)
  return first?.date === today ? first.topics : []
}

/** The default plan for an exam: start four weeks before (or today, if later), Mon–Fri. */
export function defaultPlan(exam: string, today: string): StudyPlanSettings {
  const start = addDays(exam, -28)
  return { start: start > today ? start : today, exam, weekdays: [...WEEKDAYS], skip: [], examDays: 3 }
}

/** Days until the exam (0 = today). */
export const daysUntil = (exam: string, today: string) =>
  Math.round((parse(exam).getTime() - parse(today).getTime()) / 86_400_000)
