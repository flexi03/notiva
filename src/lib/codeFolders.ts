/**
 * Code folders (pages with `code: true`, their code next to them) and which one belongs to a file:
 * a lab PDF in "Unterlagen/<Modul>/…" → the module → the module's code folder.
 */
import { safeFileName } from './moodle'
import { findStudyDashboard } from './study/sync'
import type { Page, Workspace } from './workspace'

export const codeFolderOf = (page: Page) => page.path.slice(0, -3)

export function codePages(ws: Workspace): Page[] {
  return ws.all().filter((p) => p.data.code === true)
}

/**
 * The module page a file belongs to: its materials folder "Unterlagen/<Modul>/…" – or, in vaults
 * from before Notiva 0.1.4, the course page whose "Ordner" contains it.
 */
export function moduleOfFile(ws: Workspace, file: string): Page | undefined {
  const folder = /(?:^|\/)Unterlagen\/([^/]+)\//.exec(file)?.[1]
  const dash = folder ? findStudyDashboard(ws) : null
  const modulesDb = dash && `${dash.folder}/Module.md`
  if (modulesDb && ws.get(modulesDb)?.database) {
    const row = ws.rows(modulesDb).find((r) => safeFileName(r.title) === folder)
    if (row) return ws.get(row.path)
  }
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

/** Files Notiva opens as text (in the code editor) – code, data, configuration. */
export const TEXT_FILE =
  /\.(txt|csv|tsv|json|sql|py|java|kt|js|mjs|cjs|ts|tsx|jsx|html?|css|scss|xml|ya?ml|sh|zsh|bash|c|h|cpp|hpp|cs|go|rs|rb|php|swift|gradle|properties|ini|toml|env|tex|r|m|log|ipynb|gitignore|dockerfile)$/i

export const isTextFile = (path: string) =>
  TEXT_FILE.test(path) || /(^|\/)(Dockerfile|Makefile|\.gitignore)$/.test(path)

/**
 * Where a terminal next to this file starts: the module's code folder, else the file's folder.
 * `fileFolder`: the file's own folder when that is a different one (a second terminal there).
 */
export function workFolderFor(
  ws: Workspace,
  file: string,
): { folder: string; codePage?: Page; fileFolder?: string } {
  const own = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
  // A file inside a code folder: that folder.
  const inside = codePages(ws).find((p) => file.startsWith(`${codeFolderOf(p)}/`))
  if (inside) return { folder: codeFolderOf(inside), codePage: inside }
  const module = moduleOfFile(ws, file)
  const codePage = module && codePages(ws).find((p) => p.path.startsWith(`${module.path.slice(0, -3)}/`))
  if (codePage) return { folder: codeFolderOf(codePage), codePage, fileFolder: own }
  return { folder: own }
}

/**
 * The other way round: a code folder's lab materials – "Unterlagen/<Modul>/Praktikum & Übung" of
 * the module it lies in (else the module's materials folder), undefined when there are none.
 */
export function materialsFor(ws: Workspace, codePage: Page): string | undefined {
  const parts = codePage.path.split('/').slice(0, -1)
  let module: Page | undefined
  for (let i = parts.length; i > 0 && !module; i--) module = ws.get(`${parts.slice(0, i).join('/')}.md`)
  if (!module) return undefined
  const files = [...ws.all().map((p) => p.path), ...ws.assets().map((f) => f.path)]
  const inModule = new RegExp(`^(?:.*/)?Unterlagen/${escape(safeFileName(module.title))}/`)
  const base = files.map((f) => inModule.exec(f)?.[0]).find(Boolean)
  if (!base) return undefined
  const lab = `${base}Praktikum & Übung`
  return files.some((f) => f.startsWith(`${lab}/`)) ? lab : base.slice(0, -1)
}

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
