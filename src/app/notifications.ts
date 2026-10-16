import { create } from 'zustand'
import { getLanguage } from '@/i18n'
import { propertyDef } from '@/lib/database'
import { reminderHours } from '@/lib/labPlan'
import { importTargets } from '@/lib/moodle'
import {
  deadlineReminders,
  mergeNotifications,
  parseNotifications,
  type AppNotification,
} from '@/lib/notifications'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

const LOCAL_KEY = 'notiva.notifications'

interface NotificationState {
  list: AppNotification[]
  load(): Promise<void>
  add(items: AppNotification[]): Promise<void>
  markRead(ids: string[] | 'all'): Promise<void>
  clear(): Promise<void>
}

function readLocal(): AppNotification[] {
  try {
    return parseNotifications(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '[]'))
  } catch {
    return []
  }
}

function writeLocal(list: AppNotification[]): void {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(list))
  } catch {
    // Private mode: the list lives until the tab closes.
  }
}

/**
 * The notification center. Desktop: stored by the main process (which also polls Moodle and shows
 * system banners). Browser: only reminders for the vault's tasks, kept in this browser.
 */
export const useNotifications = create<NotificationState>((set, get) => ({
  list: [],
  async load() {
    const bridge = electronBridge()?.notifications
    set({ list: bridge ? await bridge.list() : readLocal() })
  },
  async add(items) {
    const bridge = electronBridge()?.notifications
    if (bridge) return bridge.add(items) // the change event reloads the list
    const { list } = mergeNotifications(get().list, items)
    writeLocal(list)
    set({ list })
  },
  async markRead(ids) {
    const bridge = electronBridge()?.notifications
    if (bridge) return bridge.markRead(ids)
    const list = get().list.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n))
    writeLocal(list)
    set({ list })
  },
  async clear() {
    const bridge = electronBridge()?.notifications
    if (bridge) return bridge.clear()
    writeLocal([])
    set({ list: [] })
  },
}))

export const unreadCount = (list: AppNotification[]) => list.filter((n) => !n.read).length

/**
 * Reminders for the vault's own open tasks due within a day (Moodle tasks are reminded by the
 * poller already). Date-only due dates count as "end of that day".
 */
export function taskReminders(ws: Workspace, now = new Date()): AppNotification[] {
  const events: Parameters<typeof deadlineReminders>[0] = []
  for (const target of importTargets(ws)) {
    if (!target.tasks) continue
    const db = ws.get(target.tasks)?.database
    if (!db || !propertyDef(db, 'Fällig')) continue
    for (const row of ws.rows(target.tasks)) {
      const due = row.data.Fällig
      if (typeof due !== 'string' || typeof row.data.moodle === 'string' || row.data.Status === 'Erledigt')
        continue
      const end = /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:00`) : new Date(due)
      if (Number.isNaN(end.getTime())) continue
      // "Erinnerung: 2 Std. vorher" / "Keine" (lab dates, preparations …).
      const lead = reminderHours(row.data.Erinnerung)
      if (lead === null) continue
      events.push({
        hours: lead,
        id: `task:${row.path}`,
        title: row.title,
        due: end.toISOString(),
        target: { type: 'page', path: row.path },
      })
    }
  }
  return deadlineReminders(events, { now, locale: getLanguage() === 'en' ? 'en-US' : 'de-DE' })
}
