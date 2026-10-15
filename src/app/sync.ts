import { create } from 'zustand'
import { syncExamPlan } from '@/app/examPlan'
import { useEcampus } from '@/app/ecampus'
import { useMoodle } from '@/app/moodle'
import { autoSyncStudy } from '@/app/study'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** "Alles synchronisieren": Moodle, eCampus, exam plan, then the study folder – one after another. */
export const useSync = create<{ running: boolean }>(() => ({ running: false }))

export async function syncAll(ws: Workspace): Promise<void> {
  if (useSync.getState().running) return
  useSync.setState({ running: true })
  try {
    if (useMoodle.getState().status?.connected) await useMoodle.getState().fetchNow()
    const ecampus = await electronBridge()
      ?.ecampus?.status()
      .catch(() => null)
    if (ecampus?.connected) await useEcampus.getState().fetchNow()
    await syncExamPlan(ws).catch(() => undefined)
    await autoSyncStudy(ws).catch(() => undefined)
  } finally {
    useSync.setState({ running: false })
  }
}
