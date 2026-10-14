import { importTargets, type MoodleMaterial } from '@/lib/moodle'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** Which Moodle material was saved where in the vault (.notiva/moodle-files.json). */
export type MaterialMap = Record<string, string>

const META = 'moodle-files.json'

export async function loadMaterialMap(ws: Workspace): Promise<MaterialMap> {
  const raw = await ws.readMeta<Record<string, unknown>>(META)
  const map: MaterialMap = {}
  for (const [id, path] of Object.entries(raw ?? {}))
    if (typeof path === 'string' && ws.has(path)) map[id] = path
  return map
}

/** Downloads go next to the study dashboard ("Studium/Unterlagen/<Kurs>/…"), else "Unterlagen/…". */
export function materialFolder(ws: Workspace): string {
  const target = importTargets(ws).find((t) => t.tasks || t.modules)
  return target?.folder ? `${target.folder}/Unterlagen` : 'Unterlagen'
}

/** Saves a material into the vault (main process downloads it) and remembers where. */
export async function saveMaterial(ws: Workspace, material: MoodleMaterial): Promise<string> {
  const { path } = await electronBridge()!.moodle!.download(material.id, materialFolder(ws))
  await ws.reload()
  const map = await loadMaterialMap(ws)
  await ws.writeMeta(META, { ...map, [material.id]: path })
  return path
}

export const isPdf = (path: string) => /\.pdf$/i.test(path)
export const isImage = (path: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(path)
