/**
 * Exam results from eCampus (HISinOne/QIS "Leistungen anzeigen" / Notenspiegel). The desktop app
 * opens the pages with the university login and runs {@link extractTables} in every frame; the rest
 * is pure: recognize the results table by its headers, normalize the rows, plan the import into the
 * module database and find what is new.
 */
import { propertyDef } from './database'
import type { FrontmatterData } from './frontmatter'
import type { AppNotification } from './notifications'
import type { PlanItem } from './moodle'
import type { Workspace } from './workspace'

export interface RawTable {
  url: string
  headers: string[]
  /** Cell texts; a cell spanning several columns is followed by empty strings (aligned to the headers). */
  rows: string[][]
  /** Per row: the first filled cell spans at least three columns (a heading row such as "Konto"). */
  wide?: boolean[]
}

/**
 * Runs inside the eCampus page (stringified – must not use anything from outside): every table
 * whose header mentions a grade, with the texts of its cells.
 */
export function extractTables(doc: Document): RawTable[] {
  const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()
  const out: RawTable[] = []
  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const rows = Array.from(table.querySelectorAll('tr'))
    const headerRow = rows.find((r) => r.querySelector('th'))
    if (!headerRow) continue
    const headers: string[] = []
    for (const c of Array.from(headerRow.querySelectorAll('th,td'))) {
      headers.push(clean(c.textContent))
      for (let i = 1; i < Math.min(20, Number(c.getAttribute('colspan')) || 1); i++) headers.push('')
    }
    if (!headers.some((h) => /^note\b|^grade/i.test(h))) continue
    const body: string[][] = []
    const wide: boolean[] = []
    for (const r of rows) {
      if (r === headerRow || r.querySelector('th')) continue
      const cells: string[] = []
      let isWide = false
      for (const c of Array.from(r.querySelectorAll('td'))) {
        const span = Math.min(20, Number(c.getAttribute('colspan')) || 1)
        const value = clean(c.textContent)
        if (value && !cells.some(Boolean) && span >= 3) isWide = true
        cells.push(value)
        for (let i = 1; i < span; i++) cells.push('')
      }
      if (!cells.some(Boolean)) continue
      body.push(cells)
      wide.push(isWide)
    }
    out.push({ url: doc.location?.href ?? '', headers, rows: body, wide })
  }
  return out
}

export type ExamStatus = 'passed' | 'failed' | 'failedFinal' | 'registered' | 'other'

export interface ExamRecord {
  /** Stable key: exam number (or title) + attempt. */
  id: string
  number?: string
  title: string
  semester?: string
  /** Grade as number (1,7 → 1.7), if any. */
  grade?: number
  /** Grade as shown (e.g. "1,7", "BE"). */
  gradeText?: string
  status: ExamStatus
  statusText: string
  credits?: number
  attempt?: number
  /** ISO date (YYYY-MM-DD). */
  date?: string
  remark?: string
  /** Heading row above (e.g. module group / "Konto"). */
  group?: string
  /**
   * exam: one attempt; module: the module's own row above its exams (status, credits of the module);
   * account: a sum row such as "Gesamtkonto" (credits so far).
   */
  level?: 'exam' | 'module' | 'account'
}

export interface ExamSnapshot {
  site: string
  fetchedAt: string
  records: ExamRecord[]
  /** The tables as read – kept so a better parser can read them again without a new login. */
  tables?: RawTable[]
}

/** Records of a stored snapshot, read again from its tables (newer parser) when they are there. */
export function snapshotRecords(snapshot: ExamSnapshot): ExamRecord[] {
  if (snapshot.tables?.length) {
    const records = parseResults(snapshot.tables)
    if (records.length) return records
  }
  return snapshot.records
}

const COLUMNS: Array<[keyof ExamRecord | 'grade', RegExp]> = [
  ['number', /prüfungs?-?nr|^nr\.?$|nummer|^pnr/i],
  ['title', /prüfungstext|bezeichnung|titel|^text$|modul|leistung|prüfung$/i],
  ['semester', /semester|^sem\.?$|zeitraum/i],
  ['grade', /^note\b|^grade/i],
  ['status', /^status|^ergebnis/i],
  ['credits', /credits|ects|^cp$|^lp$|leistungspunkte|bonus/i],
  ['attempt', /versuch|^vs\.?$/i],
  ['date', /datum|date/i],
  ['remark', /vermerk|bemerkung|^frei/i],
]

