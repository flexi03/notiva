/**
 * Which slide is the lecturer talking about? Each page's text and the latest transcript become
 * TF-IDF vectors over simple word stems; the best cosine match wins – with a gentle preference for
 * the current page and the next ones (lectures mostly move forward) and hysteresis, so a single
 * off-topic sentence doesn't make the view jump.
 */

const STOPWORDS = new Set(
  (
    'der die das den dem des ein eine einer eines einem einen und oder aber nicht ist sind war waren wird werden ' +
    'hat haben hatte mit von zu zum zur im in an auf aus bei für fuer über ueber unter vor nach als wie so auch ' +
    'noch nur schon dann wenn weil dass daß es er sie wir ihr ich du man sich mal ja nein also jetzt hier da ' +
    'dieser diese dieses diesen kann können koennen muss müssen soll sollen gibt geht sehr mehr viel gut ' +
    'the a an and or but not is are was were be been have has had with of to in on at for from by as this that ' +
    'these those it we you they i can will would should there here so then than very okay ok äh ähm also'
  ).split(/\s+/),
)

/** Lowercase word stems (crude German/English suffix stripping is enough for matching). */
export function terms(text: string): string[] {
  return (
    text
      .toLowerCase()
      .normalize('NFC')
      .match(/[\p{L}\p{N}]{2,}/gu) ?? []
  )
    .filter((w) => !STOPWORDS.has(w))
    .map((w) =>
      /^\d+$/.test(w)
        ? w
        : w
            .replace(/(ungen|ung|heiten|heit|keiten|keit|ern|en|er|es|e|s|n)$/u, '')
            .replace(/(ing|ed|ly|ies)$/u, ''),
    )
    .filter((w) => w.length >= 2)
}

export interface SlideIndex {
  /** One sparse vector per page (term → weight), normalized. */
  vectors: Array<Map<string, number>>
  idf: Map<string, number>
}

export function buildSlideIndex(pages: string[]): SlideIndex {
  const counts = pages.map((p) => {
    const m = new Map<string, number>()
    for (const t of terms(p)) m.set(t, (m.get(t) ?? 0) + 1)
    return m
  })
  const df = new Map<string, number>()
  for (const m of counts) for (const t of m.keys()) df.set(t, (df.get(t) ?? 0) + 1)
  const idf = new Map<string, number>()
  for (const [t, n] of df) idf.set(t, Math.log(1 + pages.length / n))
  const vectors = counts.map((m) =>
    normalize(new Map([...m].map(([t, c]) => [t, (1 + Math.log(c)) * idf.get(t)!]))),
  )
  return { vectors, idf }
}

function normalize(v: Map<string, number>): Map<string, number> {
  const len = Math.sqrt([...v.values()].reduce((s, x) => s + x * x, 0)) || 1
  return new Map([...v].map(([t, x]) => [t, x / len]))
}

/** Cosine similarity of a spoken text with every page (0…1). */
export function similarities(index: SlideIndex, spoken: string): number[] {
  const counts = new Map<string, number>()
  for (const t of terms(spoken)) if (index.idf.has(t)) counts.set(t, (counts.get(t) ?? 0) + 1)
  if (counts.size === 0) return index.vectors.map(() => 0)
  const query = normalize(new Map([...counts].map(([t, c]) => [t, (1 + Math.log(c)) * index.idf.get(t)!])))
  return index.vectors.map((v) => {
    let dot = 0
    for (const [t, x] of query) dot += x * (v.get(t) ?? 0)
    return dot
  })
}

export interface FollowState {
  page: number
  /** Candidate that has to win twice in a row before the page switches. */
  candidate: number | null
}

/**
 * Next page given the spoken text. Pages near the current one (current, next, next but one) get a
 * bonus; jumping elsewhere needs a clear lead and must repeat once.
 */
export function followSlide(
  index: SlideIndex,
  spoken: string,
  state: FollowState,
): FollowState & { score: number } {
  const scores = similarities(index, spoken)
  const weighted = scores.map((s, i) => {
    const page = i + 1
    const d = page - state.page
    const bonus = d === 0 ? 0.06 : d === 1 ? 0.04 : d === 2 ? 0.015 : 0
    // Far jumps are rare in a lecture: the further away, the less likely.
    const penalty = Math.abs(d) > 3 ? Math.min(0.1, (Math.abs(d) - 3) * 0.01) : 0
    return s + bonus - penalty
  })
  let best = 0
  for (let i = 1; i < weighted.length; i++) if (weighted[i]! > weighted[best]!) best = i
  const page = best + 1
  const score = scores[best] ?? 0
  if (score < 0.08 || page === state.page) return { page: state.page, candidate: null, score }
  const distance = page - state.page
  const lead = weighted[best]! - (weighted[state.page - 1] ?? 0)
  if (distance === 1 && lead > 0.03) return { page, candidate: null, score }
  // Back or further than three pages: clearly better and confirmed by the next part.
  const far = distance < 0 || distance > 3
  if (state.candidate === page && lead > (far ? 0.12 : 0.05) && (!far || score >= 0.2))
    return { page, candidate: null, score }
  return { page: state.page, candidate: page, score }
}
