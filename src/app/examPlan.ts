import { previewStudy, studySources } from '@/app/study'
import { currentProfile } from '@/app/university'
import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { examPlanNews, examsForStudy, parsePlanTable, planExamDates, planVersion } from '@/lib/examPlan'
import { pdfTextItems } from '@/lib/pdfText'
import { checkResult } from '@/lib/notifications'
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
    const source =
      typeof custom === 'string' && custom
        ? custom
        : (currentProfile(ws).examPlans?.page ?? preview.state.program.sources.examPlans)
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
        // Only the last 30 days and the future.
        const exams = examsForStudy(
          parsePlanTable(pages),
          preview.state,
          new Date(Date.now() - 30 * 86_400_000),
        )
        const modules = ws.rows(`${preview.folder}/Module.md`)
        const plan = planExamDates(
          ws,
          `${preview.folder}/Prüfungen.md`,
          exams,
          (nr) => modules.find((r) => r.data.modul === nr)?.path,
        )
        await plan.apply()
        const before = await ws.readMeta<{ version?: string }>(META)
        // Only written when the plan changed – a mere check leaves Git clean.
        const meta = { version: version ?? file.name, url: file.url }
        const known = before as { version?: string; url?: string } | null
        if (!known || known.version !== meta.version || known.url !== meta.url) await ws.writeMeta(META, meta)
        if (before)
          await electronBridge()?.notifications?.add(
            examPlanNews(
              version ?? file.name,
              before.version,
              plan.changes,
              new Date(),
              `${preview.folder}/Prüfungen.md`,
            ),
          )
        await electronBridge()?.notifications?.add([
          checkResult(
            'examplan',
            'Prüfungsplan geprüft',
            `${exams.length} Prüfungen für dich im Plan – ${
              plan.changes.length
                ? `neu oder geändert: ${plan.changes
                    .slice(0, 3)
                    .map((c) => `„${c.title}“`)
                    .join(', ')}${plan.changes.length > 3 ? ` und ${plan.changes.length - 3} weitere` : ''}`
                : 'nichts Neues'
            }`,
            new Date(),
            { type: 'page', path: `${preview.folder}/Prüfungen.md` },
          ),
        ])
        return plan.changes.length
      },
      { success: (n) => (n ? t('examPlan.updated', { count: n }) : t('examPlan.upToDate')) },
    )
  })().finally(() => (running = null))
  return running
}