const number = (s: string | undefined) => {
  if (!s) return undefined
  const m = /-?\d+(?:[.,]\d+)?/.exec(s)
  return m ? Number(m[0].replace(',', '.')) : undefined
}

export function normalizeStatus(text: string, grade?: number): ExamStatus {
  const t = text.trim().toLowerCase()
  if (/endgültig nicht|^en$/.test(t)) return 'failedFinal'
  if (/nicht bestanden|^nb$|failed/.test(t)) return 'failed'
  if (/bestanden|^be$|passed|anerkannt|^an?e$/.test(t)) return 'passed'
  if (/angemeldet|^an$|registered|zugelassen/.test(t)) return 'registered'
  if (!t && grade !== undefined) return grade <= 4 ? 'passed' : 'failed'
  return 'other'
}

function isoDate(s: string | undefined): string | undefined {
  const m = s && /(\d{1,2})\.(\d{1,2})\.(\d{4})/.exec(s)
  return m ? `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}` : undefined
}

const STATUS_WORD = /bestanden|angemeldet|prüfung vorhanden|zugelassen|anerkannt/i
const isTermText = (s: string | undefined) => !!s && /(wi|so|w|s)\D{0,12}\d{2}/i.test(s)

/**
 * The rows of all result tables as records; heading rows (one wide cell) set the group. Rows without
 * attempt and date are the module's or an account's own row (HISinOne lists them above the exams,
 * often with fewer columns – then status and credits sit one column further left).
 */
export function parseResults(tables: RawTable[]): ExamRecord[] {
  const records: ExamRecord[] = []
  const seen = new Set<string>()
  for (const table of tables) {
    const index: Partial<Record<string, number>> = {}
    table.headers.forEach((h, i) => {
      for (const [key, re] of COLUMNS)
        if (index[key] === undefined && re.test(h)) return void (index[key] = i)
    })
    if (index.title === undefined || index.grade === undefined) continue
    let group: string | undefined
    table.rows.forEach((cells, rowIndex) => {
      const get = (key: string) => (index[key] !== undefined ? (cells[index[key]!] ?? '').trim() : '')
      const filled = cells.filter(Boolean)
      // Group/"Konto" headings span the table.
      if (table.wide?.[rowIndex] ? filled.length === 1 : cells.length < Math.min(table.headers.length, 3)) {
        group = filled[0]
        return
      }
      const title = get('title')
      if (!title) return
      let gradeText = get('grade')
      let statusText = get('status')
      let creditsText = get('credits')
      const attempt = number(get('attempt'))
      const date = isoDate(get('date'))
      let semester = get('semester') || undefined
      const aggregate = attempt === undefined && !date
      if (aggregate) {
        // Shifted row: the status word sits under "Note", the credits under "Status".
        if ((!gradeText || STATUS_WORD.test(gradeText)) && /^\d+(?:[.,]\d+)?$/.test(statusText)) {
          creditsText = statusText
          statusText = gradeText
          gradeText = ''
        }
        if (!isTermText(semester)) semester = undefined
      }
      const grade = number(gradeText)
      const status = normalizeStatus(statusText || (/^(be|nb|an)$/i.test(gradeText) ? gradeText : ''), grade)
      const num = get('number') || undefined
      let id = `${num ?? title}#${attempt ?? semester ?? 0}`
      while (seen.has(id)) id += '+'
      seen.add(id)
      const credits = number(creditsText)
      const remark = get('remark')
      records.push({
        id,
        ...(num ? { number: num } : {}),
        title,
        ...(semester ? { semester } : {}),
        ...(grade !== undefined && grade >= 1 && grade <= 5 ? { grade } : {}),
        ...(gradeText ? { gradeText } : {}),
        status,
        statusText: statusText || gradeText,
        ...(credits !== undefined ? { credits } : {}),
        ...(attempt !== undefined ? { attempt } : {}),
        ...(date ? { date } : {}),
        ...(remark ? { remark } : {}),
        ...(group ? { group } : {}),
        level: aggregate ? 'module' : 'exam',
      })
    })
  }
  // A module row without exams below it is a sum ("Gesamtkonto", "Module").
  for (const r of records) {
    if (r.level !== 'module') continue
    if (!records.some((e) => e.level === 'exam' && belongsTo(e, r))) r.level = 'account'
  }
  return records
}

