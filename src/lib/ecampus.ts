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
  rows: string[][]
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
    const headers = Array.from(headerRow.querySelectorAll('th,td')).map((c) => clean(c.textContent))
    if (!headers.some((h) => /^note\b|^grade/i.test(h))) continue
    const body = rows
      .filter((r) => r !== headerRow && !r.querySelector('th'))
      .map((r) => Array.from(r.querySelectorAll('td')).map((c) => clean(c.textContent)))
      .filter((cells) => cells.some(Boolean))
    out.push({ url: doc.location?.href ?? '', headers, rows: body })
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
}

export interface ExamSnapshot {
  site: string
  fetchedAt: string
  records: ExamRecord[]
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

/** The rows of all result tables as records; heading rows (one cell / no status) set the group. */
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
    for (const cells of table.rows) {
      const get = (key: string) => (index[key] !== undefined ? (cells[index[key]!] ?? '').trim() : '')
      // Group/"Konto" rows span the table: fewer cells than headers.
      if (cells.length < Math.min(table.headers.length, 3)) {
        group = cells.find(Boolean)
        continue
      }
      const title = get('title')
      if (!title) continue
      const gradeText = get('grade')
      const grade = number(gradeText)
      const statusText = get('status')
      const status = normalizeStatus(statusText || (/^(be|nb|an)$/i.test(gradeText) ? gradeText : ''), grade)
      const num = get('number') || undefined
      const attempt = number(get('attempt'))
      const semester = get('semester') || undefined
      let id = `${num ?? title}#${attempt ?? semester ?? ''}`
      while (seen.has(id)) id += '+'
      seen.add(id)
      const credits = number(get('credits'))
      const date = isoDate(get('date'))
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
      })
    }
  }
  return records
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
    if (r.status === 'other' || r.status === 'registered') continue
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
  for (const r of finalResults(records)) {
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
