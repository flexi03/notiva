import { parseTerm, termIndex, termOf } from './terms'
/**
 * Modules are the centre of the study folder: a module page knows its Moodle courses (`kurse:`,
 * course ids of all terms), its materials live in "Unterlagen/<Modul>/…". Moodle courses without a
 * module (orientation, faculty news …) go to "Unterlagen/Orga/<Kurs>". Pure helpers.
 */
import { safeFileName } from '../moodle'
import type { FrontmatterData } from '../frontmatter'

export const ORGA_FOLDER = 'Orga'

/** The course ids a module page stands for (`kurse:`; a page from the Moodle import: `moodle:`). */
export function courseIdsOf(data: FrontmatterData): string[] {
  const raw = data.kurse
  const list = Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
  if (typeof data.moodle === 'string' && data.moodle.startsWith('course:') && !list.includes(data.moodle))
    list.push(data.moodle)
  return list
}

/** The module (page) a Moodle course belongs to. */
export function moduleOfCourse<T extends { data: FrontmatterData }>(
  rows: T[],
  courseId: string,
): T | undefined {
  return rows.find((r) => courseIdsOf(r.data).includes(courseId))
}

/** Folder of a course's materials: the module's folder, else "Orga/<course>". */
export function materialFolderFor(base: string, course: { name: string }, moduleTitle?: string): string {
  return moduleTitle
    ? `${base}/${safeFileName(moduleTitle)}`
    : `${base}/${ORGA_FOLDER}/${safeFileName(course.name)}`
}

/**
 * Folder of one course's term inside a module with several courses: "Datenbanksysteme 2 - WiSe
 * 2025/26" → "WiSe 25-26" (a new lecturer, a new term – its own material). Course without term in
 * its name: its short name.
 */
export function termFolder(course: { name: string; shortname?: string }): string {
  const m = /(WiSe|WS|SoSe|SS)\s*(?:20)?(\d{2})(?:\s*[/ -]\s*(?:20)?(\d{2}))?/i.exec(course.name)
  if (m) return `${/^w/i.test(m[1]!) ? 'WiSe' : 'SoSe'} ${m[2]}${m[3] ? `-${m[3]}` : ''}`
  return safeFileName(course.shortname || course.name).slice(0, 40)
}

/** "WiSe 25-26", "SoSe 26" … – a term folder name. */
export const isTermFolder = (name: string) => /^(WiSe|SoSe) \d{2}(-\d{2})?$/.test(name)

/**
 * The course of a module that is current: of this term (not set aside), else one without a term in
 * its name (a course kept every term, e.g. "BMI 32: Datenbanksysteme 2"), else the newest.
 */
export function currentCourse(
  courses: Array<{ id: string; name: string }>,
  setAside: (id: string) => boolean,
  now: Date,
): string | null {
  const open = courses.filter((c) => !setAside(c.id))
  const nowIndex = termIndex(termOf(now))
  const withTerm = open.map((c) => ({ c, term: parseTerm(c.name) }))
  const thisTerm = withTerm.find((x) => x.term && termIndex(x.term) === nowIndex)
  if (thisTerm) return thisTerm.c.id
  const timeless = withTerm.find((x) => !x.term)
  if (timeless) return timeless.c.id
  const newest = withTerm.sort((a, b) => termIndex(b.term!) - termIndex(a.term!))[0]
  return newest?.c.id ?? null
}

export const ARCHIVE_FOLDER = 'Archiv'
