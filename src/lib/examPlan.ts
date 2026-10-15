/**
 * Exam plans ("Prüfungsplan", "Prüfungsplanung"): the faculty publishes a PDF table per semester
 * (date, program, module code and name, examiner, room, duration, start). Notiva finds the newest
 * PDF on the faculty page, reads the table from the text positions and enters the dates of the
 * user's open modules into the exams database. Pure; downloading happens in the desktop app.
 */
import { propertyDef, type PropertyDef } from './database'
import type { FrontmatterData } from './frontmatter'
import type { AppNotification } from './notifications'
import type { PdfTextItem } from './pdfText'
import type { StudyState } from './study/state'
import { matchModuleName, nameScore } from './study/match'
import type { Workspace } from './workspace'

export interface PlanLink {
  url: string
  text: string
  /** YYYY-MM-DD from the file name ("20260608 SoSe2026 …"), if any. */
  date?: string
}

/** PDF links on a page that look like exam plans, newest first. */
export function findPlanLinks(html: string, base: string): PlanLink[] {
  const out: PlanLink[] = []
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+\.pdf)["'][^>]*>([\s\S]*?)<\/a>/gi
  for (let m = re.exec(html); m; m = re.exec(html)) {
    let url: string
    try {
      url = new URL(m[1]!.replace(/&amp;/g, '&'), base).toString()
    } catch {
      continue
    }
    if (!/^https:/i.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)/i.test(url)) continue
    const text = m[2]!
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const name = decodeURIComponent(url.split('/').pop() ?? '')
    if (!/pr(ü|ue)fungs(plan|planung|termin)/i.test(`${name} ${text} ${decodeURIComponent(url)}`)) continue
    const d = /(20\d{2})(\d{2})(\d{2})/.exec(name)
    out.push({ url, text: text || name, ...(d ? { date: `${d[1]}-${d[2]}-${d[3]}` } : {}) })
  }
  const unique = [...new Map(out.map((l) => [l.url, l])).values()]
  return unique.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
}

export interface PlanEntry {
  /** ISO date; none for "nach Vereinbarung". */
  date?: string
  program: string
  code: string
  name: string
  examiner: string
  room: string
  /** Minutes or form ("Portfolio", "Mündliche Prüfung"). */
  duration: string
  start: string
  title: string
}

const COLUMNS: Array<[keyof PlanEntry | 'day', RegExp]> = [
  ['date', /^datum$/i],
  ['day', /^tag$/i],
  ['program', /^studieng/i],
  ['code', /^code$|^modul-?nr/i],
  ['name', /^fachname$|^modul$|^prüfung$/i],
  ['examiner', /prüfer/i],
  ['room', /^raum/i],
  ['duration', /^dauer|^form/i],
  ['start', /^beginn|^uhrzeit|^zeit$/i],
  ['title', /^titel/i],
]

/**
 * Reads the table rows from the text pieces of each page: the header row ("Datum", "Fachname" …)
 * gives the column positions; every other line is one exam. Continuation lines (long titles) are
 * appended to the row above.
 */
export function parsePlanTable(pages: PdfTextItem[][]): PlanEntry[] {
  const entries: PlanEntry[] = []
  let columns: Array<{ key: (typeof COLUMNS)[number][0]; x: number }> | null = null
  for (const items of pages) {
    const lines = new Map<number, PdfTextItem[]>()
    for (const item of items) {
      const key = [...lines.keys()].find((y) => Math.abs(y - item.y) < 2.5) ?? item.y
      lines.set(key, [...(lines.get(key) ?? []), item])
    }
    const sorted = [...lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, l]) => l.sort((a, b) => a.x - b.x))
    for (const line of sorted) {
      const header = line
        .map((i) => ({ i, key: COLUMNS.find(([, re]) => re.test(i.str.trim()))?.[0] }))
        .filter((h) => h.key)
      if (header.length >= 4 && header.some((h) => h.key === 'name')) {
        columns = header.map((h) => ({ key: h.key!, x: h.i.x + (h.i.w ?? 0) / 2 })).sort((a, b) => a.x - b.x)
        continue
      }
      if (!columns) continue
      const cells = assignCells(line, columns)
      const date = /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(cells.date ?? '')
      const isRow = !!(cells.name && (date || /n\.\s?v|nach vereinbarung/i.test(cells.date ?? '')))
      if (!isRow) {
        // Second line of a long title.
        const last = entries[entries.length - 1]
        const extra = line.map((i) => i.str.trim()).join(' ')
        if (last && extra && !/version|prüfungsplanung|seite \d/i.test(extra))
          last.title = `${last.title} ${extra}`.trim()
        continue
      }
      entries.push({
        ...(date ? { date: `${date[3]}-${date[2]!.padStart(2, '0')}-${date[1]!.padStart(2, '0')}` } : {}),
        program: cells.program ?? '',
        code: cells.code ?? '',
        name: cells.name ?? '',
        examiner: cells.examiner ?? '',
        room: cells.room ?? '',
        duration: cells.duration ?? '',
        start: cells.start ?? '',
        title: cells.title ?? '',
      })
    }
  }
  return entries
}

