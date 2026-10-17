/**
 * Notification center: what's new since the last look. Built from two Moodle snapshots (new
 * deadlines, moved deadlines, new or updated materials, Moodle's own notifications, grades) and
 * from due dates (reminders). Pure logic – the desktop app polls, stores and shows them.
 */
import type { MoodleEvent, MoodleSnapshot } from './moodle'

export type NotificationKind =
  | 'deadline'
  | 'moved'
  | 'material'
  | 'updated'
  | 'notice'
  | 'grade'
  | 'reminder'
  /** New files in a course set aside for another semester: only for information, nothing to save. */
  | 'aside'
  /** Result of a check ("Moodle geprüft – nichts Neues"): one entry per source, replaced each time. */
  | 'check'

export type NotificationTarget =
  | { type: 'url'; url: string }
  | { type: 'page'; path: string }
  | { type: 'material'; id: string; courseId: string }
  /** A place in Notiva ("#/grades", "#/settings/study"). */
  | { type: 'route'; hash: string }
  /** A Moodle course: its module page or the course in the app. */
  | { type: 'course'; courseId: string }
  /** The sign-in expired: one click opens the sign-in window again. */
  | { type: 'relogin'; service: 'ecampus' | 'moodle' }
  /** Notiva suggests changes (study sync, timetable, new materials) – confirm them here. */
  | { type: 'review'; what: 'study' | 'timetable' | 'materials' }

export interface AppNotification {
  /** Stable – the same news never shows twice. */
  id: string
  kind: NotificationKind
  title: string
  body?: string
  course?: string
  /** ISO date-time the news happened (or was found). */
  time: string
  read?: boolean
  target?: NotificationTarget
}

export const MAX_NOTIFICATIONS = 300
const DAY = 86_400_000

const courseName = (snap: MoodleSnapshot, id: string | undefined) =>
  id ? snap.courses.find((c) => c.id === id)?.name : undefined

function dueText(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function eventTarget(event: MoodleEvent, pages: Map<string, string>): NotificationTarget | undefined {
  const page = pages.get(event.id)
  if (page) return { type: 'page', path: page }
  return event.url ? { type: 'url', url: event.url } : undefined
}

export interface NewsOptions {
  now?: Date
  locale?: string
  /** Notiva pages per Moodle id (imported tasks) – news then opens the page. */
  pages?: Map<string, string>
  /**
   * The user's choice per Moodle course (.notiva/course-choices.json): "ignore" – nothing from it;
   * "later" (another semester) – its new files as one grey note per course, never as materials.
   */
  choice?: (courseId: string) => CourseChoice | undefined
}

export type CourseChoice = 'later' | 'ignore'

/** Validates the stored course choices (untrusted file). */
export function parseCourseChoices(raw: unknown): Record<string, CourseChoice> {
  const out: Record<string, CourseChoice> = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [id, v] of Object.entries(raw)) if (v === 'later' || v === 'ignore') out[id] = v
  return out
}

/**
 * News between two fetches. The very first fetch (no `previous`) is the baseline and reports
 * nothing – otherwise every existing file would show up as "new".
 */
