import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { importTargets, type MoodleMaterial, type MoodleSnapshot } from '@/lib/moodle'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** Which Moodle material was saved where in the vault (.notiva/moodle-files.json). */
export type MaterialMap = Record<string, string>
interface MaterialEntry {
  path: string
  /** Moodle's "last modified" when it was saved – a newer one means: download again. */
  modified?: string
}

const META = 'moodle-files.json'

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

/** Saves a material into the vault (main process downloads it) and remembers where. */
export async function saveMaterial(ws: Workspace, material: MoodleMaterial): Promise<string> {
  const { path } = await electronBridge()!.moodle!.download(material.id, materialFolder(ws))
  await ws.reload()
  const entries = await loadEntries(ws)
  await ws.writeMeta(META, {
    ...entries,
    [material.id]: { path, ...(material.modified ? { modified: material.modified } : {}) },
  })
  return path
}

/** Files worth keeping locally: scripts, slides, sheets, notebooks … (not videos, max. 100 MB). */
const DOCUMENT = /\.(pdf|pptx?|docx?|xlsx?|odt|odp|ods|txt|md|csv|ipynb|tex|zip)$/i

/** New or updated documents of the last fetch that are not in the vault yet. */
export async function missingMaterials(ws: Workspace, snapshot: MoodleSnapshot): Promise<MoodleMaterial[]> {
  const entries = await loadEntries(ws)
  return (snapshot.materials ?? []).filter((m) => {
    if (m.kind !== 'file' || !m.filename || !DOCUMENT.test(m.filename) || (m.size ?? 0) > 100_000_000)
      return false
    const saved = entries[m.id]
    return !saved || (!!m.modified && !!saved.modified && m.modified > saved.modified)
  })
}

let running: Promise<number> | null = null

/** Saves all new/updated documents – with progress bar and confirmation. Runs once at a time. */
export function syncMaterials(ws: Workspace, snapshot: MoodleSnapshot): Promise<number> {
  running ??= (async () => {
    const todo = await missingMaterials(ws, snapshot)
    if (todo.length === 0) return 0
    const course = (id: string) => snapshot.courses.find((c) => c.id === id)?.name ?? ''
    return withProgress(
      t('materials.saving'),
      async (task) => {
        let saved = 0
        const failed: string[] = []
        for (const [i, m] of todo.entries()) {
          task.update(i, todo.length, `${course(m.courseId)} · ${m.filename ?? m.title}`)
          try {
            await saveMaterial(ws, m)
            saved++
          } catch {
            failed.push(m.filename ?? m.title)
          }
        }
        task.update(todo.length, todo.length)
        if (failed.length && !saved)
          throw new Error(t('materials.failed', { names: failed.slice(0, 3).join(', ') }))
        return saved
      },
      { success: (n) => t('materials.saved', { count: n }) },
    )
  })().finally(() => (running = null))
  return running
}

export const isPdf = (path: string) => /\.pdf$/i.test(path)
export const isImage = (path: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(path)
