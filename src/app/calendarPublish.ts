import { calendarFeed } from '@/app/calendarFeed'
import { useMoodle } from '@/app/moodle'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** Hands the current calendar to the feed server (only when the feed is switched on). */
export async function publishCalendar(ws: Workspace): Promise<boolean> {
  const bridge = electronBridge()?.calendar
  if (!bridge || !(await bridge.status()).enabled) return false
  await bridge.publish(calendarFeed(ws, useMoodle.getState().snapshot))
  return true
}
