/**
 * Notification center: what's new since the last look. Built from two Moodle snapshots (new
 * deadlines, moved deadlines, new or updated materials, Moodle's own notifications, grades) and
 * from due dates (reminders). Pure logic – the desktop app polls, stores and shows them.
 */
import type { MoodleEvent, MoodleSnapshot } from './moodle'

export type NotificationKind = 'deadline' | 'moved' | 'material' | 'updated' | 'notice' | 'grade' | 'reminder'

export type NotificationTarget =
  | { type: 'url'; url: string }
  | { type: 'page'; path: string }
  | { type: 'material'; id: string; courseId: string }

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
}

/**
 * News between two fetches. The very first fetch (no `previous`) is the baseline and reports
 * nothing – otherwise every existing file would show up as "new".
 */
export function moodleNews(
  previous: MoodleSnapshot | null,
  next: MoodleSnapshot,
  { now = new Date(), locale = 'de-DE', pages = new Map() }: NewsOptions = {},
): AppNotification[] {
  if (!previous || previous.site !== next.site) return []
  const found = now.toISOString()
  const news: AppNotification[] = []
  const oldEvents = new Map(previous.events.map((e) => [e.id, e]))
  for (const event of next.events) {
    if (new Date(event.due).getTime() < now.getTime()) continue
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
    for (const m of next.materials) {
      const old = oldMaterials.get(m.id)
      const changed = old && m.modified && old.modified && m.modified !== old.modified
      if (old && !changed) continue
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
  events: Array<{ id: string; title: string; due: string; course?: string; target?: NotificationTarget }>,
  { now = new Date(), locale = 'de-DE', hours = 24 }: { now?: Date; locale?: string; hours?: number } = {},
): AppNotification[] {
  const until = now.getTime() + hours * 3_600_000
  return events
    .filter((e) => {
      const due = new Date(e.due).getTime()
      return due >= now.getTime() && due <= until
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
  const known = new Set(existing.map((n) => n.id))
  const added = incoming.filter((n) => !known.has(n.id) && (known.add(n.id), true))
  const list = [...added, ...existing]
    .sort((a, b) => b.time.localeCompare(a.time))
    .slice(0, MAX_NOTIFICATIONS)
  return { list, added }
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