/**
 * Headers are often centred over their column while cells are left-aligned: each cell goes to the
 * column whose header centre is nearest – one cell per column, the closest claim wins.
 */
function assignCells(
  line: PdfTextItem[],
  columns: Array<{ key: string; x: number }>,
): Partial<Record<string, string>> {
  // Pieces of one cell (split by the PDF writer) belong together.
  const merged: PdfTextItem[] = []
  for (const item of line) {
    const last = merged[merged.length - 1]
    if (last && item.x - (last.x + (last.w ?? 0)) < 2)
      merged[merged.length - 1] = {
        ...last,
        w: item.x + (item.w ?? 0) - last.x,
        str: `${last.str}${item.str}`,
      }
    else merged.push({ ...item })
  }
  const claims = merged.flatMap((item, i) =>
    columns.map((c) => ({ i, key: c.key, d: Math.abs(item.x + (item.w ?? 0) / 2 - c.x) })),
  )
  claims.sort((a, b) => a.d - b.d)
  const cells: Partial<Record<string, string>> = {}
  const placed = new Set<number>()
  for (const c of claims) {
    if (placed.has(c.i) || cells[c.key] !== undefined) continue
    cells[c.key] = merged[c.i]!.str.trim()
    placed.add(c.i)
  }
  return cells
}

/** "Version 1.3, 08.06.2026" from the first page, if printed. */
export function planVersion(pages: PdfTextItem[][]): string | undefined {
  const text = (pages[0] ?? []).map((i) => i.str).join(' ')
  return /version\s+[\d.]+(?:,\s*\d{1,2}\.\d{1,2}\.\d{4})?/i.exec(text)?.[0]
}

export interface PlannedExam {
  key: string
  modulePath?: string
  moduleNr: string
  title: string
  entry: PlanEntry
}

/**
 * The plan's entries for the user's open modules (not passed): same program (e.g. "BMI18"), then by
 * module name ("BMI 96: Mobile Anwendungen" → elective "Mobile Anwendungen"). Dated entries only.
 */
export function examsForStudy(entries: PlanEntry[], state: StudyState, since?: Date): PlannedExam[] {
  // Old dates (before `since`, e.g. 30 days ago) are not entered – only recent and upcoming ones.
  const from = since ? since.toISOString().slice(0, 10) : ''
  const code = state.program.planCode
  const open = state.modules.filter(
    (m) => m.status !== 'Bestanden' && m.status !== 'Endgültig nicht bestanden',
  )
  const out: PlannedExam[] = []
  for (const entry of entries) {
    if (!entry.date || entry.date < from) continue
    if (code && entry.program && entry.program.replace(/\s/g, '') !== code) continue
    const name = entry.name.replace(/^[A-Z]{2,5}\s?\d{1,3}[:.]\s*/, '')
    const found = matchModuleName(name, state.program)?.module
    const module =
      open.find((m) => m.module.nr === found?.nr) ?? open.find((m) => nameScore(name, m.module.name) >= 0.9)
    if (!module) continue
    out.push({
      key: `${module.module.nr}|${entry.date}|${entry.start}`,
      moduleNr: module.module.nr,
      title: `${/klausur|^\d+$/i.test(entry.duration) ? 'Klausur' : entry.duration || 'Prüfung'} ${module.module.name}`,
      entry,
    })
  }
  return out
}

const EXAM_PROPERTIES: PropertyDef[] = [
  { name: 'Beginn', type: 'text' },
  { name: 'Dauer', type: 'text' },
  { name: 'Prüfer', type: 'text' },
]

export interface ExamPlanChange {
  kind: 'create' | 'update'
  title: string
  detail: string
}

