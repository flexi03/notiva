/**
 * Exam preparation per module: old/practice exams and exercise sheets among the module's files,
 * each with its solution ("…_Loesung", "Musterlösung") when there is one, plus exam hints. Pure –
 * recognised by the file name only.
 */

export interface PrepItem {
  path: string
  /** the matching solution, if found */
  solution?: string
}

export interface ExamPrep {
  /** old, practice and sample exams, exam exercises */
  exams: PrepItem[]
  /** exercise sheets ("Übung 3", "Blatt 04", "Aufgabe …") */
  sheets: PrepItem[]
  /** notes about the exam ("Klausurhinweise") */
  hints: string[]
}

const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const DOCUMENT = /\.(pdf|docx?|odt|pptx?)$/i
const SOLUTION = /(muster)?l(ö|oe)sung(en)?|solution/i
const HINT = /(klausur|prüfungs?|pruefungs?)hinweis|exam[\s_-]?info/i
const EXAM = /klausur|exam|prüfung|pruefung/i
const SHEET = /übung|uebung|blatt|exercise|aufgabe|tutorium|sheet/i
/** Notes of a tutorial or a lab sheet are not exercises of their own. */
const NOT_SHEET = /mitschrift|vorbereitungsblatt|praktikum|prüfungsordnung|modulhandbuch/i

/** The name without solution words and separators – a sheet and its solution share it. */
export const pairKey = (path: string) =>
  name(path)
    .replace(/\.[^.]+$/, '')
    .normalize('NFC')
    .toLowerCase()
    .replace(SOLUTION, '')
    .replace(/\b(mit|zur|zu|der|des|studierende)\b/g, '')
    .replace(/[^a-z0-9äöüß]+/g, '')

export function examPrep(paths: string[]): ExamPrep {
  const docs = paths.filter((p) => DOCUMENT.test(name(p)))
  const solutions = new Map<string, string>()
  for (const p of docs) if (SOLUTION.test(name(p))) solutions.set(pairKey(p), p)
  const out: ExamPrep = { exams: [], sheets: [], hints: [] }
  for (const path of docs) {
    const n = name(path)
    if (SOLUTION.test(n)) continue
    const item: PrepItem = solutions.has(pairKey(path))
      ? { path, solution: solutions.get(pairKey(path))! }
      : { path }
    if (HINT.test(n)) out.hints.push(path)
    else if (EXAM.test(n) && !/prüfungsordnung/i.test(n)) out.exams.push(item)
    else if (SHEET.test(n) && !NOT_SHEET.test(n)) out.sheets.push(item)
  }
  const byName = (a: PrepItem, b: PrepItem) =>
    name(a.path).localeCompare(name(b.path), 'de', { numeric: true })
  out.exams.sort(byName)
  out.sheets.sort(byName)
  return out
}
