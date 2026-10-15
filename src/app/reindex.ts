import { useMoodle } from '@/app/moodle'
import { announce, withProgress } from '@/app/progress'
import {
  announceVersions,
  courseFolder,
  moduleNamesOf,
  moveMaterials,
  pendingVersions,
  saveMaterial,
  saveNewVersion,
  savedMaterials,
} from '@/app/materials'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { planReindex } from '@/lib/materialVersions'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

const dir = (path: string) => path.slice(0, path.lastIndexOf('/'))
const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/**
 * "Unterlagen neu einlesen": fetches Moodle, then shows what would change – files to move into
 * their module/category folder (notes go along), missing files and newer versions (saved next to
 * the current file, compared afterwards). Only the ticked ones happen, with a progress bar.
 */
export async function reindexMaterials(ws: Workspace): Promise<number> {
  const snapshot = (await useMoodle.getState().fetchNow()) ?? (await electronBridge()?.moodle?.snapshot())
  if (!snapshot) return 0
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
  const moduleNames = await moduleNamesOf(ws, snapshot)
  const plan = planReindex(
    snapshot.materials ?? [],
    await savedMaterials(ws),
    (id) => courseFolder(ws, { id, name: course(id) || 'Kurs' }, moduleNames),
    (p) => ws.has(p),
  )
  const waiting = new Set((await pendingVersions(ws)).map((v) => v.id))
  const updated = plan.updated.filter((u) => !waiting.has(u.material.id))
  const total = plan.moves.length + plan.missing.length + updated.length
  if (!total) {
    announce(t('reindex.nothing'))
    return 0
  }
  const picked = await useApp.getState().ask({
    title: t('reindex.title', { count: total }),
    label: t('reindex.note'),
    confirmLabel: t('reindex.apply'),
    checklist: [
      ...plan.moves.map((m) => ({
        value: `move:${m.id}`,
        label: `${t('reindex.move')}: ${name(m.from)}`,
        detail: `${dir(m.from)} → ${dir(m.to)}`,
        checked: true,
      })),
      ...plan.missing.map((m) => ({
        value: `missing:${m.id}`,
        label: `${t('reindex.missing')}: ${m.filename ?? m.title}`,
        detail: [course(m.courseId), m.section].filter(Boolean).join(' · '),
        checked: true,
      })),
      ...updated.map((u) => ({
        value: `updated:${u.material.id}`,
        label: `${t('reindex.updated')}: ${u.material.filename ?? u.material.title}`,
        detail: t('reindex.updatedHint', { name: name(u.path) }),
        checked: true,
      })),
    ],
  })
  if (picked === null) return 0
  const chosen = new Set(JSON.parse(picked) as string[])
  const moves = plan.moves.filter((m) => chosen.has(`move:${m.id}`))
  const missing = plan.missing.filter((m) => chosen.has(`missing:${m.id}`))
  const versions = updated.filter((u) => chosen.has(`updated:${u.material.id}`))
  const count = moves.length + missing.length + versions.length
  if (!count) return 0
  return withProgress(
    t('reindex.running'),
    async (task) => {
      let done = 0
      const failed: string[] = []
      if (moves.length) {
        task.update(0, count, t('reindex.moving', { count: moves.length }))
        await moveMaterials(ws, moves)
        done += moves.length
      }
      for (const m of missing) {
        task.update(done, count, `${course(m.courseId)} · ${m.filename ?? m.title}`)
        try {
          await saveMaterial(ws, m, { id: m.courseId, name: course(m.courseId) || 'Kurs' }, moduleNames)
        } catch {
          failed.push(m.filename ?? m.title)
        }
        done++
      }
      // Where the current file is now (it may just have moved).
      const saved = await savedMaterials(ws)
      for (const u of versions) {
        const m = u.material
        task.update(done, count, `${course(m.courseId)} · ${m.filename ?? m.title}`)
        try {
          const current = saved[m.id]?.path ?? u.path
          await saveNewVersion(
            ws,
            m,
            current,
            { id: m.courseId, name: course(m.courseId) || 'Kurs' },
            moduleNames,
          )
        } catch {
          failed.push(m.filename ?? m.title)
        }
        done++
      }
      task.update(count, count)
      if (failed.length === count)
        throw new Error(t('materials.failed', { names: failed.slice(0, 3).join(', ') }))
      if (versions.length) announceVersions(versions.length)
      return count - failed.length
    },
    {
      success: (n) => t('reindex.done', { count: n }),
    },
  )
}
