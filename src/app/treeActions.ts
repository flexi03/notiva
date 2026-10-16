import { forgetMaterials, moveMaterials } from '@/app/materials'
import { t } from '@/i18n'
import { basename } from '@/lib/path'
import type { TrashEntry, Workspace } from '@/lib/workspace'

/**
 * Actions on several entries of the side bar at once (pages, files, folders) – used by drag & drop,
 * the right-click menu and the Delete key. Paths are tree ids: a page "X.md", a file, or a folder.
 */

const inside = (path: string, folder: string) => path === folder || path.startsWith(`${folder}/`)

/** Only the outermost entries: a folder already covers everything in it. */
export function outermost(paths: string[]): string[] {
  const folderOf = (p: string) => (p.endsWith('.md') ? p.slice(0, -3) : p)
  return paths.filter((p) => !paths.some((q) => q !== p && inside(p, folderOf(q))))
}

/** Whether dropping `paths` into `folder` moves anything (not into itself, not where they are). */
export function canMove(paths: string[], folder: string): boolean {
  return outermost(paths).some((p) => {
    const own = p.endsWith('.md') ? p.slice(0, -3) : p
    const parent = p.slice(0, Math.max(0, p.lastIndexOf('/')))
    return parent !== folder && !inside(folder, own)
  })
}

/**
 * Moves pages, files and folders into `folder`. Pages keep their links (Workspace.moveTo); files and
 * folders go with their notes pages, Moodle materials keep their place in Notiva's list (no "new"
 * suggestions afterwards). Returns how many entries moved.
 */
export async function moveEntries(ws: Workspace, paths: string[], folder: string): Promise<number> {
  let count = 0
  for (const path of outermost(paths)) {
    const own = path.endsWith('.md') ? path.slice(0, -3) : path
    if (inside(folder, own) || path.slice(0, path.lastIndexOf('/')) === folder) continue
    if (ws.get(path)) {
      await ws.moveTo(path, folder)
      count++
    } else if (ws.has(path)) {
      count += await moveMaterials(ws, [{ from: path, to: `${folder}/${basename(path)}` }])
    } else {
      // A folder: every file in it, the structure kept.
      const target = `${folder}/${basename(path)}`
      const moves = ws
        .assets()
        .filter((f) => f.path.startsWith(`${path}/`))
        .map((f) => ({ from: f.path, to: target + f.path.slice(path.length) }))
      if (moves.length && (await moveMaterials(ws, moves))) count++
    }
  }
  return count
}

/** How many files the entries hold (for the question before the trash). */
export function countInside(ws: Workspace, paths: string[]): number {
  return outermost(paths).reduce((sum, p) => {
    if (ws.get(p) || ws.has(p)) return sum + 1
    return sum + ws.assets().filter((f) => f.path.startsWith(`${p}/`)).length
  }, 0)
}

/**
 * Into Notiva's trash (restorable). Moodle files among them are remembered as removed – the next
 * check does not offer them again.
 */
export async function trashEntries(ws: Workspace, paths: string[]): Promise<TrashEntry[]> {
  const list = outermost(paths)
  await forgetMaterials(
    ws,
    list.flatMap((p) => (p.endsWith('.md') ? [p, p.slice(0, -3)] : [p])),
  )
  const entries: TrashEntry[] = []
  for (const p of list) entries.push(await (ws.get(p) ? ws.trash(p) : ws.trashPath(p)))
  return entries
}

/** Undo for trashEntries. */
export async function restoreEntries(ws: Workspace, entries: TrashEntry[]): Promise<void> {
  for (const e of entries) await ws.restore(e.id)
}

export const trashLabel = (ws: Workspace, paths: string[]) => {
  const list = outermost(paths)
  const files = countInside(ws, list)
  if (list.length > 1) return t('tree.trashMany', { count: files })
  const [only] = list
  return ws.get(only!) || ws.has(only!) ? t('tree.trashFile') : t('tree.trashFolder', { count: files })
}
