import { useCourseChoices } from '@/app/courseChoices'
import { useMoodle } from '@/app/moodle'
import { modulePages } from '@/app/studyPlan'
import { COURSE_TRACKING_META, courseTracking, trackOf, type CourseTrack } from '@/lib/courseTracking'
import { findStudyDashboard } from '@/lib/study/sync'
import type { Workspace } from '@/lib/workspace'

let written = ''

/** How loud each course may be right now (same rules as the background check). */
export function courseLevels(ws: Workspace, now = new Date()): (courseId: string) => CourseTrack {
  const courses = useMoodle.getState().snapshot?.courses ?? []
  const choices = useCourseChoices.getState()
  const tracking = findStudyDashboard(ws)
    ? courseTracking({ courses, modules: modulePages(ws), choices, now })
    : null
  return (id) =>
    trackOf(
      tracking,
      choices,
      courses.find((c) => c.id === id),
      now,
    )
}

/**
 * Stores how loud each Moodle course may be (lib/courseTracking) for the background check in the
 * main process – from the module pages, the courses of the last fetch and the course choices.
 * Only written when it changed; without a study folder nothing is written (every course counts).
 */
export async function saveCourseTracking(ws: Workspace, now = new Date()): Promise<void> {
  const courses = useMoodle.getState().snapshot?.courses
  if (!courses?.length || !findStudyDashboard(ws)) return
  const tracking = courseTracking({
    courses,
    modules: modulePages(ws),
    choices: useCourseChoices.getState(),
    now,
  })
  const text = JSON.stringify(tracking)
  if (text === written) return
  if (!written && JSON.stringify(await ws.readMeta(COURSE_TRACKING_META).catch(() => null)) === text) {
    written = text
    return
  }
  written = text
  await ws.writeMeta(COURSE_TRACKING_META, tracking)
}

/** Keeps the file current while the folder is open: module pages, choices or courses changed. */
export function watchCourseTracking(ws: Workspace): () => void {
  written = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const later = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void saveCourseTracking(ws).catch(() => undefined), 3000)
  }
  later()
  const offs = [ws.subscribe(later), useCourseChoices.subscribe(later), useMoodle.subscribe(later)]
  return () => {
    if (timer) clearTimeout(timer)
    offs.forEach((off) => off())
  }
}