export function moodleNews(
  previous: MoodleSnapshot | null,
  next: MoodleSnapshot,
  { now = new Date(), locale = 'de-DE', pages = new Map(), choice = () => undefined }: NewsOptions = {},
): AppNotification[] {
  if (!previous || previous.site !== next.site) return []
  const found = now.toISOString()
  const news: AppNotification[] = []
  const oldEvents = new Map(previous.events.map((e) => [e.id, e]))
  // An assignment graded since the last fetch: its grade and feedback.
  for (const event of next.events) {
    const old = oldEvents.get(event.id)
    if (event.submission?.state !== 'graded' || !old || old.submission?.state === 'graded') continue
    if (event.course?.id && choice(event.course.id) === 'ignore') continue
    news.push({
      id: `graded:${event.id}`,
      kind: 'grade',
      title: `Bewertet: ${event.title}${event.submission.grade ? ` – ${event.submission.grade}` : ''}`,
      ...(event.submission.feedback ? { body: event.submission.feedback } : {}),
      ...(event.course ? { course: event.course.name } : {}),
      time: found,
      ...(event.url ? { target: { type: 'url' as const, url: event.url } } : {}),
    })
  }
  for (const event of next.events) {
    if (new Date(event.due).getTime() < now.getTime()) continue
    if (event.course?.id && choice(event.course.id) === 'ignore') continue
    const old = oldEvents.get(event.id)
    const target = eventTarget(event, pages)
    const course = event.course?.name
    if (!old)
      news.push({
        id: `deadline:${event.id}`,
        kind: 'deadline',
        title: event.title,
        body: dueText(event.due, locale),
        ...(course ? { course } : {}),
        time: found,
        ...(target ? { target } : {}),
      })
    else if (old.due !== event.due)
      news.push({
        id: `moved:${event.id}:${event.due}`,
        kind: 'moved',
        title: event.title,
        body: `${dueText(old.due, locale)} → ${dueText(event.due, locale)}`,
        ...(course ? { course } : {}),
        time: found,
        ...(target ? { target } : {}),
      })
  }
  // Materials only if the previous fetch had them (older snapshots/calendar links don't).
  if (previous.materials && next.materials) {
    const oldMaterials = new Map(previous.materials.map((m) => [m.id, m]))
    const aside = new Map<string, string[]>()
    for (const m of next.materials) {
      const old = oldMaterials.get(m.id)
      const changed = old && m.modified && old.modified && m.modified !== old.modified
      if (old && !changed) continue
      const mode = choice(m.courseId)
      if (mode === 'ignore') continue
      if (mode === 'later') {
        aside.set(m.courseId, [...(aside.get(m.courseId) ?? []), m.filename ?? m.title])
        continue
      }
      const course = courseName(next, m.courseId)
      news.push({
        id: `${changed ? 'updated' : 'material'}:${m.id}:${m.modified ?? ''}`,
        kind: changed ? 'updated' : 'material',
        title: m.title,
        ...(m.section ? { body: m.section } : {}),
        ...(course ? { course } : {}),
        time: m.modified && !changed && Date.parse(m.modified) > now.getTime() - 7 * DAY ? m.modified : found,
        target: { type: 'material', id: m.id, courseId: m.courseId },
      })
    }
    for (const [courseId, names] of aside) {
      const course = courseName(next, courseId)
      news.push({
        id: `aside:${courseId}:${found}`,
        kind: 'aside',
        title: `${names.length} ${names.length === 1 ? 'Datei' : 'Dateien'} – anderes Semester, nicht übernommen`,
        body: names.slice(0, 3).join(', ') + (names.length > 3 ? ` und ${names.length - 3} weitere` : ''),
        ...(course ? { course } : {}),
        time: found,
        target: { type: 'course', courseId },
      })
    }
  }
  const oldNotices = new Set((previous.notices ?? []).map((n) => n.id))
  for (const n of next.notices ?? []) {
    if (oldNotices.has(n.id)) continue
    news.push({
      id: n.id,
      kind: 'notice',
      title: n.subject,
      ...(n.text ? { body: n.text } : {}),
      time: n.time,
      ...(n.url ? { target: { type: 'url', url: n.url } } : {}),
    })
  }
  const oldGrades = new Map(previous.grades.map((g) => [g.course, g.grade]))
  for (const g of next.grades) {
    if (oldGrades.get(g.course) === g.grade) continue
    news.push({
      id: `grade:${g.course}:${g.grade}`,
      kind: 'grade',
      title: g.course,
      body: g.grade,
      course: g.course,
      time: found,
    })
  }
  return news
}

