/**
 * Notification center storage (main process): a JSON file in the app profile – device-local, never in
 * the vault. New entries can raise a system notification (Electron `Notification`).
 */
import { promises as fs } from 'node:fs'
import { mergeNotifications, parseNotifications, type AppNotification } from '../src/lib/notifications'

export interface NotifySettings {
  /** System notifications (banner) for news. */
  system: boolean
  /** Minutes between Moodle checks. */
  intervalMinutes: number
}

export const DEFAULT_NOTIFY: NotifySettings = { system: true, intervalMinutes: 15 }

export function parseNotifySettings(raw: unknown): NotifySettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const minutes = Number(r.intervalMinutes)
  return {
    system: typeof r.system === 'boolean' ? r.system : DEFAULT_NOTIFY.system,
    intervalMinutes: Number.isFinite(minutes)
      ? Math.min(240, Math.max(5, Math.round(minutes)))
      : DEFAULT_NOTIFY.intervalMinutes,
  }
}

export class NotificationStore {
  private list: AppNotification[] | null = null

  constructor(
    private readonly file: string,
    /** Called with entries that are really new (for banners and the renderer). */
    private readonly onAdded: (added: AppNotification[]) => void,
    private readonly onChanged: () => void,
  ) {}

  async all(): Promise<AppNotification[]> {
    if (this.list) return this.list
    try {
      this.list = parseNotifications(JSON.parse(await fs.readFile(this.file, 'utf8')))
    } catch {
      this.list = []
    }
    return this.list
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.file, JSON.stringify(this.list ?? []), { mode: 0o600 })
    this.onChanged()
  }

  async add(incoming: AppNotification[]): Promise<AppNotification[]> {
    if (incoming.length === 0) return []
    const { list, added } = mergeNotifications(await this.all(), parseNotifications(incoming))
    if (added.length === 0) return []
    this.list = list
    await this.save()
    this.onAdded(added)
    return added
  }

  async markRead(ids: string[] | 'all'): Promise<void> {
    const list = await this.all()
    this.list = list.map((n) => (ids === 'all' || ids.includes(n.id) ? { ...n, read: true } : n))
    await this.save()
  }

  async clear(): Promise<void> {
    this.list = []
    await this.save()
  }
}
