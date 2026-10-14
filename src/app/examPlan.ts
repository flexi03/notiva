import { previewStudy, studySources } from '@/app/study'
import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { examPlanNews, examsForStudy, parsePlanTable, planExamDates, planVersion } from '@/lib/examPlan'
import { pdfTextItems } from '@/lib/pdfText'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

const META = 'exam-plan.json'
let running: Promise<number> | null = null

/**
 * Fetches the newest exam plan, saves the PDF next to the materials and enters the dates of the
 * open modules into "Prüfungen". New plan versions and moved dates become notifications.
 */
export function syncExamPlan(ws: Workspace): Promise<number> {
  running ??= (async () => {
    const bridge = electronBridge()?.examPlan
    const preview = previewStudy(ws, await studySources())
    if (!bridge || !preview.ok) throw new Error(t('examPlan.needsSetup'))
    const custom = (ws.get(preview.dashboard)?.data.studium as Record<string, unknown> | undefined)
      ?.pruefungsplan
    const source = typeof custom === 'string' && custom ? custom : preview.state.program.sources.examPlans
    if (!source) throw new Error(t('examPlan.noSource'))
    return withProgress(
      t('examPlan.checking'),
      async (task) => {
        task.detail(t('examPlan.downloading'))
        const file = await bridge.fetch(source)
        task.detail(t('examPlan.reading'))
        const pages = await pdfTextItems(file.bytes)
        const version = planVersion(pages)
        const target = `${preview.folder}/Unterlagen/Prüfungsplan/${file.name}`
        if (!ws.assets().some((f) => f.path === target)) await ws.writeFile(target, file.bytes)
        const exams = examsForStudy(parsePlanTable(pages), preview.state)
        const modules = ws.rows(`${preview.folder}/Module.md`)
        const plan = planExamDates(
          ws,
          `${preview.folder}/Prüfungen.md`,
          exams,
          (nr) => modules.find((r) => r.data.modul === nr)?.path,
        )
        await plan.apply()
        const before = await ws.readMeta<{ version?: string }>(META)
        await ws.writeMeta(META, {
          version: version ?? file.name,
          url: file.url,
          checked: new Date().toISOString(),
        })
        if (before)
          await electronBridge()?.notifications?.add(
            examPlanNews(version ?? file.name, before.version, plan.changes),
          )
        return plan.changes.length
      },
      { success: (n) => (n ? t('examPlan.updated', { count: n }) : t('examPlan.upToDate')) },
    )
  })().finally(() => (running = null))
  return running
}
