import { create } from 'zustand'
import { parseCourseChoices, type CourseChoice } from '@/lib/notifications'
import type { Workspace } from '@/lib/workspace'

/**
 * Moodle courses the user is enrolled in but does not take now: "later" (another semester – look
 * only) or "ignore" (not counted at all). Stored in the folder (.notiva/course-choices.json) and
 * used by the study sync (status, attendance), timetable suggestions and new materials.
 */
export type { CourseChoice }
/** Also read by the background check in the main process (lib/notifications: parseCourseChoices). */
export const COURSE_CHOICES_META = 'course-choices.json'
const META = COURSE_CHOICES_META

export const useCourseChoices = create<Record<string, CourseChoice>>(() => ({}))

export async function loadCourseChoices(ws: Workspace): Promise<void> {
  useCourseChoices.setState(parseCourseChoices(await ws.readMeta<unknown>(META).catch(() => null)), true)
}

export async function setCourseChoice(ws: Workspace, id: string, choice: CourseChoice | null): Promise<void> {
  const next = { ...useCourseChoices.getState() }
  if (choice) next[id] = choice
  else delete next[id]
  useCourseChoices.setState(next, true)
  await ws.writeMeta(META, next)
}

/** Counts for this semester (not "later" or "ignore"). */
export const courseCounts = (id: string) => !useCourseChoices.getState()[id]
