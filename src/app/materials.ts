import { announce, withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { importTargets, type MoodleMaterial, type MoodleSnapshot } from '@/lib/moodle'
import { materialFolderFor, moduleOfCourse } from '@/lib/study/modules'
import { notesPathFor } from '@/lib/annotations'
import { versionName } from '@/lib/materialVersions'
import { findStudyDashboard } from '@/lib/study/sync'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** Which Moodle material was saved where in the vault (.notiva/moodle-files.json). */
export type MaterialMap = Record<string, string>
export interface MaterialEntry {
  path: string
  /** Moodle's "last modified" when it was saved – a newer one means: download again. */
  modified?: string
}

const META = 'moodle-files.json'
/** Newer versions downloaded next to the current file – waiting for "ersetzen" or "behalten". */
const VERSIONS = 'moodle-versions.json'

export interface PendingVersion {
  id: string
  /** the file the user has (with notes and highlights) */
  current: string
  /** the newer one from Moodle, "<Name> (neu <Datum>).pdf" */
  next: string
  modified?: string
  found: string
}

export async function pendingVersions(ws: Workspace): Promise<PendingVersion[]> {
  const raw = await ws.readMeta<unknown>(VERSIONS)
  return (Array.isArray(raw) ? (raw as PendingVersion[]) : []).filter(
    (v) => typeof v?.id === 'string' && ws.has(v.current) && ws.has(v.next),
  )
}

async function setPending(ws: Workspace, list: PendingVersion[]): Promise<void> {
  await ws.writeMeta(VERSIONS, list)
  const { usePendingVersions } = await import('@/app/versionsStore')
  usePendingVersions.setState({ count: list.length })
}

/**
 * A newer version from Moodle: saved next to the current file ("Skript (neu 2026-10-16).pdf") –
 * nothing is overwritten. The user compares and decides (screen "Neue Versionen").
 */
export async function saveNewVersion(
  ws: Workspace,
  material: MoodleMaterial,
  current: string,
  course: { id: string; name: string },
  moduleNames: Record<string, string> = {},
): Promise<string> {
  const folder = courseFolder(ws, course, moduleNames)
  const name = versionName(current.slice(current.lastIndexOf('/') + 1), new Date())
  const { path } = await electronBridge()!.moodle!.download(material.id, folder, name)
  await ws.reload()
  const list = (await pendingVersions(ws)).filter((v) => v.id !== material.id)
  await setPending(ws, [
    ...list,
    {
      id: material.id,
      current,
      next: path,
      ...(material.modified ? { modified: material.modified } : {}),
      found: new Date().toISOString(),
    },
  ])
  return path
}

/**
 * "Ersetzen": the new version takes the place (and name) of the current file – notes and links
 * stay. "Beide behalten": the new file stays next to it and counts as the current one from now on.
 */
export async function resolveVersion(ws: Workspace, id: string, choice: 'replace' | 'keep'): Promise<string> {
  const list = await pendingVersions(ws)
  const v = list.find((x) => x.id === id)
  if (!v) throw new Error(t('versions.gone'))
  let path = v.next
  if (choice === 'replace') {
    await ws.writeFile(v.current, await ws.vault.readBinary(v.next))
    await ws.removeFile(v.next)
    path = v.current
  }
  const entries = await loadEntries(ws)
  await ws.writeMeta(META, { ...entries, [id]: { path, ...(v.modified ? { modified: v.modified } : {}) } })
  await setPending(
    ws,
    list.filter((x) => x.id !== id),
  )
  return path
}

/** Moves saved materials (and their notes page "<Name> (Notizen).md") – and remembers the new place. */
export async function moveMaterials(
  ws: Workspace,
  moves: Array<{ id: string; from: string; to: string }>,
): Promise<number> {
  const all = moves.flatMap((m) => {
    const notes = notesPathFor(m.from)
    return ws.has(notes) ? [m, { id: '', from: notes, to: notesPathFor(m.to) }] : [m]
  })
  const done = await ws.moveFiles(all.map(({ from, to }) => ({ from, to })))
  const moved = new Map(done.map((d) => [d.from, d.to]))
  const entries = await loadEntries(ws)
  for (const m of moves) {
    const to = moved.get(m.from)
    if (to && entries[m.id]) entries[m.id] = { ...entries[m.id]!, path: to }
  }
  await ws.writeMeta(META, entries)
  const list = await pendingVersions(ws)
  if (list.some((v) => moved.has(v.current)))
    await setPending(
      ws,
      list.map((v) => ({ ...v, current: moved.get(v.current) ?? v.current })),
    )
  return moves.filter((m) => moved.has(m.from)).length
}

export async function savedMaterials(ws: Workspace): Promise<Record<string, MaterialEntry>> {
  return loadEntries(ws)
}

async function loadEntries(ws: Workspace): Promise<Record<string, MaterialEntry>> {
  const raw = await ws.readMeta<Record<string, unknown>>(META)
  const out: Record<string, MaterialEntry> = {}
  for (const [id, value] of Object.entries(raw ?? {})) {
    const entry =
      typeof value === 'string'
        ? { path: value }
        : typeof value === 'object' && value !== null && typeof (value as MaterialEntry).path === 'string'
          ? (value as MaterialEntry)
          : null
    if (entry && ws.has(entry.path)) out[id] = entry
  }
  return out
}

export async function loadMaterialMap(ws: Workspace): Promise<MaterialMap> {
  return Object.fromEntries(Object.entries(await loadEntries(ws)).map(([id, e]) => [id, e.path]))
}

/** Downloads go next to the study dashboard ("Studium/Unterlagen/<Kurs>/…"), else "Unterlagen/…". */
export function materialFolder(ws: Workspace): string {
  const target = importTargets(ws).find((x) => x.tasks || x.modules)
  return target?.folder ? `${target.folder}/Unterlagen` : 'Unterlagen'
}

/**
 * Where a course's files go: "Unterlagen/<Modul>" when a module page lists the course (`kurse:`),
 * else "Unterlagen/Orga/<Kurs>". `moduleNames` (course id → module name from the study plan) helps
 * before the module pages exist.
 */
export function courseFolder(
  ws: Workspace,
  course: { id: string; name: string },
  moduleNames: Record<string, string> = {},
): string {
  const dash = findStudyDashboard(ws)
  const rows = dash && ws.get(`${dash.folder}/Module.md`) ? ws.rows(`${dash.folder}/Module.md`) : []
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  return materialFolderFor(
    materialFolder(ws),
    course,
    moduleOfCourse(rows, course.id)?.title ??
      moduleNames[course.id] ??
      // Not linked yet: a module of the same name.
      rows.find((r) => norm(r.title) === norm(course.name))?.title,
  )
}

/** Saves a material into the vault (main process downloads it) and remembers where. */
export async function saveMaterial(
  ws: Workspace,
  material: MoodleMaterial,
  course: { id: string; name: string } = { id: material.courseId, name: 'Kurs' },
  moduleNames: Record<string, string> = {},
): Promise<string> {
  const folder = courseFolder(ws, course, moduleNames)
  const { path } = await electronBridge()!.moodle!.download(material.id, folder)
  await ws.reload()
  const entries = await loadEntries(ws)
  await ws.writeMeta(META, {
    ...entries,
    [material.id]: { path, ...(material.modified ? { modified: material.modified } : {}) },
  })
  return path
}

/** Every file of a course is kept (scripts, slides, code, data, archives …) – up to 100 MB each. */
const MAX_SIZE = 100_000_000

/** New or updated documents of the last fetch that are not in the vault yet. */
export async function missingMaterials(ws: Workspace, snapshot: MoodleSnapshot): Promise<MoodleMaterial[]> {
  const entries = await loadEntries(ws)
  return (snapshot.materials ?? []).filter((m) => {
    if (m.kind !== 'file' || !m.filename || (m.size ?? 0) > MAX_SIZE) return false
    const saved = entries[m.id]
    return !saved || (!!m.modified && !!saved.modified && m.modified > saved.modified)
  })
}

let running: Promise<number> | null = null

/** Saves new/updated documents (all, or the chosen ids) – with progress bar and confirmation. */
export function syncMaterials(ws: Workspace, snapshot: MoodleSnapshot, only?: Set<string>): Promise<number> {
  running ??= (async () => {
    const todo = (await missingMaterials(ws, snapshot)).filter((m) => !only || only.has(m.id))
    if (todo.length === 0) return 0
    const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
    const moduleNames = await moduleNamesOf(ws, snapshot)
    return withProgress(
      t('materials.saving'),
      async (task) => {
        let saved = 0
        const failed: string[] = []
        const entries = await loadEntries(ws)
        let versions = 0
        for (const [i, m] of todo.entries()) {
          task.update(i, todo.length, `${course(m.courseId)} · ${m.filename ?? m.title}`)
          try {
            const where = { id: m.courseId, name: course(m.courseId) || 'Kurs' }
            // A newer version never overwrites the user's file (notes, highlights) – it goes next to it.
            if (entries[m.id]) {
              await saveNewVersion(ws, m, entries[m.id]!.path, where, moduleNames)
              versions++
            } else await saveMaterial(ws, m, where, moduleNames)
            saved++
          } catch {
            failed.push(m.filename ?? m.title)
          }
        }
        task.update(todo.length, todo.length)
        if (failed.length && !saved)
          throw new Error(t('materials.failed', { names: failed.slice(0, 3).join(', ') }))
        if (versions) announceVersions(versions)
        return saved
      },
      { success: (n) => t('materials.saved', { count: n }) },
    )
  })().finally(() => (running = null))
  return running
}

/** Course id → module name from the study plan (before the module pages exist). */
export async function moduleNamesOf(
  ws: Workspace,
  snapshot: MoodleSnapshot,
): Promise<Record<string, string>> {
  const { previewStudy } = await import('@/app/study')
  const preview = previewStudy(ws, { moodle: snapshot, exams: null })
  if (!preview.ok) return {}
  return Object.fromEntries(preview.state.modules.flatMap((m) => m.courses.map((c) => [c.id, m.module.name])))
}

/**
 * After a background check: new materials are suggested, not saved silently – a hint (and an entry
 * in the notifications) with "Speichern" and "Ansehen".
 */
export async function suggestMaterials(ws: Workspace, snapshot: MoodleSnapshot): Promise<number> {
  // Courses taken later or not at all: nothing is suggested from them.
  const { courseCounts } = await import('@/app/courseChoices')
  const todo = (await missingMaterials(ws, snapshot)).filter((m) => courseCounts(m.courseId))
  if (!todo.length) return 0
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
  const names = todo
    .slice(0, 3)
    .map((m) => `„${m.filename ?? m.title}“ (${course(m.courseId)})`)
    .join(', ')
  const note = `${names}${todo.length > 3 ? ` und ${todo.length - 3} weitere` : ''}`
  await electronBridge()?.notifications?.add([
    {
      id: 'suggest:materials',
      kind: 'material',
      title: t('materials.suggested', { count: todo.length }),
      body: note,
      time: new Date().toISOString(),
      target: { type: 'review', what: 'materials' },
    },
  ])
  announce(t('materials.suggested', { count: todo.length }), {
    state: 'info',
    key: 'materials-suggestions',
    note,
    action: { label: t('materials.review'), run: () => void reviewMaterials(ws) },
  })
  return todo.length
}

/** "Ansehen": the new materials to tick – the ticked ones are saved (with progress). */
export async function reviewMaterials(ws: Workspace): Promise<number> {
  const snapshot = await electronBridge()?.moodle?.snapshot()
  if (!snapshot) return 0
  const { courseCounts } = await import('@/app/courseChoices')
  const todo = (await missingMaterials(ws, snapshot)).filter((m) => courseCounts(m.courseId))
  if (!todo.length) return 0
  const { useApp } = await import('@/app/store')
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
  const picked = await useApp.getState().ask({
    title: t('materials.suggested', { count: todo.length }),
    label: t('materials.reviewNote'),
    confirmLabel: t('materials.save'),
    checklist: todo.map((m) => ({
      value: m.id,
      label: m.filename ?? m.title,
      detail: [course(m.courseId), m.section].filter(Boolean).join(' · '),
      checked: true,
    })),
  })
  if (picked === null) return 0
  return syncMaterials(ws, snapshot, new Set(JSON.parse(picked) as string[]))
}

/** "N neue Versionen – Vergleichen" (hint with a button to the comparison). */
export function announceVersions(count: number): void {
  announce(t('versions.found', { count }), {
    state: 'info',
    key: 'material-versions',
    note: t('versions.foundNote'),
    action: {
      label: t('versions.compare'),
      run: () =>
        void import('@/app/store').then(({ useApp }) => useApp.getState().navigate({ name: 'versions' })),
    },
  })
}

export const isPdf = (path: string) => /\.pdf$/i.test(path)
export const isImage = (path: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(path)
