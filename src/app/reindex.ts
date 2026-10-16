import { useMoodle } from '@/app/moodle'
import { announce, withProgress } from '@/app/progress'
import {
  announceVersions,
  courseFolder,
  materialFolder,
  moduleNamesOf,
  moveMaterials,
  pendingVersions,
  saveMaterial,
  saveNewVersion,
  savedMaterials,
} from '@/app/materials'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { planReindex, planSort } from '@/lib/materialVersions'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

const dir = (path: string) => path.slice(0, path.lastIndexOf('/'))
const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)

/**
 * "Unterlagen neu einlesen": fetches Moodle, then shows what would change – files to move into
 * their module/category folder (notes go along), missing files and newer versions (saved next to
 * the current file, compared afterwards). Only the ticked ones happen, with a progress bar.
 */
export async function reindexMaterials(
  ws: Workspace,
  options: { moodle?: boolean; folder?: string } = {},
): Promise<number> {
  // Without Moodle (or not connected): only sorting the files that are already there.
  const snapshot =
    options.moodle === false
      ? null
      : ((await useMoodle.getState().fetchNow()) ?? (await electronBridge()?.moodle?.snapshot()) ?? null)
  const course = (id: string) => snapshot?.courses.find((c) => c.id === id)?.name ?? ''
  const moduleNames = snapshot ? await moduleNamesOf(ws, snapshot) : {}
  const saved = await savedMaterials(ws)
  const plan = snapshot
    ? planReindex(
        snapshot.materials ?? [],
        saved,
        (id) => courseFolder(ws, { id, name: course(id) || 'Kurs' }, moduleNames),
        (p) => ws.has(p),
      )
    : { moves: [], missing: [], updated: [] }
  // Files lying loose in a module folder: sorted by name (and Moodle section when known).
  const idOf = new Map(Object.entries(saved).map(([id, e]) => [e.path, id]))
  const sectionOf = (path: string) => {
    const id = idOf.get(path)
    return id ? snapshot?.materials?.find((m) => m.id === id)?.section : undefined
  }
  const planned = new Set(plan.moves.map((m) => m.from))
  for (const m of planSort(
    ws.assets().map((f) => f.path),
    materialFolder(ws),
    sectionOf,
  ))
    if (!planned.has(m.from)) plan.moves.push({ id: idOf.get(m.from) ?? '', ...m })
  if (options.folder) plan.moves = plan.moves.filter((m) => m.from.startsWith(`${options.folder}/`))
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
        value: `move:${m.from}`,
        label: `${t('reindex.move')}: ${name(m.from)}`,
        detail: `${dir(m.from).split('/').slice(-2).join('/')} → ${dir(m.to).split('/').slice(-2).join('/')}`,
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
  const moves = plan.moves.filter((m) => chosen.has(`move:${m.from}`))
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
