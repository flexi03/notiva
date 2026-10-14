/**
 * Moodle → study dashboard. The desktop app fetches the data (web service or calendar link, see
 * electron/moodle.ts); this file turns it into one neutral snapshot and plans the import into the
 * dashboard's databases: courses become modules, deadlines become tasks. Pure logic, no network.
 *
 * Imported pages carry `moodle: <id>` in their frontmatter, so a second import updates instead of
 * duplicating. An import never deletes anything and never touches what the user set (e.g. Status).
 */
import { propertyDef, type DatabaseDef } from './database'
import type { FrontmatterData } from './frontmatter'
import { toIsoDate } from './dates'
import type { Page, Workspace } from './workspace'

export interface MoodleCourse {
  /** Stable key, e.g. "course:42". */
  id: string
  name: string
  shortname?: string
  url?: string
}

export interface MoodleEvent {
  /** Stable key, e.g. "event:1234" or the calendar UID. */
  id: string
  title: string
  /** ISO date-time (UTC). */
  due: string
  course?: { id?: string; name: string }
  kind: 'assign' | 'quiz' | 'other'
  url?: string
}

export interface MoodleSnapshot {
  site: string
  source: 'webservice' | 'calendar'
  user?: string
  fetchedAt: string
  courses: MoodleCourse[]
  events: MoodleEvent[]
  grades: Array<{ course: string; grade: string }>
}

/* ---------- iCalendar (Moodle: Kalender → Exportieren → Kalender-URL) ---------- */

export interface IcsEvent {
  uid?: string
  summary?: string
  description?: string
  categories?: string
  start?: Date
  url?: string
}

/** Minimal RFC 5545 reader: unfolds lines, unescapes text, reads VEVENTs. Never throws. */
export function parseIcs(text: string): IcsEvent[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
  const events: IcsEvent[] = []
  let current: IcsEvent | null = null
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') current = {}
    else if (line === 'END:VEVENT') {
      if (current) events.push(current)
      current = null
    } else if (current) {
      const colon = line.indexOf(':')
      if (colon < 0) continue
      const [name, ...params] = line.slice(0, colon).split(';')
      const value = line.slice(colon + 1)
      switch (name!.toUpperCase()) {
        case 'UID':
          current.uid = value.trim()
          break
        case 'SUMMARY':
          current.summary = unescapeIcs(value)
          break
        case 'DESCRIPTION':
          current.description = unescapeIcs(value)
          break
        case 'CATEGORIES':
          current.categories = unescapeIcs(value)
          break
        case 'URL':
          current.url = value.trim()
          break
        case 'DTSTART': {
          const date = parseIcsDate(value, params)
          if (date) current.start = date
          break
        }
      }
    }
    if (events.length > 5000) break
  }
  return events
}

function unescapeIcs(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c)).trim()
}

function parseIcsDate(value: string, params: string[]): Date | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h = '0', mi = '0', s = '0', z] = m
  const parts = [Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)] as const
  // UTC ("Z") or floating/TZID (Moodle exports UTC; others are read as local time).
  const date =
    z || params.some((p) => /^TZID=(UTC|Etc\/UTC|GMT)$/i.test(p))
      ? new Date(Date.UTC(...parts))
      : new Date(...parts)
  return Number.isNaN(date.getTime()) ? null : date
}

/** "Übungsblatt 3 ist fällig" → "Übungsblatt 3" (Moodle's calendar names). */
export function cleanEventTitle(title: string): string {
  return (
    title
      .replace(/\s+(ist|sind) fällig\.?$/i, '')
      .replace(/\s+is due\.?$/i, '')
      .replace(/\s+(endet|schließt|closes|ends)\.?$/i, '')
      .replace(/^(Fälligkeit|Abgabe(termin)?|Due):\s*/i, '')
      .trim() || title.trim()
  )
}

function kindOf(text: string): MoodleEvent['kind'] {
  if (/assign|aufgabe/i.test(text)) return 'assign'
  if (/quiz|test/i.test(text)) return 'quiz'
  return 'other'
}

export function snapshotFromIcs(text: string, site: string, now = new Date()): MoodleSnapshot {
  const events = parseIcs(text)
    .filter((e) => e.summary && e.start)
    .map((e): MoodleEvent => {
      const course = e.categories?.split(',')[0]?.trim()
      return {
        id: `ics:${e.uid ?? `${e.summary}@${e.start!.toISOString()}`}`,
        title: cleanEventTitle(e.summary!),
        due: e.start!.toISOString(),
        ...(course ? { course: { name: course } } : {}),
        kind: kindOf(e.summary!),
        ...(e.url && /^https?:/i.test(e.url) ? { url: e.url } : {}),
      }
    })
  return { site, source: 'calendar', fetchedAt: now.toISOString(), courses: [], events, grades: [] }
}

/* ---------- Web service (REST, JSON) ---------- */

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')
/** Moodle returns course/activity names with HTML entities and sometimes tags. */
function plain(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .trim()
}

