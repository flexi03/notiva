/**
 * Notification center storage (main process): a JSON file in the app profile – device-local, never in
 * the vault. New entries can raise a system notification (Electron `Notification`).
 */
import { promises as fs } from 'node:fs'
import { mergeNotifications, parseNotifications, type AppNotification } from '../src/lib/notifications'

/** What Notiva checks in the background, each on its own interval (minutes; 0 = only by hand). */
export const CHECKS = ['moodle', 'materials', 'courseInfo', 'grades', 'examPlan'] as const
export type CheckKind = (typeof CHECKS)[number]
export const INTERVAL_OPTIONS = [0, 5, 15, 30, 60, 180, 360, 720, 1440]

export interface NotifySettings {
  /** System notifications (banner) for news. */
  system: boolean
  /** Minutes between Moodle checks (dates, messages) – same as intervals.moodle (older settings). */
  intervalMinutes: number
  intervals: Record<CheckKind, number>
}

export const DEFAULT_INTERVALS: Record<CheckKind, number> = {
  moodle: 15,
  materials: 60,
  courseInfo: 60,
  grades: 30,
  examPlan: 1440,
}

export const DEFAULT_NOTIFY: NotifySettings = {
  system: true,
  intervalMinutes: DEFAULT_INTERVALS.moodle,
  intervals: DEFAULT_INTERVALS,
}

const minutes = (v: unknown, fallback: number) => {
  const n = Number(v)
  if (!Number.isFinite(n) || v === null || v === '') return fallback
  if (n <= 0) return 0
  return Math.min(10_080, Math.max(5, Math.round(n)))
}

export function parseNotifySettings(raw: unknown): NotifySettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const given = (typeof r.intervals === 'object' && r.intervals !== null ? r.intervals : {}) as Record<
    string,
    unknown
  >
  const legacy = minutes(r.intervalMinutes, DEFAULT_INTERVALS.moodle) || DEFAULT_INTERVALS.moodle
  const intervals = Object.fromEntries(
    CHECKS.map((k) => [k, minutes(given[k], k === 'moodle' ? legacy : DEFAULT_INTERVALS[k])]),
  ) as Record<CheckKind, number>
  return {
    system: typeof r.system === 'boolean' ? r.system : DEFAULT_NOTIFY.system,
    intervalMinutes: intervals.moodle,
    intervals,
  }
}

/** Which checks are due now (never run = due; 0 = never by itself). */
export function dueChecks(
  intervals: Record<CheckKind, number>,
  last: Partial<Record<CheckKind, number>>,
  now: number,
): CheckKind[] {
  return CHECKS.filter((k) => intervals[k] > 0 && now - (last[k] ?? 0) >= intervals[k] * 60_000)
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
    const parsed = parseNotifications(incoming)
    const { list, added } = mergeNotifications(await this.all(), parsed)
    // Check results ("Moodle geprüft") and quiet notes change the list without being news.
    const known = new Set((await this.all()).map((n) => n.id))
    if (added.length === 0 && !parsed.some((n) => n.kind === 'check' || (n.quiet && !known.has(n.id))))
      return []
    this.list = list
    await this.save()
    if (added.length) this.onAdded(added)
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
