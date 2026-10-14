import { create } from 'zustand'
import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import type { MoodleSnapshot } from '@/lib/moodle'
import { electronBridge, type MoodleBridge, type MoodleStatus } from '@/lib/vault'

interface MoodleState {
  status: MoodleStatus | null
  /** Last fetched data (courses, deadlines …). */
  snapshot: MoodleSnapshot | null
  loading: boolean
  error: string | null
  /** Loads the last fetch, then fetches fresh data. */
  load(): Promise<void>
  fetchNow(): Promise<MoodleSnapshot | null>
  open(url: string, external: boolean): Promise<void>
  /** Import dialog open (from settings or a dashboard's page menu). */
  importOpen: boolean
  refresh(): Promise<void>
  connect(request: Parameters<MoodleBridge['connect']>[0]): Promise<MoodleStatus>
  disconnect(): Promise<void>
  setImportOpen(open: boolean): void
}

export function moodleAvailable(): boolean {
  return Boolean(electronBridge()?.moodle)
}

/** Moodle connection (desktop app only; the access itself stays in the main process). */
export const useMoodle = create<MoodleState>((set) => ({
  status: null,
  snapshot: null,
  loading: false,
  error: null,
  importOpen: false,
  async load() {
    const bridge = electronBridge()?.moodle
    if (!bridge) return
    const cached = await bridge.snapshot()
    if (cached) set({ snapshot: cached })
    await useMoodle.getState().fetchNow()
  },
  async fetchNow() {
    const bridge = electronBridge()?.moodle
    if (!bridge || !useMoodle.getState().status?.connected) return null
    set({ loading: true, error: null })
    try {
      const snapshot = await withProgress(
        t('moodle.fetching'),
        async (task) => {
          const off = bridge.onProgress((e) => task.update(e.done, e.total, e.text))
          try {
            return await bridge.fetch()
          } finally {
            off()
          }
        },
        {
          success: (s) =>
            t('moodle.fetched', {
              courses: s.courses.length,
              materials: s.materials?.length ?? 0,
              events: s.events.length,
            }),
        },
      )
      set({ snapshot, loading: false })
      return snapshot
    } catch (e) {
      set({ loading: false, error: ipcMessage(e) })
      return null
    }
  },
  open: (url, external) => electronBridge()!.moodle!.open(url, external),
  async refresh() {
    const bridge = electronBridge()?.moodle
    set({ status: bridge ? await bridge.status() : { connected: false } })
  },
  async connect(request) {
    const status = await electronBridge()!.moodle!.connect(request)
    set({ status })
    return status
  },
  async disconnect() {
    set({ status: await electronBridge()!.moodle!.disconnect(), snapshot: null })
  },
  setImportOpen: (importOpen) => set({ importOpen }),
}))

/** Message of an error thrown in the main process (without Electron's IPC prefix). */
export function ipcMessage(e: unknown): string {
  return e instanceof Error
    ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
    : String(e)
}
