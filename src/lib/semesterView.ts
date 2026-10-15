/**
 * "Mein Semester": one card per module the user attends now (property Belegung) – what matters this
 * week instead of every file: next session, next exam, open tasks, grade and attempts, the newest
 * lecture script and new materials, notes and annotated PDFs, the lab folder. Pure – reads the
 * workspace.
 */
import { COLORS, type Color } from './database'
import { joinPath } from './path'
import { DAYS, type TimetableRow } from './schedule'
import { courseIdsOf } from './study/modules'
import type { Page, Workspace } from './workspace'

export interface ActiveModule {
  module: Page
  belegung: string[]
  color: Color
  /** "Unterlagen/<Modul>" */
  folder: string
  /** Files per category (Vorlesung, Praktikum & Übung, Sonstiges). */
  counts: Record<string, number>
  /** The newest lecture file (by name: "Kapitel 07" after "Kapitel 06"). */
  latestLecture?: string
  /** Files saved in the last days (newest first, at most 3). */
  recent: Array<{ path: string; mtime: number }>
  recentCount: number
  annotated: Array<{ pdf: string; notes: string }>
  notes: Page[]
  code: Page[]
  nextSession?: {
    title: string
    day: string
    start: string
    end?: string
    room?: string
    type?: string
    at: Date
  }
  nextExam?: { page: Page; date: string }
  openTasks: Page[]
  courses: string[]
}

const CATEGORIES = ['Vorlesung', 'Praktikum & Übung', 'Sonstiges']
/** Colours for modules without "Farbe": stable per module, no gray/brown (too dull for cards). */
const PALETTE: Color[] = ['blue', 'green', 'purple', 'orange', 'pink', 'yellow', 'red']

/** The module's colour: its "Farbe" property, else one derived from its number/name. */
export function moduleColor(module: Page): Color {
  const own = module.data.Farbe
  if (typeof own === 'string' && (COLORS as readonly string[]).includes(own)) return own as Color
  const key = String(module.data.Nr ?? module.title)
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]!
}

/**
 * Colours for several modules at once (e.g. all attended ones): own "Farbe" first, the others get
 * their usual colour unless another module has it already – then the next free one.
 */
export function moduleColors(modules: Page[]): Map<string, Color> {
  const out = new Map<string, Color>()
  const used = new Set<Color>()
  const sorted = [...modules].sort((a, b) =>
    String(a.data.Nr ?? a.title).localeCompare(String(b.data.Nr ?? b.title), 'de', { numeric: true }),
  )
  for (const m of sorted)
    if (typeof m.data.Farbe === 'string' && (COLORS as readonly string[]).includes(m.data.Farbe)) {
      out.set(m.path, m.data.Farbe as Color)
      used.add(m.data.Farbe as Color)
    }
  for (const m of sorted) {
    if (out.has(m.path)) continue
    const wanted = moduleColor(m)
    const start = PALETTE.indexOf(wanted)
    const free = PALETTE.map((_, i) => PALETTE[(start + i) % PALETTE.length]!).find((c) => !used.has(c))
    const color = free ?? wanted
    out.set(m.path, color)
    used.add(color)
  }
  return out
}

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

/**
 * The script for a session: a lecture file of the module named after the date ("…07.10.2026…",
 * "2026-10-07", "0710") or – failing that – one saved in the last 7 days.
 */
export function scriptFor(
  ws: Workspace,
  base: string,
  module: string,
  date: Date,
  now = new Date(),
): string | undefined {
  const dir = `${base}/${module.replace(/[\\/:*?"<>|]/g, '-')}/Vorlesung/`
  const files = ws.assets().filter((f) => f.path.startsWith(dir) && /\.(pdf|pptx?)$/i.test(f.path))
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = date.getFullYear()
  const dated = new RegExp(`${d}[._-]?${m}[._-]?(${y}|${String(y).slice(2)})?(?!\\d)|${y}-?${m}-?${d}`)
  const byDate = files.find((f) => dated.test(f.path.slice(dir.length)))
  if (byDate) return byDate.path
  return files.filter((f) => now.getTime() - f.mtime < 7 * 86_400_000).sort((a, b) => b.mtime - a.mtime)[0]
    ?.path
}

/** The next start of a weekly session from `now` (today later counts). */
export function nextOccurrence(row: Pick<TimetableRow, 'day' | 'start'>, now: Date): Date | undefined {
  const idx = DAYS.indexOf(row.day as (typeof DAYS)[number])
  if (idx < 0 || !row.start) return undefined
  const [h, m] = row.start.split(':').map(Number)
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(now)
    d.setDate(now.getDate() + offset)
    if ((d.getDay() + 6) % 7 !== idx) continue
    d.setHours(h ?? 0, m ?? 0, 0, 0)
    if (d > now) return d
  }
  return undefined
}

