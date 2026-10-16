import { MATERIAL_CATEGORIES, materialCategory, type MoodleMaterial } from './moodle'

/**
 * "Unterlagen neu einlesen": what differs between Moodle and the vault – files in the wrong folder,
 * files that are missing and files Moodle has a newer version of. Nothing happens without asking.
 */
export interface SavedMaterial {
  path: string
  modified?: string
}

export interface ReindexPlan {
  /** saved, but not where the module/category says (e.g. after a module was linked) */
  moves: Array<{ id: string; from: string; to: string }>
  /** in Moodle, not (or no longer) in the vault */
  missing: MoodleMaterial[]
  /** Moodle has a newer version – downloaded next to the current one, the user decides */
  updated: Array<{ material: MoodleMaterial; path: string }>
}

const MAX_SIZE = 100_000_000
const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)

export function planReindex(
  materials: MoodleMaterial[],
  saved: Record<string, SavedMaterial>,
  /** course id → folder of its module ("Studium/Unterlagen/DBS 2") */
  folderOf: (courseId: string) => string,
  exists: (path: string) => boolean,
): ReindexPlan {
  const plan: ReindexPlan = { moves: [], missing: [], updated: [] }
  for (const m of materials) {
    if (m.kind !== 'file' || !m.filename || (m.size ?? 0) > MAX_SIZE) continue
    const entry = saved[m.id]
    if (!entry || !exists(entry.path)) {
      plan.missing.push(m)
      continue
    }
    const to = `${folderOf(m.courseId)}/${materialCategory(m)}/${fileName(entry.path)}`
    if (to !== entry.path) plan.moves.push({ id: m.id, from: entry.path, to })
    if (m.modified && entry.modified && m.modified > entry.modified)
      plan.updated.push({ material: m, path: to !== entry.path ? to : entry.path })
  }
  return plan
}

/** "Skript.pdf" → "Skript (neu 2026-10-16).pdf" – the newer version next to the current one. */
export function versionName(name: string, date: Date): string {
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const dot = name.lastIndexOf('.')
  return dot > 0 ? `${name.slice(0, dot)} (neu ${day})${name.slice(dot)}` : `${name} (neu ${day})`
}

export type PageChange =
  | { kind: 'same'; page: number; old: number }
  | { kind: 'changed'; page: number; old: number; similarity: number }
  | { kind: 'new'; page: number }

export interface PdfComparison {
  /** one entry per page of the new version */
  pages: PageChange[]
  /** pages of the old version that are not in the new one */
  removed: number[]
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((w) => w.length > 1)

function similarity(a: string[], b: string[]): number {
  if (!a.length && !b.length) return 1
  const setA = new Set(a)
  const setB = new Set(b)
  let common = 0
  for (const w of setA) if (setB.has(w)) common++
  return common / (setA.size + setB.size - common)
}

/**
 * Compares two versions page by page (by their text, like a diff): the same page, a changed page
 * (most words alike) or a new one. Pages are matched in order, so moved slides are found too.
 */
export function comparePdfText(oldPages: string[], newPages: string[]): PdfComparison {
  const oldWords = oldPages.map(words)
  const oldNorm = oldWords.map((w) => w.join(' '))
  const used = new Set<number>()
  const pages: PageChange[] = []
  let cursor = 0
  for (const [i, text] of newPages.entries()) {
    const w = words(text)
    const norm = w.join(' ')
    // Exact match: first after the last matched page, then anywhere.
    const exact = [...oldNorm.keys()]
      .filter((j) => !used.has(j) && oldNorm[j] === norm)
      .sort((a, b) => (a >= cursor ? 0 : 1) - (b >= cursor ? 0 : 1) || a - b)[0]
    if (exact !== undefined) {
      used.add(exact)
      cursor = exact + 1
      pages.push({ kind: 'same', page: i + 1, old: exact + 1 })
      continue
    }
    let best = -1
    let score = 0
    for (const [j, ow] of oldWords.entries()) {
      if (used.has(j)) continue
      // Nearby pages win a tie – slides rarely jump far.
      const s = similarity(w, ow) - Math.abs(j - cursor) * 0.001
      if (s > score) {
        score = s
        best = j
      }
    }
    if (best >= 0 && score >= 0.4) {
      used.add(best)
      cursor = best + 1
      pages.push({ kind: 'changed', page: i + 1, old: best + 1, similarity: Math.round(score * 100) / 100 })
    } else pages.push({ kind: 'new', page: i + 1 })
  }
  const removed = oldPages.map((_, j) => j + 1).filter((n) => !used.has(n - 1))
  return { pages, removed }
}

/**
 * Files that lie directly in a module's folder ("Unterlagen/DBS 2/DBS2-3_SQL.pdf", e.g. from an
 * older version) → into Vorlesung / Praktikum & Übung / Sonstiges by their name (and the Moodle
 * section, when known). Notes pages ("… (Notizen).md") move with their file.
 */
export function planSort(
  paths: string[],
  /** "Studium/Unterlagen" */
  base: string,
  sectionOf: (path: string) => string | undefined = () => undefined,
): Array<{ from: string; to: string }> {
  const categories = new Set<string>(MATERIAL_CATEGORIES)
  const moves: Array<{ from: string; to: string }> = []
  for (const path of paths) {
    if (!path.startsWith(`${base}/`) || /\.md$/i.test(path)) continue
    const parts = path.slice(base.length + 1).split('/')
    // <Modul>/<Datei> or Orga/<Kurs>/<Datei>
    const depth = parts[0] === 'Orga' ? 3 : 2
    if (parts.length !== depth || parts[0] === 'Prüfungsplan') continue
    const parent = parts[depth - 2]!
    if (categories.has(parent)) continue
    const filename = parts[depth - 1]!
    const section = sectionOf(path)
    const category = materialCategory({ filename, title: filename, section: section ?? '' })
    moves.push({ from: path, to: `${base}/${parts.slice(0, depth - 1).join('/')}/${category}/${filename}` })
  }
  return moves
}