/** Builds the snapshot from the raw web service answers (all untrusted). */
export function snapshotFromWebService(
  site: string,
  raw: { siteInfo: unknown; courses: unknown; events: unknown; grades?: unknown },
  now = new Date(),
): MoodleSnapshot {
  const base = site.replace(/\/+$/, '')
  const info = isObject(raw.siteInfo) ? raw.siteInfo : {}
  const courses = (Array.isArray(raw.courses) ? raw.courses : [])
    .filter(isObject)
    .filter((c) => c.id !== undefined && plain(c.fullname || c.displayname))
    .slice(0, 500)
    .map((c): MoodleCourse => ({
      id: `course:${text(c.id)}`,
      name: plain(c.displayname || c.fullname),
      ...(plain(c.shortname) ? { shortname: plain(c.shortname) } : {}),
      url: `${base}/course/view.php?id=${encodeURIComponent(text(c.id))}`,
    }))
  const byId = new Map(courses.map((c) => [c.id, c]))
  const list = isObject(raw.events) && Array.isArray(raw.events.events) ? raw.events.events : []
  const events = list
    .filter(isObject)
    .filter((e) => e.id !== undefined && plain(e.name) && typeof (e.timesort ?? e.timestart) === 'number')
    .slice(0, 1000)
    .map((e): MoodleEvent => {
      const courseRef = isObject(e.course) ? e.course : {}
      const courseId = courseRef.id !== undefined ? `course:${text(courseRef.id)}` : undefined
      const courseName = byId.get(courseId ?? '')?.name ?? plain(courseRef.fullname)
      const url = text(e.url)
      return {
        id: `event:${text(e.id)}`,
        title: cleanEventTitle(plain(e.activityname) || plain(e.name)),
        due: new Date(Number(e.timesort ?? e.timestart) * 1000).toISOString(),
        ...(courseName ? { course: { ...(courseId ? { id: courseId } : {}), name: courseName } } : {}),
        kind: kindOf(text(e.modulename)),
        ...(/^https?:/i.test(url) ? { url } : {}),
      }
    })
  const gradeList = isObject(raw.grades) && Array.isArray(raw.grades.grades) ? raw.grades.grades : []
  const grades = gradeList
    .filter(isObject)
    .map((g) => ({ course: byId.get(`course:${text(g.courseid)}`)?.name ?? '', grade: plain(g.grade) }))
    .filter((g) => g.course && g.grade && g.grade !== '-')
  const user = plain(info.fullname)
  return {
    site: base,
    source: 'webservice',
    ...(user ? { user } : {}),
    fetchedAt: now.toISOString(),
    courses,
    events,
    grades,
  }
}

/* ---------- import plan ---------- */

export interface ImportTarget {
  /** Folder of the dashboard, e.g. "Studium". */
  folder: string
  modules?: string
  tasks?: string
}

export type PlanItem =
  | {
      kind: 'create'
      key: string
      db: string
      title: string
      values: FrontmatterData
      what: 'module' | 'task'
    }
  | {
      kind: 'update'
      key: string
      path: string
      title: string
      changes: FrontmatterData
      what: 'module' | 'task'
    }