/** Reminders for deadlines in the next `hours` (one per deadline and date). */
export function deadlineReminders(
  events: Array<{
    id: string
    title: string
    due: string
    course?: string
    target?: NotificationTarget
    /** own lead time ("Erinnerung: 2 Std. vorher") instead of `hours` */
    hours?: number
  }>,
  { now = new Date(), locale = 'de-DE', hours = 24 }: { now?: Date; locale?: string; hours?: number } = {},
): AppNotification[] {
  return events
    .filter((e) => {
      const due = new Date(e.due).getTime()
      return due >= now.getTime() && due <= now.getTime() + (e.hours ?? hours) * 3_600_000
    })
    .map((e) => ({
      id: `reminder:${e.id}:${e.due.slice(0, 10)}`,
      kind: 'reminder' as const,
      title: e.title,
      body: dueText(e.due, locale),
      ...(e.course ? { course: e.course } : {}),
      time: now.toISOString(),
      ...(e.target ? { target: e.target } : {}),
    }))
}

/** Adds what is new (by id), newest first, capped. Returns the list and what was really added. */
export function mergeNotifications(
  existing: AppNotification[],
  incoming: AppNotification[],
): { list: AppNotification[]; added: AppNotification[] } {
  // Check results replace their older entry (same id) – no new news, no banner.
  const checks = incoming.filter((n) => n.kind === 'check')
  // Suggestions ("suggest:materials" …): one per kind, replaced by the newer one; only news (unread,
  // banner) when what is suggested changed.
  const suggestions = incoming.filter((n) => n.kind !== 'check' && n.id.startsWith('suggest:'))
  const before = new Map(existing.map((n) => [n.id, n]))
  const freshSuggestions = suggestions.filter(
    (n) => before.get(n.id)?.body !== n.body || before.get(n.id)?.read === false,
  )
  const replaced = new Set([...checks, ...suggestions].map((n) => n.id))
  const rest = existing.filter((n) => !replaced.has(n.id))
  const known = new Set(rest.map((n) => n.id))
  const added = incoming.filter(
    (n) => n.kind !== 'check' && !n.id.startsWith('suggest:') && !known.has(n.id) && (known.add(n.id), true),
  )
  const kept = suggestions.filter((n) => !freshSuggestions.includes(n)).map((n) => ({ ...n, read: true }))
  const list = [...added, ...freshSuggestions, ...kept, ...checks.map((n) => ({ ...n, read: true })), ...rest]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, MAX_NOTIFICATIONS)
  return { list, added: [...added, ...freshSuggestions.filter((n) => before.get(n.id)?.body !== n.body)] }
}

/** Validates notifications read from disk or sent by the renderer (untrusted). */
export function parseNotifications(raw: unknown): AppNotification[] {
  if (!Array.isArray(raw)) return []
  const kinds: NotificationKind[] = [
    'deadline',
    'moved',
    'material',
    'updated',
    'notice',
    'grade',
    'reminder',
    'aside',
    'check',
  ]
  const str = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined)
  const out: AppNotification[] = []
  for (const n of raw.slice(0, MAX_NOTIFICATIONS)) {
    if (typeof n !== 'object' || n === null) continue
    const r = n as Record<string, unknown>
    const id = str(r.id, 300)
    const title = str(r.title)
    const time = str(r.time, 40)
    if (
      !id ||
      !title ||
      !time ||
      !kinds.includes(r.kind as NotificationKind) ||
      Number.isNaN(Date.parse(time))
    )
      continue
    const t = r.target as Record<string, unknown> | undefined
    const target: NotificationTarget | undefined =
      t?.type === 'url' && typeof t.url === 'string' && /^https?:/i.test(t.url)
        ? { type: 'url', url: t.url }
        : t?.type === 'page' && typeof t.path === 'string'
          ? { type: 'page', path: t.path }
          : t?.type === 'material' && typeof t.id === 'string' && typeof t.courseId === 'string'
            ? { type: 'material', id: t.id, courseId: t.courseId }
            : t?.type === 'route' && typeof t.hash === 'string' && /^#\/[\w%./:-]*$/.test(t.hash)
              ? { type: 'route', hash: t.hash }
              : t?.type === 'course' && typeof t.courseId === 'string' && /^course:\d+$/.test(t.courseId)
                ? { type: 'course', courseId: t.courseId }
                : t?.type === 'relogin' && (t.service === 'ecampus' || t.service === 'moodle')
                  ? { type: 'relogin', service: t.service }
                  : t?.type === 'review' &&
                      (t.what === 'study' || t.what === 'timetable' || t.what === 'materials')
                    ? { type: 'review', what: t.what }
                    : undefined
    const body = str(r.body)
    const course = str(r.course, 200)
    out.push({
      id,
      kind: r.kind as NotificationKind,
      title,
      time,
      ...(body ? { body } : {}),
      ...(course ? { course } : {}),
      ...(r.read === true ? { read: true } : {}),
      ...(target ? { target } : {}),
    })
  }
  return out
}

