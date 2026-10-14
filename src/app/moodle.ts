import { create } from 'zustand'
import { electronBridge, type MoodleBridge, type MoodleStatus } from '@/lib/vault'

interface MoodleState {
  status: MoodleStatus | null
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
  importOpen: false,
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
    set({ status: await electronBridge()!.moodle!.disconnect() })
  },
  setImportOpen: (importOpen) => set({ importOpen }),
}))
