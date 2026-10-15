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