/** Exam 3351 belongs to module 3350 (same number, or the module's number plus 1–9). */
function belongsTo(exam: ExamRecord, module: ExamRecord): boolean {
  if (exam.number && module.number) {
    const e = Number(exam.number)
    const m = Number(module.number)
    if (Number.isFinite(e) && Number.isFinite(m)) return e === m || (m % 10 === 0 && e > m && e < m + 10)
    return exam.number === module.number
  }
  return norm(exam.title) === norm(module.title)
}

/* ---------- per module: all attempts ---------- */

export interface ModuleResult {
  /** Exam number of the module (e.g. "3350"), or the normalized title. */
  key: string
  number?: string
  title: string
  status: 'passed' | 'failed' | 'failedFinal' | 'registered' | 'open'
  grade?: number
  gradeText?: string
  credits?: number
  /** Term of the passed attempt (or of the last one). */
  semester?: string
  date?: string
  /** All attempts, oldest first (registrations included). */
  attempts: ExamRecord[]
  /** Attempts that counted (passed or failed – not registrations). */
  tries: number
  failedTries: number
}

/**
 * Groups the records by module: the module's own row (if any) and the attempts of its exams. The
 * module row knows the credits and whether the module as a whole is passed.
 */
export function moduleResults(records: ExamRecord[]): ModuleResult[] {
  const modules = records.filter((r) => r.level === 'module')
  const groups = new Map<string, { head?: ExamRecord; exams: ExamRecord[] }>()
  for (const m of modules) groups.set(m.number ?? norm(m.title), { head: m, exams: [] })
  for (const r of records) {
    if (r.level && r.level !== 'exam') continue
    const head = modules.find((m) => belongsTo(r, m))
    const key = head ? (head.number ?? norm(head.title)) : (r.number ?? norm(r.title))
    const group = groups.get(key) ?? { exams: [] }
    group.exams.push(r)
    groups.set(key, group)
  }
  const order = (r: ExamRecord) => `${r.date ?? '9999'}#${String(r.attempt ?? 0).padStart(3, '0')}`
  const out: ModuleResult[] = []
  for (const [key, { head, exams }] of groups) {
    const attempts = [...exams].sort((a, b) => order(a).localeCompare(order(b)))
    const counted = attempts.filter(
      (a) => a.status === 'passed' || a.status === 'failed' || a.status === 'failedFinal',
    )
    const passed = [...counted].reverse().find((a) => a.status === 'passed')
    const last = attempts[attempts.length - 1]
    const status: ModuleResult['status'] =
      head?.status === 'passed' || passed
        ? 'passed'
        : attempts.some((a) => a.status === 'failedFinal') || head?.status === 'failedFinal'
          ? 'failedFinal'
          : last?.status === 'registered'
            ? 'registered'
            : counted.length
              ? 'failed'
              : 'open'
    const graded = passed ?? (status === 'passed' ? undefined : counted[counted.length - 1])
    const credits =
      (head?.credits && head.credits > 0 ? head.credits : undefined) ??
      (passed?.credits && passed.credits > 0 ? passed.credits : undefined)
    const semester = (passed ?? last)?.semester
    const date = (passed ?? last)?.date
    out.push({
      key,
      ...((head ?? attempts[0])?.number ? { number: (head ?? attempts[0])!.number! } : {}),
      title: (head ?? passed ?? last)?.title ?? key,
      status,
      ...(graded?.grade !== undefined ? { grade: graded.grade } : {}),
      ...(graded?.gradeText && graded.grade !== undefined ? { gradeText: graded.gradeText } : {}),
      ...(credits !== undefined ? { credits } : {}),
      ...(semester ? { semester } : {}),
      ...(date ? { date } : {}),
      attempts,
      tries: counted.length,
      failedTries: counted.filter((a) => a.status !== 'passed').length,
    })
  }
  return out.sort((a, b) => (a.number ?? a.title).localeCompare(b.number ?? b.title, 'de', { numeric: true }))
}

