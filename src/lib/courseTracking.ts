/**
 * How loud each Moodle course may be in the notifications – from the module pages:
 *
 * - "track": the current course of a module one still takes (attends, planned, lab open, retake …)
 *   – everything as news.
 * - "notices": module passed or only the exam left (registered, grade pending) and orga courses –
 *   forum posts and grades as news; new files, changed course texts and dates only as a quiet note.
 * - "quiet": everything else (another semester, older terms of a module, courses without a
 *   module) – one quiet note per course and check, no counter, no banner.
 *
 * The app computes it (it knows the module pages) and stores it in the folder
 * (.notiva/course-tracking.json); the background check in the main process reads it. Pure.
 */
import type { FrontmatterData } from './frontmatter'
import type { MoodleCourse } from './moodle'
import type { CourseChoice } from './notifications'
import { currentCourse, courseIdsOf } from './study/modules'
import { isOrgaCourse, nameScore } from './study/match'
import { parseTerm, termIndex, termOf } from './study/terms'

export type TrackingLevel = 'track' | 'notices' | 'quiet'
/** Why a course is quieter: another semester (user's choice), module done, not a current module. */
export type QuietReason = 'later' | 'done' | 'orga' | 'other'

export interface CourseTrack {
  level: TrackingLevel
  reason?: QuietReason
}

export interface CourseTracking {
  /** Per course id; courses not listed (enrolled since) are judged by their name (`byName`). */
  courses: Record<string, CourseTrack>
}

export const COURSE_TRACKING_META = 'course-tracking.json'

/** Only the exam left or done – unless one still attends something (lecture, lab, exercise). */
const DONE = new Set(['Bestanden', 'Endgültig nicht bestanden', 'Prüfung angemeldet', 'Note ausstehend'])

export function moduleIsActive(data: FrontmatterData): boolean {
  const attends = Array.isArray(data.Belegung) && data.Belegung.some((b) => b !== 'Prüfung')
  if (attends || data.Praktikum === 'Offen') return true
  return !DONE.has(String(data.Status ?? ''))
}

/** A course no module page lists: orga courses quieter, this semester's courses (not synced yet) count. */
export function byName(course: { name: string; shortname?: string }, now: Date): CourseTrack {
  if (isOrgaCourse(course.name)) return { level: 'notices', reason: 'orga' }
  const term = parseTerm(course.name) ?? parseTerm(course.shortname)
  if (term && termIndex(term) === termIndex(termOf(now))) return { level: 'track' }
  return { level: 'quiet', reason: 'other' }
}

export function courseTracking(input: {
  courses: MoodleCourse[]
  /** module pages (title for courses no page links yet – matched by name like the study sync) */
  modules: Array<{ title?: string; data: FrontmatterData }>
  choices: Record<string, CourseChoice>
  now: Date
}): CourseTracking {
  const { courses, modules, choices, now } = input
  const setAside = (id: string) => !!choices[id]
  // Each course's module: linked on the page (`kurse:`), else the best name match.
  const moduleOf = new Map<string, number>()
  for (const course of courses) {
    const linked = modules.findIndex((m) => courseIdsOf(m.data).includes(course.id))
    if (linked >= 0) {
      moduleOf.set(course.id, linked)
      continue
    }
    let best = -1
    let bestScore = 0.75
    modules.forEach((m, i) => {
      const score = m.title ? nameScore(course.name, m.title) : 0
      if (score >= bestScore) [best, bestScore] = [i, score]
    })
    if (best >= 0) moduleOf.set(course.id, best)
  }
  const out: Record<string, CourseTrack> = {}
  for (const course of courses) {
    const index = moduleOf.get(course.id)
    if (choices[course.id] === 'later') out[course.id] = { level: 'quiet', reason: 'later' }
    else if (index === undefined) out[course.id] = byName(course, now)
    else {
      // Several courses for one module (older terms): only the current one counts.
      const own = courses.filter((c) => moduleOf.get(c.id) === index)
      if (currentCourse(own, setAside, now) !== course.id)
        out[course.id] = { level: 'quiet', reason: 'other' }
      else
        out[course.id] = moduleIsActive(modules[index]!.data)
          ? { level: 'track' }
          : { level: 'notices', reason: 'done' }
    }
  }
  return { courses: out }
}

/** Validates the stored file (untrusted); null when there is none – then every course counts. */
export function parseCourseTracking(raw: unknown): CourseTracking | null {
  if (typeof raw !== 'object' || raw === null) return null
  const given = (raw as { courses?: unknown }).courses
  if (typeof given !== 'object' || given === null) return null
  const levels: TrackingLevel[] = ['track', 'notices', 'quiet']
  const reasons: QuietReason[] = ['later', 'done', 'orga', 'other']
  const courses: Record<string, CourseTrack> = {}
  for (const [id, v] of Object.entries(given)) {
    const r = v as Partial<CourseTrack> | null
    if (!/^course:\d+$/.test(id) || !r || !levels.includes(r.level as TrackingLevel)) continue
    courses[id] = {
      level: r.level as TrackingLevel,
      ...(reasons.includes(r.reason as QuietReason) ? { reason: r.reason } : {}),
    }
  }
  return { courses }
}

/** The level of one course ("später" always quiet; no file: every other course counts as before). */
export function trackOf(
  tracking: CourseTracking | null,
  choices: Record<string, CourseChoice>,
  course: { id: string; name: string; shortname?: string } | undefined,
  now: Date,
): CourseTrack {
  if (course && choices[course.id] === 'later') return { level: 'quiet', reason: 'later' }
  if (!tracking || !course) return { level: 'track' }
  return tracking.courses[course.id] ?? byName(course, now)
}
