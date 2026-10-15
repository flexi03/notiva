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

/** One source on its own ("check:moodle" …). */
export async function syncOne(ws: Workspace, id: string): Promise<void> {
  if (id === 'check:moodle') await useMoodle.getState().fetchNow()
  else if (id === 'check:ecampus') await useEcampus.getState().fetchNow()
  else if (id === 'check:examplan') await syncExamPlan(ws).catch(() => undefined)
  else if (id === 'check:study') await autoSyncStudy(ws).catch(() => undefined)
}

export const SOURCES: Array<{
  id: string
  label: 'sync.moodle' | 'sync.ecampus' | 'sync.examplan' | 'sync.study'
}> = [
  { id: 'check:moodle', label: 'sync.moodle' },
  { id: 'check:ecampus', label: 'sync.ecampus' },
  { id: 'check:examplan', label: 'sync.examplan' },
  { id: 'check:study', label: 'sync.study' },
]