/** Credits and grade average over passed modules (weighted by credits). */
export function resultSummary(results: ModuleResult[]): {
  credits: number
  average: number | null
  passed: number
} {
  const passed = results.filter((r) => r.status === 'passed')
  const credits = passed.reduce((s, r) => s + (r.credits ?? 0), 0)
  const graded = passed.filter((r) => r.grade !== undefined && r.credits)
  const weight = graded.reduce((s, r) => s + r.credits!, 0)
  return {
    credits,
    average: weight ? graded.reduce((s, r) => s + r.grade! * r.credits!, 0) / weight : null,
    passed: passed.length,
  }
}

/* ---------- import into the module database ---------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\b(ws|ss|wise|sose|wintersemester|sommersemester)\s*\d{2,4}(\/\d{2,4})?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Module page for an exam: same name, or one name contains the other (min. 6 characters). */
export function matchModule(
  title: string,
  modules: Array<{ path: string; title: string }>,
): string | undefined {
  const t = norm(title)
  if (!t) return undefined
  return (
    modules.find((m) => norm(m.title) === t)?.path ??
    modules.find((m) => {
      const n = norm(m.title)
      return n.length >= 6 && t.length >= 6 && (n.includes(t) || t.includes(n))
    })?.path
  )
}

/** Per exam (number/title) the record that counts: passed beats failed, the latest attempt wins. */
export function finalResults(records: ExamRecord[]): ExamRecord[] {
  const byExam = new Map<string, ExamRecord>()
  const rank = (r: ExamRecord) =>
    r.status === 'passed' ? 3 : r.status === 'failedFinal' ? 2 : r.status === 'failed' ? 1 : 0
  for (const r of records) {
    if (r.status === 'other' || r.status === 'registered' || (r.level && r.level !== 'exam')) continue
    const key = r.number ?? norm(r.title)
    const prev = byExam.get(key)
    if (!prev || rank(r) > rank(prev) || (rank(r) === rank(prev) && (r.attempt ?? 0) > (prev.attempt ?? 0)))
      byExam.set(key, r)
  }
  return [...byExam.values()]
}

/**
 * What the import changes in the module database: grade, status and ECTS of matching modules,
 * new modules for results without one. Status/grades the user set are only overwritten by a final
 * result from eCampus.
 */
export function planExamImport(ws: Workspace, records: ExamRecord[], modulesDb: string): PlanItem[] {
  const db = ws.get(modulesDb)?.database
  if (!db) return []
  const rows = ws.rows(modulesDb).map((r) => ({ path: r.path, title: r.title, data: r.data }))
  const statusProp = propertyDef(db, 'Status')
  const option = (v: string) => (statusProp?.options?.some((o) => o.value === v) ? v : undefined)
  const plan: PlanItem[] = []
  for (const r of moduleResults(records)) {
    if (r.status !== 'passed' && r.status !== 'failed' && r.status !== 'failedFinal') continue
    const values: FrontmatterData = {}
    const status = r.status === 'passed' ? option('Bestanden') : option('Nicht bestanden')
    if (status) values.Status = status
    if (r.grade !== undefined && propertyDef(db, 'Note')) values.Note = r.grade
    if (r.credits && propertyDef(db, 'ECTS')) values.ECTS = r.credits
    const key = `exam:${r.number ?? norm(r.title)}`
    const path = matchModule(r.title, rows)
    if (path) {
      const row = rows.find((x) => x.path === path)!
      const changes: FrontmatterData = {}
      for (const [k, v] of Object.entries(values)) {
        if (k === 'ECTS' && row.data.ECTS !== undefined && row.data.ECTS !== null && row.data.ECTS !== '')
          continue
        if (row.data[k] !== v) changes[k] = v
      }
      if (row.data.pruefung !== key) changes.pruefung = key
      if (Object.keys(changes).length)
        plan.push({ kind: 'update', key, path, title: row.title, changes, what: 'module' })
    } else if (r.status === 'passed' || r.status === 'failed' || r.status === 'failedFinal') {
      plan.push({
        kind: 'create',
        key,
        db: modulesDb,
        title: r.title,
        values: { ...values, pruefung: key },
        what: 'module',
      })
    }
  }
  return plan
}

/* ---------- news ---------- */

