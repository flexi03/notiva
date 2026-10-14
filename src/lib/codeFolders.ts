/**
 * Code folders (pages with `code: true`, their code next to them) and which one belongs to a file:
 * a lab PDF of a Moodle course → the course's module → the module's code folder.
 */
import type { Page, Workspace } from './workspace'

export const codeFolderOf = (page: Page) => page.path.slice(0, -3)

export function codePages(ws: Workspace): Page[] {
  return ws.all().filter((p) => p.data.code === true)
}

/** The module page a file belongs to (via the course page whose "Ordner" contains it). */
export function moduleOfFile(ws: Workspace, file: string): Page | undefined {
  const course = ws
    .all()
    .find((p) => typeof p.data.Ordner === 'string' && p.data.Ordner && file.startsWith(`${p.data.Ordner}/`))
  const ref = Array.isArray(course?.data.Modul)
    ? String(course!.data.Modul[0] ?? '')
    : String(course?.data.Modul ?? '')
  const target = /^\[\[([^\]|#]+)/.exec(ref)?.[1]
  const path = target ? ws.resolveLink(target, course!.path) : null
  return path ? ws.get(path) : undefined
}

/** Where a terminal next to this file starts: the module's code folder, else the file's folder. */
export function workFolderFor(ws: Workspace, file: string): { folder: string; codePage?: Page } {
  const module = moduleOfFile(ws, file)
  const codePage = module && codePages(ws).find((p) => p.path.startsWith(`${module.path.slice(0, -3)}/`))
  if (codePage) return { folder: codeFolderOf(codePage), codePage }
  return { folder: file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '' }
}