/** Dashboards that have a tasks and/or modules database (named like in the study template). */
export function importTargets(ws: Workspace): ImportTarget[] {
  const byFolder = new Map<string, ImportTarget>()
  for (const db of ws.databases()) {
    const folder = db.path.includes('/') ? db.path.slice(0, db.path.lastIndexOf('/')) : ''
    const role = /^(aufgaben|tasks|abgaben)$/i.test(db.title)
      ? 'tasks'
      : /^(module|kurse|courses|modules)$/i.test(db.title)
        ? 'modules'
        : null
    if (!role) continue
    const target = byFolder.get(folder) ?? { folder }
    target[role] ??= db.path
    byFolder.set(folder, target)
  }
  return [...byFolder.values()].sort(
    (a, b) => Number(!!b.tasks && !!b.modules) - Number(!!a.tasks && !!a.modules),
  )
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()

function option(def: DatabaseDef, property: string, wanted: string[]): string | undefined {
  const prop = propertyDef(def, property)
  if (!prop) return undefined
  if (prop.type !== 'select') return prop.type === 'text' ? wanted[0] : undefined
  return wanted.find((w) => prop.options?.some((o) => o.value === w))
}

function rowsByKey(ws: Workspace, db: string): Map<string, Page> {
  return new Map(
    ws
      .rows(db)
      .filter((r) => typeof r.data.moodle === 'string')
      .map((r) => [String(r.data.moodle), ws.get(r.path)!]),
  )
}

/**
 * What an import would do. Courses: new modules (matched by Moodle id, then by name or short
 * name). Deadlines from today on: new tasks, or a new due date for already imported ones.
 */
export function planMoodleImport(
  ws: Workspace,
  snapshot: MoodleSnapshot,
  target: ImportTarget,
  now = new Date(),
): PlanItem[] {
  const plan: PlanItem[] = []
  const moduleDb = target.modules ? ws.get(target.modules)?.database : undefined
  const taskDb = target.tasks ? ws.get(target.tasks)?.database : undefined
  /** Module page per Moodle course id and per (short) name – for linking tasks. */
  const modules = new Map<string, string>()

  if (target.modules && moduleDb) {
    const known = rowsByKey(ws, target.modules)
    const byName = new Map(ws.rows(target.modules).map((r) => [norm(r.title), r.path]))
    for (const course of snapshot.courses) {
      const existing =
        known.get(course.id)?.path ??
        byName.get(norm(course.name)) ??
        (course.shortname ? byName.get(norm(course.shortname)) : undefined)
      if (existing) {
        modules.set(course.id, existing)
        const page = ws.get(existing)!
        const changes: FrontmatterData = {}
        if (page.data.moodle !== course.id) changes.moodle = course.id
        if (course.url && propertyDef(moduleDb, 'Link')?.type === 'url' && !page.data.Link)
          changes.Link = course.url
        if (Object.keys(changes).length)
          plan.push({
            kind: 'update',
            key: course.id,
            path: existing,
            title: page.title,
            changes,
            what: 'module',
          })
        continue
      }
      const values: FrontmatterData = { moodle: course.id }
      const status = option(moduleDb, 'Status', ['Laufend'])
      if (status) values.Status = status
      if (course.url && propertyDef(moduleDb, 'Link')?.type === 'url') values.Link = course.url
      plan.push({
        kind: 'create',
        key: course.id,
        db: target.modules,
        title: course.name,
        values,
        what: 'module',
      })
    }
  }

  if (target.tasks && taskDb) {
    const known = rowsByKey(ws, target.tasks)
    const moduleRows = target.modules ? ws.rows(target.modules) : []
    const relation = propertyDef(taskDb, 'Modul')?.type === 'relation' ? 'Modul' : undefined
    const linkFor = (event: MoodleEvent): string | undefined => {
      if (!event.course) return undefined
      const path =
        (event.course.id ? modules.get(event.course.id) : undefined) ??
        moduleRows.find(
          (r) =>
            norm(r.title) === norm(event.course!.name) ||
            (!!event.course!.id && r.data.moodle === event.course!.id),
        )?.path
      if (path) return ws.linkText(path)
      // A module created in the same import.
      const created = plan.find(
        (p) =>
          p.kind === 'create' &&
          p.what === 'module' &&
          (p.key === event.course!.id || norm(p.title) === norm(event.course!.name)),
      )
      return created ? created.title : undefined
    }
    const today = toIsoDate(now)
    for (const event of snapshot.events) {
      const due = toIsoDate(new Date(event.due))
      const page = known.get(event.id)
      if (page) {
        if (page.data.Fällig !== due)
          plan.push({
            kind: 'update',
            key: event.id,
            path: page.path,
            title: page.title,
            changes: { Fällig: due },
            what: 'task',
          })
        continue
      }
      if (due < today) continue
      const values: FrontmatterData = { moodle: event.id }
      if (propertyDef(taskDb, 'Fällig')) values.Fällig = due
      const status = option(taskDb, 'Status', ['Offen'])
      if (status) values.Status = status
      const art = option(
        taskDb,
        'Art',
        /blatt|sheet|übung/i.test(event.title)
          ? ['Übungsblatt', 'Abgabe']
          : event.kind === 'quiz'
            ? ['Lernen', 'Testat']
            : ['Abgabe'],
      )
      if (art) values.Art = art
      const link = relation ? linkFor(event) : undefined
      if (relation && link) values[relation] = [`[[${link}]]`]
      if (event.url && propertyDef(taskDb, 'Link')?.type === 'url') values.Link = event.url
      plan.push({ kind: 'create', key: event.id, db: target.tasks, title: event.title, values, what: 'task' })
    }
  }
  return plan
}

/** Applies the chosen plan items (modules first, so tasks can link them). Returns touched paths. */
export async function applyMoodleImport(ws: Workspace, items: PlanItem[]): Promise<string[]> {
  const touched: string[] = []
  const ordered = [...items].sort((a, b) => Number(a.what === 'task') - Number(b.what === 'task'))
  const createdModules = new Map<string, string>()
  for (const item of ordered) {
    if (item.kind === 'create') {
      const values = { ...item.values }
      // Relation to a module created just now: use its real link text.
      for (const [key, value] of Object.entries(values)) {
        if (!Array.isArray(value)) continue
        values[key] = value.map((v) => {
          const name = typeof v === 'string' ? v.replace(/^\[\[|\]\]$/g, '') : ''
          const path = createdModules.get(norm(name))
          return path ? `[[${ws.linkText(path)}]]` : v
        })
      }
      const path = await ws.createRow(item.db, item.title, values)
      if (item.what === 'module') createdModules.set(norm(item.title), path)
      touched.push(path)
    } else {
      const page = ws.get(item.path)
      if (!page) continue
      await ws.save(item.path, { data: { ...page.data, ...item.changes } })
      touched.push(item.path)
    }
  }
  return touched
}
