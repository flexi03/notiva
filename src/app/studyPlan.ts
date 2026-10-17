import { announce } from '@/app/progress'
import { materialFolder } from '@/app/materials'
import { t } from '@/i18n'
import { materialFolderFor } from '@/lib/study/modules'
import {
  daysUntil,
  isoDate,
  parsePlanSettings,
  planFrom,
  planTopics,
  type StudyPlanSettings,
  type Topic,
} from '@/lib/studyPlan'
import { findStudyDashboard } from '@/lib/study/sync'
import { electronBridge } from '@/lib/vault'
import type { Page, Workspace } from '@/lib/workspace'

/** What is needed of a module page (a full page or a database row). */
export type ModuleRef = Pick<Page, 'path' | 'title' | 'data'>

/**
 * A module's exam preparation and study plan in the vault: the files of its material folder, the
 * next exam (database "Prüfungen"), what is done (`vorbereitet:`), the plan (`lernplan:`) and
 * Notiva's suggestion to start one (`lernplanErinnern:` / `lernplanNein:`) – all in the module page.
 */

export const today = () => isoDate(new Date())

/** Files of the module's material folder ("Unterlagen/<Modul>"). */
export function moduleFiles(ws: Workspace, module: ModuleRef): { folder: string; files: string[] } {
  const folder = materialFolderFor(materialFolder(ws), { name: module.title }, module.title)
  return {
    folder,
    files: ws
      .assets()
      .map((f) => f.path)
      .filter((p) => p.startsWith(`${folder}/`)),
  }
}

/** The next exam of the module (today included), from the database "Prüfungen". */
export function nextExam(ws: Workspace, module: ModuleRef, from = today()): string | null {
  const exams = ws.findDatabase('Prüfungen', module.path)
  if (!exams) return null
  return (
    ws
      .backlinks(module.path)
      .filter((p) => p.path.startsWith(`${ws.rowFolder(exams)}/`))
      .map((p) => String(p.data.Datum ?? '').slice(0, 10))
      .filter((d) => /^\d{4}-\d\d-\d\d$/.test(d) && d >= from)
      .sort()[0] ?? null
  )
}

export const doneOf = (module: ModuleRef) =>
  new Set(Array.isArray(module.data.vorbereitet) ? module.data.vorbereitet.map(String) : [])

/** Ticks a file off (or on again) – shared by exam preparation, study plan and "Heute". */
export function setDone(ws: Workspace, module: ModuleRef, key: string, done: boolean): Promise<void> {
  const current = doneOf(ws.get(module.path) ?? module)
  if (done) current.add(key)
  else current.delete(key)
  return ws.setProperty(module.path, 'vorbereitet', [...current])
}

export interface ModulePlan {
  settings: StudyPlanSettings
  topics: Topic[]
  done: Set<string>
}

export function modulePlan(ws: Workspace, module: ModuleRef): ModulePlan | null {
  const settings = parsePlanSettings(module.data.lernplan)
  if (!settings) return null
  const { folder, files } = moduleFiles(ws, module)
  return { settings, topics: planTopics(files, folder), done: doneOf(module) }
}

export function savePlan(
  ws: Workspace,
  module: ModuleRef,
  settings: StudyPlanSettings | null,
): Promise<void> {
  return ws.setProperty(
    module.path,
    'lernplan',
    settings
      ? {
          start: settings.start,
          exam: settings.exam,
          weekdays: settings.weekdays,
          skip: settings.skip,
          examDays: settings.examDays,
        }
      : undefined,
  )
}

/** Module pages of the study folder. */
export function modulePages(ws: Workspace): ModuleRef[] {
  const dash = findStudyDashboard(ws)
  return dash && ws.get(`${dash.folder}/Module.md`)?.database ? ws.rows(`${dash.folder}/Module.md`) : []
}

/** Modules with an exam in the next five weeks, no plan yet, not snoozed and not declined. */
export function planSuggestions(ws: Workspace, day = today()): Array<{ module: ModuleRef; exam: string }> {
  const out: Array<{ module: ModuleRef; exam: string }> = []
  for (const module of modulePages(ws)) {
    if (module.data.lernplan || module.data.lernplanNein === true) continue
    const later = String(module.data.lernplanErinnern ?? '')
    if (later && later > day) continue
    const exam = nextExam(ws, module, day)
    if (exam && daysUntil(exam, day) <= 35) out.push({ module, exam })
  }
  return out
}

/** "Später erinnern": asks again in `days` days. */
export function remindLater(ws: Workspace, module: ModuleRef, days = 3): Promise<void> {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return ws.setProperty(module.path, 'lernplanErinnern', isoDate(d))
}

/** "Nicht für dieses Modul". */
export const declinePlan = (ws: Workspace, module: ModuleRef) =>
  ws.setProperty(module.path, 'lernplanNein', true)

/**
 * Once a day: suggests a study plan for exams coming up – an entry in the notifications (and a hint
 * bottom left) that opens the module page, where you start it, are reminded later or say no.
 */
export async function suggestPlans(ws: Workspace): Promise<number> {
  const list = planSuggestions(ws)
  if (!list.length) return 0
  const day = today()
  await electronBridge()?.notifications?.add(
    list.map(({ module, exam }) => ({
      id: `studyplan:${module.path}:${exam}`,
      kind: 'reminder' as const,
      title: t('studyPlan.suggestTitle', { module: module.title, days: daysUntil(exam, day) }),
      body: t('studyPlan.suggestBody'),
      time: new Date().toISOString(),
      target: { type: 'page' as const, path: module.path },
    })),
  )
  const first = list[0]!
  announce(t('studyPlan.suggestTitle', { module: first.module.title, days: daysUntil(first.exam, day) }), {
    state: 'info',
    key: 'studyplan-suggestion',
    note:
      list.length > 1 ? t('studyPlan.suggestMore', { count: list.length - 1 }) : t('studyPlan.suggestBody'),
    action: {
      label: t('studyPlan.look'),
      run: () =>
        void import('@/app/store').then(({ useApp }) => useApp.getState().openPage(first.module.path)),
    },
  })
  return list.length
}

/** Every study plan's portion for `date` (from today on; past days have none). */
export function portionsFor(
  ws: Workspace,
  date: string,
): Array<{ module: ModuleRef; topics: Topic[]; done: Set<string> }> {
  const day = today()
  if (date < day) return []
  return modulePages(ws).flatMap((module) => {
    const plan = modulePlan(ws, module)
    if (!plan) return []
    const portion = planFrom(plan.topics, plan.done, plan.settings, day).find((d) => d.date === date)
    return portion?.topics.length ? [{ module, topics: portion.topics, done: plan.done }] : []
  })
}
