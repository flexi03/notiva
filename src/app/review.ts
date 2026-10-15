import { useApp } from '@/app/store'
import type { Workspace } from '@/lib/workspace'

/** "Ansehen" on a suggestion: opens the preview where the user decides. */
export async function review(what: 'study' | 'timetable' | 'materials', ws: Workspace): Promise<void> {
  // Looked at = no longer counted as open (a newer suggestion comes back as unread).
  const { useNotifications } = await import('@/app/notifications')
  void useNotifications.getState().markRead([`suggest:${what}`])
  if (what === 'study') return useApp.getState().setStudyDialog(true)
  if (what === 'timetable') {
    const { suggestTimetable } = await import('@/app/schedule')
    await suggestTimetable(ws, true)
    return
  }
  const { reviewMaterials } = await import('@/app/materials')
  await reviewMaterials(ws)
}
