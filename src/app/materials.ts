import { announce, withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { importTargets, type MoodleMaterial, type MoodleSnapshot } from '@/lib/moodle'
import {
  ARCHIVE_FOLDER,
  courseIdsOf,
  currentCourse,
  materialFolderFor,
  moduleOfCourse,
  termFolder,
} from '@/lib/study/modules'
import { useMoodle } from '@/app/moodle'
import { useCourseChoices } from '@/app/courseChoices'
import { notesPathFor } from '@/lib/annotations'
import { versionName } from '@/lib/materialVersions'
import { matchExisting } from '@/lib/materialMatch'
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
/** Moodle files the user threw away – never suggested again (.notiva/moodle-removed.json). */
const REMOVED = 'moodle-removed.json'
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

/**
 * Moves files (and their notes page "<Name> (Notizen).md") – Moodle materials among them keep their
 * place in Notiva's list, so they are not offered again as "new".
 */
export async function moveMaterials(
  ws: Workspace,
  moves: Array<{ from: string; to: string }>,
): Promise<number> {
  // Read before moving: afterwards the old paths are gone and their entries would be dropped.
  const entries = await loadEntries(ws)
  const all = moves.flatMap((m) => {
    const notes = notesPathFor(m.from)
    return ws.has(notes) ? [m, { from: notes, to: notesPathFor(m.to) }] : [m]
  })
  const done = await ws.moveFiles(all.map(({ from, to }) => ({ from, to })))
  const moved = new Map(done.map((d) => [d.from, d.to]))
  // One file can stand for several Moodle ids (the same script in two courses).
  for (const [id, e] of Object.entries(entries)) {
    const to = moved.get(e.path)
    if (to) entries[id] = { ...e, path: to }
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

/**
 * Files (or whole folders) going to the trash: their Moodle materials are remembered as removed, so
 * the next check does not offer them again. Call before the files are gone.
 */
export async function forgetMaterials(ws: Workspace, paths: string[]): Promise<number> {
  const inside = (p: string) => paths.some((x) => p === x || p.startsWith(`${x}/`))
  const ids = Object.entries(await loadEntries(ws))
    .filter(([, e]) => inside(e.path))
    .map(([id]) => id)
  if (!ids.length) return 0
  await ws.writeMeta(REMOVED, [...new Set([...(await removedMaterials(ws)), ...ids])])
  return ids.length
}

export async function removedMaterials(ws: Workspace): Promise<string[]> {
  const raw = await ws.readMeta<unknown>(REMOVED)
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
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
  const row = moduleOfCourse(rows, course.id)
  const folder = materialFolderFor(
    materialFolder(ws),
    course,
    row?.title ??
      moduleNames[course.id] ??
      // Not linked yet: a module of the same name.
      rows.find((r) => norm(r.title) === norm(course.name))?.title,
  )
  // Several courses for one module: the current one directly in the module, the others (older
  // terms, set aside) in "Archiv/<Semester>" – not the same material.
  const ids = row ? courseIdsOf(row.data) : []
  if (ids.length < 2) return folder
  const known = useMoodle.getState().snapshot?.courses ?? []
  const courses = ids.map(
    (id) => known.find((c) => c.id === id) ?? (id === course.id ? course : { id, name: id }),
  )
  const choices = useCourseChoices.getState()
  return currentCourse(courses, (id) => !!choices[id], new Date()) === course.id
    ? folder
    : `${folder}/${ARCHIVE_FOLDER}/${termFolder(course)}`
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
  const removed = new Set(await removedMaterials(ws))
  return (snapshot.materials ?? []).filter((m) => {
    if (m.kind !== 'file' || !m.filename || (m.size ?? 0) > MAX_SIZE || removed.has(m.id)) return false
    const saved = entries[m.id]
    return !saved || (!!m.modified && !!saved.modified && m.modified > saved.modified)
  })
}

/**
 * Moodle files that are already in the folder under the same name (saved by hand or by an older
 * Notiva): `same` (same size – only to be remembered), `versions` (other size – a newer version to
 * save next to it) and the `rest`, really new. Nothing happens before the user ticks them.
 */
export interface ExistingPlan {
  same: Array<{ material: MoodleMaterial; path: string }>
  versions: Array<{ material: MoodleMaterial; path: string }>
  rest: MoodleMaterial[]
}

export function planExisting(
  ws: Workspace,
  materials: MoodleMaterial[],
  snapshot: MoodleSnapshot,
): ExistingPlan {
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name || 'Kurs'
  // Prefer the module's own material folder (its archive included).
  const near = (m: MoodleMaterial) =>
    courseFolder(ws, { id: m.courseId, name: course(m.courseId) }).split(`/${ARCHIVE_FOLDER}/`)[0]!
  const matches = new Map(matchExisting(materials, ws.assets(), near).map((x) => [x.id, x]))
  const plan: ExistingPlan = { same: [], versions: [], rest: [] }
  for (const material of materials) {
    const match = matches.get(material.id)
    if (!match) plan.rest.push(material)
    else (match.kind === 'same' ? plan.same : plan.versions).push({ material, path: match.path })
  }
  return plan
}

/** The pairs as entries of a checklist ("assign:<id>", "version:<id>"). */
export function existingChecklist(plan: ExistingPlan) {
  return [
    ...plan.same.map(({ material: m, path }) => ({
      value: `assign:${m.id}`,
      label: `${t('materials.known')}: ${m.filename ?? m.title}`,
      detail: t('materials.knownHint', { path }),
      checked: true,
    })),
    ...plan.versions.map(({ material: m, path }) => ({
      value: `version:${m.id}`,
      label: `${t('materials.otherSize')}: ${m.filename ?? m.title}`,
      detail: t('materials.otherSizeHint', { path }),
      checked: true,
    })),
  ]
}

/**
 * The ticked pairs: same files are only remembered (nothing downloaded or moved), other sizes are
 * saved next to the user's file as a newer version to compare. Returns how many of each.
 */
export async function applyExisting(
  ws: Workspace,
  plan: ExistingPlan,
  chosen: Set<string>,
  snapshot: MoodleSnapshot,
  moduleNames: Record<string, string> = {},
): Promise<{ assigned: number; versions: number }> {
  const same = plan.same.filter((x) => chosen.has(`assign:${x.material.id}`))
  if (same.length) {
    const entries = await loadEntries(ws)
    for (const { material: m, path } of same)
      entries[m.id] = { path, ...(m.modified ? { modified: m.modified } : {}) }
    await ws.writeMeta(META, entries)
  }
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name || 'Kurs'
  let versions = 0
  for (const { material: m, path } of plan.versions.filter((x) => chosen.has(`version:${x.material.id}`))) {
    await saveNewVersion(ws, m, path, { id: m.courseId, name: course(m.courseId) }, moduleNames)
    versions++
  }
  if (versions) announceVersions(versions)
  return { assigned: same.length, versions }
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
  const missing = (await missingMaterials(ws, snapshot)).filter((m) => courseCounts(m.courseId))
  if (!missing.length) return 0
  // Files already in the folder under the same name are not "new" – they are offered to assign.
  const entries = await loadEntries(ws)
  const plan = planExisting(
    ws,
    missing.filter((m) => !entries[m.id]),
    snapshot,
  )
  const known = plan.same.length + plan.versions.length
  const todo = missing.filter((m) => !plan.same.some((x) => x.material.id === m.id))
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
  const title = known
    ? t('materials.suggestedKnown', { count: missing.length - plan.same.length, known: plan.same.length })
    : t('materials.suggested', { count: todo.length })
  const names = todo
    .slice(0, 3)
    .map((m) => `„${m.filename ?? m.title}“ (${course(m.courseId)})`)
    .join(', ')
  const note = `${names}${todo.length > 3 ? ` und ${todo.length - 3} weitere` : ''}`
  await electronBridge()?.notifications?.add([
    {
      id: 'suggest:materials',
      kind: 'material',
      title,
      body: note,
      time: new Date().toISOString(),
      target: { type: 'review', what: 'materials' },
    },
  ])
  announce(title, {
    state: 'info',
    key: 'materials-suggestions',
    note,
    action: { label: t('materials.review'), run: () => void reviewMaterials(ws) },
  })
  return missing.length
}

/** "Ansehen": the new materials to tick – the ticked ones are saved (with progress). */
export async function reviewMaterials(ws: Workspace): Promise<number> {
  const snapshot = await electronBridge()?.moodle?.snapshot()
  if (!snapshot) return 0
  const { courseCounts } = await import('@/app/courseChoices')
  const missing = (await missingMaterials(ws, snapshot)).filter((m) => courseCounts(m.courseId))
  if (!missing.length) return 0
  const entries = await loadEntries(ws)
  // Updated files Notiva knows go through as before; unknown ones may already be in the folder.
  const plan = planExisting(
    ws,
    missing.filter((m) => !entries[m.id]),
    snapshot,
  )
  const todo = [...missing.filter((m) => entries[m.id]), ...plan.rest]
  const { useApp } = await import('@/app/store')
  const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
  const picked = await useApp.getState().ask({
    title: t('materials.suggested', { count: missing.length }),
    label:
      plan.same.length + plan.versions.length ? t('materials.reviewKnownNote') : t('materials.reviewNote'),
    confirmLabel: t('materials.apply'),
    checklist: [
      ...existingChecklist(plan),
      ...todo.map((m) => ({
        value: m.id,
        label: m.filename ?? m.title,
        detail: [course(m.courseId), m.section].filter(Boolean).join(' · '),
        checked: true,
      })),
    ],
  })
  if (picked === null) return 0
  const chosen = new Set(JSON.parse(picked) as string[])
  const { assigned, versions } = await applyExisting(
    ws,
    plan,
    chosen,
    snapshot,
    await moduleNamesOf(ws, snapshot),
  )
  if (assigned) announce(t('materials.assigned', { count: assigned }))
  const ids = new Set(todo.filter((m) => chosen.has(m.id)).map((m) => m.id))
  return assigned + versions + (ids.size ? await syncMaterials(ws, snapshot, ids) : 0)
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
