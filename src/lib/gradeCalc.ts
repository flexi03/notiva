/**
 * Grade calculator (German scale: 1,0 best, 4,0 the last passing grade): the average weighted by
 * ECTS with grades you expect, and the grade you need on average in the open modules to reach a
 * target. Pure logic – the same weighting as the dashboard tile (database `weightedAvg`).
 */
import { aggregate } from './database'

export interface GradeItem {
  ects: number
  /** null: no grade (yet) – does not count */
  grade: number | null
}

export const BEST_GRADE = 1
export const PASS_GRADE = 4

/** Average weighted by ECTS of the items with a grade (null when none). */
export function weightedGrade(items: GradeItem[]): number | null {
  const value = aggregate(
    items.filter((i) => i.grade !== null).map((i) => ({ Note: i.grade, ECTS: i.ects })),
    'weightedAvg',
    'Note',
    'ECTS',
  )
  return typeof value === 'number' ? value : null
}

export type Needed =
  /** this average in the open modules reaches the target */
  | { state: 'reachable'; grade: number }
  /** even all 1,0 is not enough */
  | { state: 'unreachable' }
  /** any passing grade reaches it */
  | { state: 'safe' }

/** What the open modules (`openEcts`) need on average so that everything ends at `target`. */
export function neededGrade(done: GradeItem[], openEcts: number, target: number): Needed | null {
  const graded = done.filter((i) => i.grade !== null && i.ects > 0)
  if (openEcts <= 0) return null
  const ects = graded.reduce((s, i) => s + i.ects, 0)
  const sum = graded.reduce((s, i) => s + i.ects * i.grade!, 0)
  const grade = (target * (ects + openEcts) - sum) / openEcts
  if (grade < BEST_GRADE) return { state: 'unreachable' }
  if (grade >= PASS_GRADE) return { state: 'safe' }
  return { state: 'reachable', grade: Math.floor(grade * 100) / 100 }
}

/** "2,3" or 2.3 → 2.3; anything else (BE, empty) → null. */
export function parseGrade(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(n) && n >= BEST_GRADE && n <= 5 && String(value ?? '').trim() !== '' ? n : null
}
