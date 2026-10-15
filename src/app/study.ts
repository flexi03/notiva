import { announce } from '@/app/progress'
import { checkResult } from '@/lib/notifications'
import { syncTimetable } from '@/app/schedule'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { moduleResults, type ExamSnapshot } from '@/lib/ecampus'
import type { MoodleSnapshot } from '@/lib/moodle'
import { programById } from '@/lib/study/catalog'
import { ownProfilePage, OWN_PROGRAM, programFor, PROFILE_PAGE } from '@/lib/university'
import { currentProfile } from '@/app/university'
import { studyState, type StudyState } from '@/lib/study/state'
import {
  findStudyDashboard,
  planStudySync,
  setupData,
  type StudyPlan,
  type StudySetup,
} from '@/lib/study/sync'
import { expandPack } from '@/lib/templates'
import { studyPack } from '@/lib/packs/study'
import { parseTerm, termOf, termRange } from '@/lib/study/terms'
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
  const program = programFor(currentProfile(ws), chosen?.program)
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

/**
 * After a background check: what would change in the study folder – suggested, not written. A hint
 * (and a quiet entry in the notifications) opens the preview where the user decides.
 */
export function autoSyncStudy(ws: Workspace): Promise<number> {
  running ??= (async () => {
    const preview = previewStudy(ws, await studySources())
    if (!preview.ok) return 0
    const count = preview.plan.changes.length
    await electronBridge()?.notifications?.add([
      checkResult(
        'study',
        'Studium abgeglichen',
        count ? studyChangeNote(preview.plan.changes) || `${count} Änderungen` : 'alles aktuell',
        new Date(),
        { type: 'page', path: preview.dashboard },
      ),
    ])
    if (count > 0)
      announce(t('study.suggested', { count }), {
        state: 'info',
        sticky: true,
        key: 'study-suggestions',
        note: studyChangeNote(preview.plan.changes) || t('study.suggestedNote'),
        action: { label: t('study.review'), run: () => useApp.getState().setStudyDialog(true) },
      })
    await syncTimetable(ws).catch(() => undefined)
    return count
  })().finally(() => (running = null))
  return running
}

/** "5 Module · 2 Kurse · 1 Semester" – what a sync changed. */
export function studyChangeNote(changes: StudyPlan['changes']): string {
  const count = (what: string) => changes.filter((c) => c.what === what).length
  return (['module', 'course', 'semester'] as const)
    .filter((w) => count(w))
    .map((w) => t(`study.count.${w}`, { count: count(w) }))
    .join(' · ')
}

/**
 * Hints bottom left while something is missing: study folder, degree, Moodle, eCampus – one at a
 * time, each with a button that leads to the right place.
 */
export async function setupHint(ws: Workspace): Promise<void> {
  const bridge = electronBridge()
  // Desktop only: the browser demo has no Moodle/eCampus anyway.
  if (!bridge) return
  const app = useApp.getState()
  const dash = findStudyDashboard(ws)
  // A hint closed with × does not come back for this folder.
  const flag = (message: string) => `notiva:hint-closed:${ws.vault.name}:${message}`
  const hint = (message: string, note: string, label: string, run: () => void) => {
    try {
      if (localStorage.getItem(flag(message))) return
    } catch {
      /* private mode */
    }
    announce(message, {
      state: 'info',
      note,
      sticky: true,
      key: 'setup',
      action: { label, run },
      onDismiss: () => {
        try {
          localStorage.setItem(flag(message), '1')
        } catch {
          /* private mode */
        }
      },
    })
  }
  if (!dash)
    return void hint(t('setup.folder'), t('setup.folderNote'), t('setup.start'), () =>
      app.navigate({ name: 'settings', section: 'study' }),
    )
  if (!dash.setup)
    return void hint(t('setup.program'), t('setup.programNote'), t('setup.start'), () =>
      app.navigate({ name: 'settings', section: 'study' }),
    )
  const [moodle, ecampus] = await Promise.all([
    bridge.moodle?.status().catch(() => null),
    bridge.ecampus?.status().catch(() => null),
  ])
  if (moodle && !moodle.connected)
    return void hint(t('setup.moodle'), t('setup.moodleNote'), t('setup.connect'), () =>
      app.navigate({ name: 'settings', section: 'study' }),
    )
  if (ecampus && !ecampus.connected)
    return void hint(t('setup.ecampus'), t('setup.ecampusNote'), t('setup.connect'), () =>
      app.navigate({ name: 'settings', section: 'study' }),
    )
}

/**
 * A new, empty study folder: structure of the study template (no sample data), degree and first
 * semester, Git (desktop), then everything that eCampus and Moodle already know.
 */
/** Another university / own program: what the user typed when creating the study folder. */
export interface OwnStudy {
  university: string
  program: string
  ects: number
}

/**
 * Creates the study folder. Modules are not made up front: they come with the first sync from
 * Moodle/eCampus (only when one is connected) or are added by hand – the Module page explains how.
 */
export async function createStudyFolder(
  ws: Workspace,
  setup: StudySetup,
  folder = 'Studium',
  own?: OwnStudy,
): Promise<{ dashboard: string; imported: boolean }> {
  const program = setup.program === OWN_PROGRAM ? undefined : programById(setup.program)
  const current = termRange(termOf(new Date()))
  const { files } = expandPack(studyPack, '', {
    name: folder,
    studiengang: program ? `${program.title} (${program.degree})` : own?.program || 'mein Studium',
    ectsZiel: program?.ects ?? own?.ects ?? 180,
    semesterStart: current.start,
    semesterEnd: current.end,
  })
  const sample = new RegExp(`^${folder}/(Semester|Module|Prüfungen|Aufgaben|Stundenplan|Mitschriften)/`)
  // Another university: its own profile page instead of the pack's HSD one.
  await ws.createFiles(
    files.filter((f) => !sample.test(f.path) && !(own && f.path === `${folder}/Hochschule.md`)),
  )
  if (!ws.get(`${folder}/Hochschule.md`))
    await ws.writeFile(
      `${folder}/Hochschule.md`,
      own ? ownProfilePage(own.university, own.program, own.ects) : PROFILE_PAGE,
    )
  await ws.reload()
  const dashboard = `${folder}.md`
  await ws.save(dashboard, { data: { ...ws.get(dashboard)!.data, ...setupData(setup) } })
  const git = electronBridge()?.git
  if (git) {
    const state = await git.state().catch(() => null)
    if (state && !state.isRepo) await git.init().catch(() => undefined)
  }
  // Only with data from Moodle or eCampus – without, the modules would be guesses.
  const sources = await studySources()
  const connected = Boolean(sources.moodle?.courses.length || sources.exams?.records.length)
  const preview = connected ? previewStudy(ws, sources) : null
  if (preview?.ok) {
    await preview.plan.apply()
    await syncTimetable(ws).catch(() => undefined)
  }
  return { dashboard, imported: Boolean(preview?.ok) }
}