/**
 * What the plan changes in the exams database: new dates, moved dates/rooms. Rows are found again by
 * `pruefungsplan: <Modul>|<Datum>|<Beginn>` – or, when the date moved, by module and semester.
 */
export function planExamDates(
  ws: Workspace,
  examsDb: string,
  exams: PlannedExam[],
  modulePath: (nr: string) => string | undefined,
): { changes: ExamPlanChange[]; apply: () => Promise<void> } {
  const db = ws.get(examsDb)?.database
  if (!db) return { changes: [], apply: async () => {} }
  const rows = ws.rows(examsDb)
  const changes: ExamPlanChange[] = []
  const steps: Array<() => Promise<unknown>> = []
  const missing = EXAM_PROPERTIES.filter((p) => !propertyDef(db, p.name))
  if (missing.length)
    steps.push(() => ws.updateDatabase(examsDb, (d) => ({ ...d, properties: [...d.properties, ...missing] })))
  const art = propertyDef(db, 'Art')
  for (const exam of exams) {
    const e = exam.entry
    const path = modulePath(exam.moduleNr)
    const kind = /^\d+$/.test(e.duration) ? 'Klausur' : /mündlich/i.test(e.duration) ? 'Mündlich' : e.duration
    const values: FrontmatterData = {
      pruefungsplan: exam.key,
      Datum: e.date!,
      ...(path ? { Modul: [`[[${ws.linkText(path)}]]`] } : {}),
      ...(e.room ? { Raum: e.room } : {}),
      ...(e.start && e.start !== 'n.V.' ? { Beginn: e.start } : {}),
      ...(e.duration ? { Dauer: /^\d+$/.test(e.duration) ? `${e.duration} Min.` : e.duration } : {}),
      ...(e.examiner ? { Prüfer: e.examiner } : {}),
      ...(art?.type === 'select' && art.options?.some((o) => o.value === kind) ? { Art: kind } : {}),
    }
    const sameModule = (r: (typeof rows)[number]) =>
      typeof r.data.pruefungsplan === 'string' && r.data.pruefungsplan.startsWith(`${exam.moduleNr}|`)
    const row =
      rows.find((r) => r.data.pruefungsplan === exam.key) ??
      // Moved: the same module's planned exam within 120 days.
      rows.find(
        (r) =>
          sameModule(r) &&
          !exams.some((x) => x.key === r.data.pruefungsplan) &&
          Math.abs(Date.parse(String(r.data.Datum)) - Date.parse(e.date!)) < 120 * 86_400_000,
      )
    if (!row) {
      changes.push({ kind: 'create', title: exam.title, detail: `${e.date} ${e.start} · ${e.room}` })
      steps.push(() => ws.createRow(examsDb, `${exam.title} ${e.date}`, values))
      continue
    }
    const diff = Object.fromEntries(
      Object.entries(values).filter(([k, v]) => JSON.stringify(row.data[k]) !== JSON.stringify(v)),
    )
    if (!Object.keys(diff).length) continue
    changes.push({
      kind: 'update',
      title: row.title,
      detail: Object.entries(diff)
        .filter(([k]) => k !== 'pruefungsplan')
        .map(([k, v]) => `${k}: ${String(row.data[k] ?? '–')} → ${String(v)}`)
        .join(' · '),
    })
    steps.push(() => ws.save(row.path, { data: { ...row.data, ...diff } }))
  }
  return {
    changes,
    apply: async () => {
      for (const step of steps) await step()
    },
  }
}

/** Notifications for a new plan version and changed dates of the user's exams. */
export function examPlanNews(
  version: string | undefined,
  previousVersion: string | undefined,
  changes: ExamPlanChange[],
  now = new Date(),
  examsPage?: string,
): AppNotification[] {
  const time = now.toISOString()
  const target = examsPage ? { target: { type: 'page' as const, path: examsPage } } : {}
  const news: AppNotification[] = changes.map((c) => ({
    id: `examplan:${c.title}:${c.detail}`,
    kind: 'notice',
    title: c.kind === 'create' ? `Prüfungstermin: ${c.title}` : `Prüfungstermin geändert: ${c.title}`,
    body: c.detail,
    course: 'Prüfungsplan',
    time,
    ...target,
  }))
  if (version && version !== previousVersion && previousVersion !== undefined)
    news.unshift({
      id: `examplan-version:${version}`,
      kind: 'notice',
      title: `Neuer Prüfungsplan (${version})`,
      course: 'Prüfungsplan',
      time,
    })
  return news
}