const linksTo = (page: { path: string }, module: Page, ws: Workspace) =>
  ws.backlinks(module.path).some((p) => p.path === page.path)

export function activeModules(
  ws: Workspace,
  folder: string,
  materials: string,
  timetable: TimetableRow[] = [],
  now = new Date(),
  days = 14,
): ActiveModule[] {
  const modulesDb = `${folder}/Module.md`
  if (!ws.get(modulesDb)?.database) return []
  const assets = ws.assets()
  const annotated = annotatedPdfs(ws)
  const today = now.toISOString().slice(0, 10)
  const rowsOf = (db: string) => (ws.get(`${folder}/${db}.md`)?.database ? ws.rows(`${folder}/${db}.md`) : [])
  const exams = rowsOf('Prüfungen')
  const tasks = rowsOf('Aufgaben')
  const out: ActiveModule[] = []
  for (const row of ws.rows(modulesDb)) {
    const belegung = Array.isArray(row.data.Belegung) ? row.data.Belegung.map(String) : []
    if (!belegung.length) continue
    const module = ws.get(row.path)!
    const dir = `${materials}/${row.title.replace(/[\\/:*?"<>|]/g, '-')}`
    const files = assets.filter((f) => f.path.startsWith(`${dir}/`))
    const counts: Record<string, number> = {}
    for (const f of files) {
      const head = f.path.slice(dir.length + 1).split('/')[0]!
      const group = CATEGORIES.includes(head) ? head : 'Sonstiges'
      counts[group] = (counts[group] ?? 0) + 1
    }
    const lectures = files
      .filter((f) => f.path.startsWith(`${dir}/Vorlesung/`) && /\.(pdf|pptx?)$/i.test(f.path))
      .sort((a, b) => b.path.localeCompare(a.path, 'de', { numeric: true }))
    const recent = files
      .filter((f) => now.getTime() - f.mtime < days * 86_400_000)
      .sort((a, b) => b.mtime - a.mtime)
    const sessions = timetable
      .filter((s) => s.module === row.title)
      .map((s) => ({ s, at: nextOccurrence(s, now) }))
      .filter((x): x is { s: TimetableRow; at: Date } => !!x.at)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
    const exam = exams
      .filter((e) => typeof e.data.Datum === 'string' && e.data.Datum >= today && linksTo(e, module, ws))
      .sort((a, b) => String(a.data.Datum).localeCompare(String(b.data.Datum)))[0]
    const next = sessions[0]
    out.push({
      module,
      belegung,
      color: moduleColor(module),
      folder: dir,
      counts,
      ...(lectures[0] ? { latestLecture: lectures[0].path } : {}),
      recent: recent.slice(0, 3).map((f) => ({ path: f.path, mtime: f.mtime })),
      recentCount: recent.length,
      annotated: annotated.filter((a) => a.pdf.startsWith(`${dir}/`)),
      notes: ws.backlinks(row.path).filter((p) => p.path.includes('/Mitschriften/')),
      code: ws.all().filter((p) => p.data.code === true && p.path.startsWith(`${row.path.slice(0, -3)}/`)),
      ...(next
        ? {
            nextSession: {
              title: next.s.title,
              day: next.s.day!,
              start: next.s.start!,
              ...(next.s.end ? { end: next.s.end } : {}),
              ...(next.s.room ? { room: next.s.room } : {}),
              ...(next.s.type ? { type: next.s.type } : {}),
              at: next.at,
            },
          }
        : {}),
      ...(exam ? { nextExam: { page: ws.get(exam.path)!, date: String(exam.data.Datum) } } : {}),
      openTasks: tasks
        .filter((t) => t.data.Status !== 'Erledigt' && linksTo(t, module, ws))
        .map((t) => ws.get(t.path)!)
        .sort((a, b) => String(a.data.Fällig ?? '9').localeCompare(String(b.data.Fällig ?? '9'))),
      courses: courseIdsOf(row.data),
    })
  }
  // Distinct colours for the attended modules.
  const colors = moduleColors(out.map((m) => m.module))
  for (const m of out) m.color = colors.get(m.module.path) ?? m.color
  // Soonest session first – the card you need next is on top.
  return out.sort(
    (a, b) =>
      (a.nextSession?.at.getTime() ?? Infinity) - (b.nextSession?.at.getTime() ?? Infinity) ||
      String(a.module.data.Nr ?? a.module.title).localeCompare(
        String(b.module.data.Nr ?? b.module.title),
        'de',
        {
          numeric: true,
        },
      ),
  )
}
