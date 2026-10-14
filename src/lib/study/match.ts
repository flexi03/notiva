/**
 * Which module is meant? Moodle courses, eCampus exams and exam plan rows name modules in many ways
 * ("BMI 07: OOP2 SoSe 2025 - Für Wiederholer nach PO 2018 !", "Software-Engineering",
 * "BMI 13: SE - WiSe 2024/2025"). Course codes differ between POs (Moodle courses are shared), so
 * the name decides and a code only confirms it.
 */
import type { CatalogModule, StudyProgram } from './catalog'

const STOP = new Set([
  'und',
  'der',
  'die',
  'das',
  'in',
  'im',
  'fur',
  'mit',
  'von',
  'zu',
  'zur',
  'an',
  'the',
  'of',
  'and',
  'wahlmodul',
  'wahlmodule',
  'nach',
  'po',
  'fuer',
  'wiederholer',
  'grundlagen',
  'einfuhrung',
])

/** Lowercase words without umlauts, codes, semesters and brackets. */
export function nameTokens(text: string): string[] {
  const cleaned = text
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    // semesters and years
    .replace(
      /\b(wi(nter)?-?se(m(ester)?)?|ws|so(mmer)?-?se(m(ester)?)?|ss)\s*\d{2,4}(\s*[/-]\s*\d{2,4})?\b/g,
      ' ',
    )
    .replace(/\((s|w)\d{2}\)/g, ' ')
    .replace(/\b20\d{2}\b/g, ' ')
    // module codes such as "BMI 07", "BMT 11", "BMI40", "D1.4" (not "OOP2", "IP 1")
    .replace(/\b[a-z]{2,4} ?\d{2}(\.\d+)?\b/g, ' ')
    .replace(/\b[a-z]\d\.\d+\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
  // "objektorientierte programmierung 2" and "programmierung2"
  return cleaned
    .replace(/([a-z])(\d)\b/g, '$1 $2')
    .split(' ')
    .filter((w) => w && !STOP.has(w))
}

/** Module codes in a name ("BMI 07", "BMI07") as numbers, e.g. [7]. */
export function moduleCodes(text: string, code: string): number[] {
  const re = new RegExp(`\\b${code}\\s?(\\d{1,3})\\b`, 'gi')
  return [...text.matchAll(re)].map((m) => Number(m[1]))
}

/**
 * 0…1: how well a name fits. Numbers must agree ("Mathematik 1" ≠ "Mathematik 2"), short forms
 * count fully ("OOP2" → "objektorientierte programmierung 2").
 */
export function nameScore(text: string, candidate: string): number {
  const a = nameTokens(text)
  const b = nameTokens(candidate)
  if (!a.length || !b.length) return 0
  const numbersA = a.filter((w) => /^\d+$/.test(w))
  const numbersB = b.filter((w) => /^\d+$/.test(w))
  if (numbersB.length && !numbersB.every((n) => numbersA.includes(n))) return 0
  if (numbersA.length && numbersB.length === 0 && b.length <= 2) return 0
  const words = (l: string[]) => l.filter((w) => !/^\d+$/.test(w))
  const wa = new Set(words(a))
  const wb = words(b)
  if (!wb.length) return numbersB.length ? 0.5 : 0
  // Prefix match for compound words: "computergrafik" ~ "computergrafik", "bild" ~ "bildverarbeitung".
  const hit = (w: string) =>
    wa.has(w) || [...wa].some((x) => x.length >= 5 && w.length >= 5 && (x.startsWith(w) || w.startsWith(x)))
  const found = wb.filter(hit).length
  return found / wb.length
}

export interface ModuleMatch {
  module: CatalogModule
  score: number
  /** The course code in the name pointed to this module. */
  byCode: boolean
}

/** Best module of the program for a name (null below the threshold). */
export function matchModuleName(text: string, program: StudyProgram, threshold = 0.75): ModuleMatch | null {
  let best: ModuleMatch | null = null
  const codes = moduleCodes(text, program.code)
  for (const module of program.modules) {
    const score = Math.max(
      nameScore(text, module.name),
      ...(module.aliases ?? []).map((a) => nameScore(text, a)),
    )
    const byCode = codes.includes(Number(module.nr.replace(/\D/g, '')))
    // The code alone is not enough (other POs number differently) – it lowers the bar a little.
    const effective = byCode && score >= 0.5 ? Math.max(score, threshold) + 0.01 : score
    if (effective >= threshold && (!best || effective > best.score))
      best = { module, score: effective, byCode }
  }
  return best
}

/** Module for an eCampus exam: by exam number, else by name. */
export function matchExam(
  exam: { number?: string; title: string },
  program: StudyProgram,
): CatalogModule | null {
  if (exam.number) {
    const n = Number(exam.number)
    const byNumber = program.modules.find((m) => {
      const e = Number(m.examNumber)
      return m.examNumber && (e === n || (n > e && n < e + 10))
    })
    // The number decides when the names don't contradict (some exams are titled after a project).
    if (byNumber && (nameScore(exam.title, byNumber.name) > 0 || /projekt/i.test(byNumber.name)))
      return byNumber
  }
  return matchModuleName(exam.title, program)?.module ?? null
}

/** Moodle courses that are about the degree as a whole, not about one module. */
export function isOrgaCourse(name: string): boolean {
  return /informationen für studierende|studieninformation|fachschaft|study-?dashboard|sendezentrum|erstsemester|orientierung|prüfungsamt|studienbüro|praxissemester-?info/i.test(
    name,
  )
}

/**
 * Words two long titles share ("Projekt – Vorlesungstool als VSCode-Plugin" and "Informatikprojekt 2
 * – Konzeption eines Vorlesungstools …"): for courses named after a project.
 */
export function sharedWords(a: string, b: string): number {
  const long = (s: string) => new Set(nameTokens(s).filter((w) => w.length >= 6 && !/^\d+$/.test(w)))
  const wa = long(a)
  const wb = [...long(b)]
  return wb.filter((w) => wa.has(w) || [...wa].some((x) => x.startsWith(w) || w.startsWith(x))).length
}
