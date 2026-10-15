/**
 * "Mein Semester": the modules the user attends now (property Belegung), each with its Moodle
 * courses, files (lecture / lab / other), new files, PDFs with own notes, notes and code folders.
 * Pure – reads the workspace.
 */
import { joinPath } from './path'
import type { Page, Workspace } from './workspace'

export interface CourseFiles {
  course: Page
  folder: string
  groups: Record<string, string[]>
}

export interface ActiveModule {
  module: Page
  belegung: string[]
  courses: CourseFiles[]
  /** Files saved in the last days (newest first). */
  recent: Array<{ path: string; mtime: number }>
  /** PDFs with own highlights/notes (path of the PDF, notes page). */
  annotated: Array<{ pdf: string; notes: string }>
  notes: Page[]
  code: Page[]
}

const CATEGORIES = ['Vorlesung', 'Praktikum & Übung', 'Sonstiges']

/** PDFs that have a notes page next to them ("X (Notizen).md" with pdf: X.pdf). */
export function annotatedPdfs(ws: Workspace): Array<{ pdf: string; notes: string; mtime: number }> {
  return ws
    .all()
    .filter((p) => typeof p.data.pdf === 'string' && p.path.endsWith(' (Notizen).md'))
    .map((p) => {
      const dir = p.path.includes('/') ? p.path.slice(0, p.path.lastIndexOf('/')) : ''
      return { pdf: joinPath(dir, String(p.data.pdf)), notes: p.path, mtime: p.mtime }
    })
    .filter((a) => ws.assets().some((f) => f.path === a.pdf))
    .sort((a, b) => b.mtime - a.mtime)
}

export function activeModules(ws: Workspace, folder: string, now = Date.now(), days = 14): ActiveModule[] {
  const modulesDb = `${folder}/Module.md`
  if (!ws.get(modulesDb)?.database) return []
  const assets = ws.assets()
  const annotated = annotatedPdfs(ws)
  const out: ActiveModule[] = []
  for (const row of ws.rows(modulesDb)) {
    const belegung = Array.isArray(row.data.Belegung) ? row.data.Belegung.map(String) : []
    if (!belegung.length) continue
    const module = ws.get(row.path)!
    const linking = ws.backlinks(row.path)
    const courses: CourseFiles[] = linking
      .filter((p) => typeof p.data.Ordner === 'string' && p.data.moodle)
      .map((course) => {
        const dir = String(course.data.Ordner)
        const groups: Record<string, string[]> = {}
        for (const f of assets) {
          if (!f.path.startsWith(`${dir}/`)) continue
          const head = f.path.slice(dir.length + 1).split('/')[0]!
          const group = CATEGORIES.includes(head) ? head : 'Sonstiges'
          ;(groups[group] ??= []).push(f.path)
        }
        return { course, folder: dir, groups }
      })
    const folders = courses.map((c) => `${c.folder}/`)
    const inModule = (path: string) => folders.some((f) => path.startsWith(f))
    out.push({
      module,
      belegung,
      courses,
      recent: assets
        .filter((f) => inModule(f.path) && now - f.mtime < days * 86_400_000)
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 12)
        .map((f) => ({ path: f.path, mtime: f.mtime })),
      annotated: annotated.filter((a) => inModule(a.pdf)),
      notes: linking.filter(
        (p) => !p.data.moodle && !p.data.pruefungsplan && p.path.includes('/Mitschriften/'),
      ),
      code: ws.all().filter((p) => p.data.code === true && p.path.startsWith(`${row.path.slice(0, -3)}/`)),
    })
  }
  return out.sort((a, b) =>
    String(a.module.data.Nr ?? a.module.title).localeCompare(
      String(b.module.data.Nr ?? b.module.title),
      'de',
      { numeric: true },
    ),
  )
}