/** "Moodle geprüft" entry: when and what came of it (one per source, replaced each time). */
export function checkResult(
  source: string,
  title: string,
  body: string,
  now = new Date(),
  target?: NotificationTarget,
): AppNotification {
  return {
    id: `check:${source}`,
    kind: 'check',
    title,
    body,
    time: now.toISOString(),
    read: true,
    ...(target ? { target } : {}),
  }
}

const NEWS_WORDS: Partial<Record<NotificationKind, [string, string]>> = {
  deadline: ['neuer Termin', 'neue Termine'],
  moved: ['Änderung', 'Änderungen'],
  material: ['neue Datei', 'neue Dateien'],
  updated: ['geänderte Datei', 'geänderte Dateien'],
  notice: ['Mitteilung', 'Mitteilungen'],
  grade: ['neue Note', 'neue Noten'],
  reminder: ['Erinnerung', 'Erinnerungen'],
  aside: ['Hinweis (anderes Semester)', 'Hinweise (anderes Semester)'],
}

/** "2 neue Termine · 1 Mitteilung" – or "nichts Neues". */
export function newsSummary(news: AppNotification[]): string {
  const counts = new Map<NotificationKind, number>()
  for (const n of news) if (n.kind !== 'check') counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1)
  const parts = [...counts].map(([kind, n]) => {
    const [one, many] = NEWS_WORDS[kind] ?? ['Neuigkeit', 'Neuigkeiten']
    return `${n} ${n === 1 ? one : many}`
  })
  return parts.length ? parts.join(' · ') : 'nichts Neues'
}

/** "36 Kurse · 826 Unterlagen · 30 Termine" – what a check saw (zero counts left out). */
export function foundSummary(found: Array<[number, string, string]>): string {
  return found
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`)
    .join(' · ')
}

/** "2 neue Dateien („Blatt 3.pdf“, „VL07.pdf“) · 1 Mitteilung („Raumänderung“)" */
export function newsDetails(news: AppNotification[], max = 3): string {
  const groups = new Map<NotificationKind, AppNotification[]>()
  for (const n of news) if (n.kind !== 'check') groups.set(n.kind, [...(groups.get(n.kind) ?? []), n])
  return [...groups]
    .map(([kind, list]) => {
      const [one, many] = NEWS_WORDS[kind] ?? ['Neuigkeit', 'Neuigkeiten']
      const titles = list.slice(0, max).map((n) => `„${n.title.slice(0, 50)}“`)
      return `${list.length} ${list.length === 1 ? one : many} (${titles.join(', ')}${list.length > max ? ', …' : ''})`
    })
    .join(' · ')
}

/**
 * The line of every check: what was found and what of it is new – "36 Kurse · 826 Unterlagen
 * gefunden – neu: 2 neue Dateien („…“)" or "… gefunden – nichts Neues".
 */
export function checkBody(found: Array<[number, string, string]>, news: AppNotification[]): string {
  const seen = foundSummary(found)
  const fresh = news.filter((n) => n.kind !== 'check')
  const tail = fresh.length ? `neu: ${newsDetails(fresh)}` : 'nichts Neues'
  return seen ? `${seen} gefunden – ${tail}` : tail
}
