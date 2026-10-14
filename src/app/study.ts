import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { moduleResults, type ExamSnapshot } from '@/lib/ecampus'
import type { MoodleSnapshot } from '@/lib/moodle'
import { programById } from '@/lib/study/catalog'
import { studyState, type StudyState } from '@/lib/study/state'
import { findStudyDashboard, planStudySync, type StudyPlan, type StudySetup } from '@/lib/study/sync'
import { parseTerm } from '@/lib/study/terms'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

export interface StudySources {
  exams: ExamSnapshot | null
  moodle: MoodleSnapshot | null
}

/** The last eCampus and Moodle data (desktop app; in the browser there is none). */
export async function studySources(): Promise<StudySources> {
  const bridge = electronBridge()
  const [exams, moodle] = await Promise.all([
    bridge?.ecampus?.snapshot().catch(() => null) ?? null,
    bridge?.moodle?.snapshot().catch(() => null) ?? null,
  ])
  return { exams: exams ?? null, moodle: moodle ?? null }
}

export type StudyPreview =
  | { ok: false; reason: 'noFolder' | 'noSetup' }
  | { ok: true; folder: string; dashboard: string; setup: StudySetup; state: StudyState; plan: StudyPlan }

/** What a sync would change – or why it can't run yet. */
export function previewStudy(
  ws: Workspace,
  sources: StudySources,
  now = new Date(),
  setup?: StudySetup,
): StudyPreview {
  const dash = findStudyDashboard(ws)
  if (!dash) return { ok: false, reason: 'noFolder' }
  const chosen = setup ?? dash.setup
  const program = programById(chosen?.program)
  const start = parseTerm(chosen?.start)
  if (!chosen || !program || !start) return { ok: false, reason: 'noSetup' }
  const state = studyState(program, start, {
    results: moduleResults(sources.exams?.records ?? []),
    courses: sources.moodle?.courses ?? [],
    now,
  })
  return {
    ok: true,
    folder: dash.folder,
    dashboard: dash.path,
    setup: chosen,
    state,
    plan: planStudySync(ws, dash.folder, state),
  }
}

let running: Promise<number> | null = null

/** Quiet sync after a check (only when the study folder is set up) – with progress and result. */
export function autoSyncStudy(ws: Workspace): Promise<number> {
  running ??= (async () => {
    const preview = previewStudy(ws, await studySources())
    if (!preview.ok || preview.plan.changes.length === 0) return 0
    const count = preview.plan.changes.length
    await withProgress(t('study.syncing'), () => preview.plan.apply(), {
      success: () => t('study.synced', { count }),
    })
    return count
  })().finally(() => (running = null))
  return running
}
