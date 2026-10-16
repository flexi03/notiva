import { DAYS } from './schedule'

/**
 * Lab sessions of a module: for every sheet (P01, P02 …) a lab date and a preparation before it –
 * suggested from the timetable ("Praktikum Do 09:00") and the sheets in the module's materials.
 */
export const LAB_DATE = 'Praktikumstermin'
export const LAB_PREP = 'Vorbereitung'
export const REMINDERS = [
  'Keine',
  '1 Std. vorher',
  '2 Std. vorher',
  '1 Tag vorher',
  '2 Tage vorher',
  '1 Woche vorher',
] as const
export type Reminder = (typeof REMINDERS)[number]

/** "1 Tag vorher" → hours before the due date (null: none; unknown text: the default day). */
export function reminderHours(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return 24
  if (/^keine|^none/i.test(value)) return null
  const m = /(\d+)\s*(std|h|stunde|tag|day|woche|week)/i.exec(value)
  if (!m) return 24
  const n = Number(m[1])
  return /^(std|h|stunde)/i.test(m[2]!) ? n : /^(tag|day)/i.test(m[2]!) ? n * 24 : n * 24 * 7
}

export interface LabEntry {
  /** number of the sheet (1 = P01) */
  n: number
  kind: typeof LAB_DATE | typeof LAB_PREP
  title: string
  /** "2026-10-22T09:00" (lab) or "2026-10-21" (preparation) */
  due: string
  /** the sheet file, if found */
  sheet?: string
}

export interface LabPlanInput {
  module: string
  /** first lab day, "YYYY-MM-DD" */
  first: string
  start?: string
  everyWeeks: number
  count: number
  /** preparation this many days before (0: none) */
  prepDays: number
  firstNumber?: number
  sheets?: Record<number, string>
  /** preparation sheets ("… Vorbereitungsblatt.pdf") – linked from the preparation */
  prepSheets?: Record<number, string>
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function planLabs(input: LabPlanInput): LabEntry[] {
  const [y, m, d] = input.first.split('-').map(Number)
  if (!y || !m || !d) return []
  const out: LabEntry[] = []
  const from = input.firstNumber ?? 1
  for (let i = 0; i < Math.min(input.count, 30); i++) {
    const n = from + i
    const day = new Date(y, m - 1, d + i * 7 * Math.max(1, input.everyWeeks))
    const label = `P${pad(n)}`
    const sheet = input.sheets?.[n]
    out.push({
      n,
      kind: LAB_DATE,
      title: `${input.module} – ${label} ${LAB_DATE}`,
      due: input.start ? `${iso(day)}T${input.start}` : iso(day),
      ...(sheet ? { sheet } : {}),
    })
    if (input.prepDays > 0) {
      const prep = new Date(day)
      prep.setDate(day.getDate() - input.prepDays)
      out.push({
        n,
        kind: LAB_PREP,
        title: `${input.module} – ${label} ${LAB_PREP}`,
        due: iso(prep),
        ...((input.prepSheets?.[n] ?? sheet) ? { sheet: input.prepSheets?.[n] ?? sheet } : {}),
      })
    }
  }
  return out
}

/** Lab sheets by number: "DBS2_Praktikum_03.pdf", "P04 Aufgaben.pdf" – solutions and copies skipped. */
export function labSheets(paths: string[]): Record<number, string> {
  const out: Record<number, string> = {}
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    if (/l(ö|oe)sung|musterl|\.md$|\s\d\.\w+$/i.test(name)) continue
    const m = /(?:praktikum|(?:^|[\s_.-])P|labor)[\s_.-]*0?(\d{1,2})(?![\d])/i.exec(name)
    if (!m) continue
    const n = Number(m[1])
    if (!n) continue
    // The plainest name wins ("…_Praktikum_03.pdf" before "…_Praktikum_03_Datenbank.zip").
    if (!out[n] || name.length < out[n]!.slice(out[n]!.lastIndexOf('/') + 1).length) out[n] = path
  }
  return out
}

/** The next date (from `from`, today included) that falls on a weekday "Do". */
export function nextWeekday(day: string, from: Date): Date {
  const index = DAYS.indexOf(day as (typeof DAYS)[number])
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  if (index < 0) return d
  const today = (d.getDay() + 6) % 7
  d.setDate(d.getDate() + ((index - today + 7) % 7))
  return d
}

export { iso as isoDay }

/** Number of a lab file ("DBS2_Praktikum_03_Musterloesung.pdf" → 3), null if none. */
export function labFileNumber(path: string): number | null {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const m = /(?:praktikum|(?:^|[\s_.-])P|labor)[\s_.-]*0?(\d{1,2})(?![\d])/i.exec(name)
  return m && Number(m[1]) ? Number(m[1]) : null
}

/** All files of one lab session: sheet, preparation sheet, solutions, data – by kind. */
export function labFilesOf(
  paths: string[],
  n: number,
): Array<{ path: string; kind: 'prep' | 'solution' | 'sheet' | 'other' }> {
  return paths
    .filter((p) => !/\.md$/i.test(p) && labFileNumber(p) === n)
    .map((path) => {
      const name = path.slice(path.lastIndexOf('/') + 1)
      const kind = /vorbereit/i.test(name)
        ? ('prep' as const)
        : /l(ö|oe)sung|musterl/i.test(name)
          ? ('solution' as const)
          : /\.(pdf|docx?)$/i.test(name) && !/\s\d\.\w+$/.test(name)
            ? ('sheet' as const)
            : ('other' as const)
      return { path, kind }
    })
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.path.length - b.path.length)
}

/** Preparation sheets by number ("DBS2 - Praktikum 01 - Vorbereitungsblatt.pdf"). */
export function prepSheets(paths: string[]): Record<number, string> {
  const out: Record<number, string> = {}
  for (const path of paths) {
    const name = path.slice(path.lastIndexOf('/') + 1)
    if (!/vorbereit/i.test(name) || /\.md$/i.test(name)) continue
    const n = labFileNumber(path)
    if (n && (!out[n] || name.length < out[n]!.length)) out[n] = path
  }
  return out
}
