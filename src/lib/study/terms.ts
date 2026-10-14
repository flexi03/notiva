/**
 * Semesters ("WiSe 26/27", "SoSe 27"): reading the many spellings universities and Moodle use,
 * labels, arithmetic and which semester a date belongs to. Pure, no time zone tricks: a winter
 * semester runs September–February, a summer semester March–August (lectures and exam phase).
 */

export interface Term {
  season: 'WiSe' | 'SoSe'
  /** Calendar year the semester starts in (WiSe 24/25 → 2024, SoSe 25 → 2025). */
  year: number
}

const twoDigits = (n: number) => String(n % 100).padStart(2, '0')
const fullYear = (y: number) => (y < 100 ? 2000 + y : y)

export function termLabel(term: Term): string {
  return term.season === 'WiSe'
    ? `WiSe ${twoDigits(term.year)}/${twoDigits(term.year + 1)}`
    : `SoSe ${twoDigits(term.year)}`
}

/**
 * Finds a semester in free text: "WiSe 24/25", "WS 2024/2025", "Wintersemester 2024/25",
 * "SoSe 25", "SS 2025", "Sommersemester 2025", "SoSe2025", "(S26)", "W25". Null if none.
 */
export function parseTerm(text: string | undefined | null): Term | null {
  if (!text) return null
  const s = text.replace(/\s+/g, ' ')
  const winter =
    /\b(?:wi(?:nter)?-?se(?:m(?:ester)?)?|ws|w)\.? ?(\d{2}|\d{4})(?: ?[/-] ?(\d{2}|\d{4}))?\b/i.exec(s)
  const summer = /\b(?:so(?:mmer)?-?se(?:m(?:ester)?)?|ss|s)\.? ?(\d{2}|\d{4})\b/i.exec(s)
  const pick = [
    winter && { m: winter, season: 'WiSe' as const },
    summer && { m: summer, season: 'SoSe' as const },
  ]
    .filter((x): x is NonNullable<typeof x> => !!x)
    .sort((a, b) => a.m.index - b.m.index)[0]
  if (!pick) return null
  const year = fullYear(Number(pick.m[1]))
  if (year < 1990 || year > 2100) return null
  // "WS 25" alone means WiSe 25/26.
  return { season: pick.season, year }
}

/** The semester a day belongs to. */
export function termOf(date: Date): Term {
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  if (month >= 3 && month <= 8) return { season: 'SoSe', year }
  return { season: 'WiSe', year: month >= 9 ? year : year - 1 }
}

/** Counting index: consecutive semesters differ by one. */
export function termIndex(term: Term): number {
  return term.year * 2 + (term.season === 'WiSe' ? 1 : 0)
}

export function termFromIndex(index: number): Term {
  return index % 2 === 1 ? { season: 'WiSe', year: (index - 1) / 2 } : { season: 'SoSe', year: index / 2 }
}

export function addTerms(term: Term, n: number): Term {
  return termFromIndex(termIndex(term) + n)
}

export const sameTerm = (a: Term | null | undefined, b: Term | null | undefined) =>
  !!a && !!b && termIndex(a) === termIndex(b)

/** Semester of study ("Fachsemester") of a term, counted from the first one (1, 2, …). */
export function studySemester(start: Term, term: Term): number {
  return termIndex(term) - termIndex(start) + 1
}

/** First and last day of a semester (lecture time and exams). */
export function termRange(term: Term): { start: string; end: string } {
  return term.season === 'WiSe'
    ? { start: `${term.year}-09-01`, end: `${term.year + 1}-02-${(term.year + 1) % 4 === 0 ? 29 : 28}` }
    : { start: `${term.year}-03-01`, end: `${term.year}-08-31` }
}

/** "@semester", "@nextSemester", "@lastSemester" in filters → label of that semester. */
export function resolveTermPlaceholder(value: string, now: Date): string | null {
  const m = /^@(last|prev|next)?semester$/i.exec(value.trim())
  if (!m) return null
  const shift = !m[1] ? 0 : m[1].toLowerCase() === 'next' ? 1 : -1
  return termLabel(addTerms(termOf(now), shift))
}
