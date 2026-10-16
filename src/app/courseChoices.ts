import { create } from 'zustand'
import type { Workspace } from '@/lib/workspace'

/**
 * Moodle courses the user is enrolled in but does not take now: "later" (another semester – look
 * only) or "ignore" (not counted at all). Stored in the folder (.notiva/course-choices.json) and
 * used by the study sync (status, attendance), timetable suggestions and new materials.
 */
export type CourseChoice = 'later' | 'ignore'
const META = 'course-choices.json'

export const useCourseChoices = create<Record<string, CourseChoice>>(() => ({}))

export async function loadCourseChoices(ws: Workspace): Promise<void> {
  const raw = await ws.readMeta<Record<string, unknown>>(META).catch(() => null)
  const next: Record<string, CourseChoice> = {}
  for (const [id, v] of Object.entries(raw ?? {})) if (v === 'later' || v === 'ignore') next[id] = v
  useCourseChoices.setState(next, true)
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