function describe(r: ExamRecord): string {
  const parts = [
    r.gradeText && r.grade !== undefined ? `Note ${r.gradeText}` : '',
    r.statusText,
    r.semester ?? '',
  ].filter(Boolean)
  return parts.join(' · ')
}

/** New or changed results since the last check (first check = baseline, reports nothing). */
export function examNews(
  previous: ExamSnapshot | null,
  next: ExamSnapshot,
  now = new Date(),
): AppNotification[] {
  if (!previous) return []
  const old = new Map(previous.records.map((r) => [r.id, r]))
  const news: AppNotification[] = []
  for (const r of next.records) {
    if (r.level === 'account') continue
    const before = old.get(r.id)
    if (before && before.status === r.status && before.gradeText === r.gradeText) continue
    news.push({
      id: `exam:${r.id}:${r.status}:${r.gradeText ?? ''}`,
      kind: 'grade',
      title: r.title,
      body: before ? `${describe(before)} → ${describe(r)}` : describe(r),
      course: r.status === 'registered' ? 'Prüfungsanmeldung' : 'Prüfungsergebnis',
      time: now.toISOString(),
    })
  }
  return news
}

/* ---------- finding the way to the results (desktop app drives the eCampus window) ---------- */

export interface PageLink {
  text: string
  title: string
  href: string
}

export interface PageState {
  url: string
  /** A logout link is visible → signed in. */
  loggedIn: boolean
  /** A login form or the identity provider is shown. */
  loginPage: boolean
  links: PageLink[]
  tables: RawTable[]
}

/**
 * Runs inside an eCampus frame (stringified, self-contained): login state, links and result tables.
 * Uses {@link extractTables} passed in as `extract`.
 */
export function pageState(doc: Document, extract: (doc: Document) => RawTable[]): PageState {
  const text = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const anchors = Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[]
  const loggedIn = anchors.some((a) => /abmelden|logout/i.test(`${text(a)} ${a.title} ${a.id}`))
  const loginPage =
    /login\.microsoftonline\.com|\/idp\/|\/saml/i.test(doc.location?.href ?? '') ||
    (!!doc.querySelector('input[type="password"]') && !loggedIn)
  return {
    url: doc.location?.href ?? '',
    loggedIn,
    loginPage,
    links: anchors
      .slice(0, 400)
      .map((a) => ({ text: text(a).slice(0, 120), title: (a.title || '').slice(0, 160), href: a.href })),
    tables: extract(doc),
  }
}

/**
 * The most promising link on the way to the results list (QIS: "Notenspiegel" / "Leistungen
 * anzeigen", then in the degree tree "Leistungen für … anzeigen"). Null if nothing fits.
 */
export function pickResultsLink(links: PageLink[], visited: Set<string>): PageLink | null {
  const score = (l: PageLink) => {
    const s = `${l.text} ${l.title}`.toLowerCase()
    if (visited.has(l.href) || !/^https?:/i.test(l.href) || /abmelden|logout|drucken|pdf|hilfe/.test(s))
      return 0
    let points = 0
    if (/notenspiegel/.test(s) || /notenspiegel/i.test(l.href)) points += 5
    if (/leistungen.*anzeigen|leistungsübersicht|prüfungsergebnisse|meine leistungen|alle leistungen/.test(s))
      points += 6
    if (/anzeigen/.test(s) && /leistung|note|abschluss|prüfung/.test(s)) points += 3
    if (/list\.vm|state=notenspiegel/i.test(l.href)) points += 2
    if (/info über angemeldete|anmeldung|abmeldung|bescheinigung/.test(s)) points -= 4
    return points
  }
  let best: PageLink | null = null
  let bestScore = 2
  for (const l of links) {
    const sc = score(l)
    if (sc > bestScore) {
      best = l
      bestScore = sc
    }
  }
  return best
}

/** QIS URLs carry the session ("asi=…"): put the current session into a remembered results URL. */
export function withSessionAsi(remembered: string, current: string): string | null {
  try {
    const asi = new URL(current).searchParams.get('asi')
    if (!asi) return null
    const url = new URL(remembered)
    if (!url.searchParams.has('asi')) return null
    url.searchParams.set('asi', asi)
    return url.toString()
  } catch {
    return null
  }
}
