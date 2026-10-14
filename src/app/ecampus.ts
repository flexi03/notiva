import { create } from 'zustand'
import { ipcMessage } from '@/app/moodle'
import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import type { ExamSnapshot } from '@/lib/ecampus'
import { electronBridge, type EcampusStatus } from '@/lib/vault'

interface EcampusState {
  status: EcampusStatus | null
  snapshot: ExamSnapshot | null
  busy: boolean
  error: string | null
  importOpen: boolean
  refresh(): Promise<void>
  connect(config: { startUrl: string; examsUrl: string }): Promise<void>
  fetchNow(): Promise<void>
  disconnect(): Promise<void>
  setImportOpen(open: boolean): void
}

export const ecampusAvailable = () => Boolean(electronBridge()?.ecampus)

/** eCampus exam results (desktop app; the login session stays in the main process). */
export const useEcampus = create<EcampusState>((set, get) => {
  const run = async (label: string, work: () => Promise<ExamSnapshot>) => {
    const bridge = electronBridge()!.ecampus!
    set({ busy: true, error: null })
    try {
      const snapshot = await withProgress(
        label,
        async (task) => {
          const off = bridge.onProgress((text) => task.detail(text))
          try {
            return await work()
          } finally {
            off()
          }
        },
        { success: (s) => t('ecampus.fetched', { count: s.records.length }) },
      )
      set({ snapshot })
      await get().refresh()
    } catch (e) {
      set({ error: ipcMessage(e) })
    } finally {
      set({ busy: false })
    }
  }
  return {
    status: null,
    snapshot: null,
    busy: false,
    error: null,
    importOpen: false,
    async refresh() {
      const bridge = electronBridge()?.ecampus
      if (!bridge) return set({ status: { connected: false } })
      const [status, snapshot] = await Promise.all([bridge.status(), bridge.snapshot()])
      set({ status, snapshot })
    },
    connect: (config) => run(t('ecampus.connecting'), () => electronBridge()!.ecampus!.connect(config)),
    fetchNow: () => run(t('ecampus.fetching'), () => electronBridge()!.ecampus!.fetch()),
    async disconnect() {
      await electronBridge()!.ecampus!.disconnect()
      set({ snapshot: null, error: null })
      await get().refresh()
    },
    setImportOpen: (importOpen) => set({ importOpen }),
  }
})
