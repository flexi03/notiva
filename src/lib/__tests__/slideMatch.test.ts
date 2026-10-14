import { buildSlideIndex, followSlide, similarities, terms } from '../lecture/slideMatch'

const SLIDES = [
  'Vorlesung 3: Graphen. Definition: Ein Graph G = (V, E) besteht aus Knoten V und Kanten E. Beispiel: Wegesuche mit Dijkstra',
  'Breitensuche (BFS). Idee: Ebene für Ebene. Laufzeit O(|V| + |E|). Anwendung: kürzeste Wege ungewichtet. Warteschlange Queue',
  'Tiefensuche (DFS). Rekursiv oder mit Stack. Topologische Sortierung. Klausurrelevant!',
  'Zusammenfassung und Ausblick: Spannbäume nächste Woche',
]

describe('slide matching', () => {
  it('reduces words to comparable stems', () => {
    expect(terms('Die Knoten und Kanten eines Graphen')).toEqual(['knot', 'kant', 'graph'])
  })

  it('finds the slide the lecturer talks about', () => {
    const index = buildSlideIndex(SLIDES)
    const scores = similarities(
      index,
      'Bei der Tiefensuche gehen wir rekursiv vor, alternativ mit einem Stack',
    )
    expect(scores.indexOf(Math.max(...scores))).toBe(2)
  })

  it('moves forward readily but needs confirmation to jump back', () => {
    const index = buildSlideIndex(SLIDES)
    let state = { page: 1, candidate: null as number | null }
    state = followSlide(
      index,
      'Bei der Breitensuche gehen wir Ebene für Ebene vor mit einer Warteschlange',
      state,
    )
    expect(state.page).toBe(2)
    // One sentence about graphs in general: no jump back yet …
    state = followSlide(index, 'Erinnern Sie sich an die Definition vom Graphen mit Knoten und Kanten', state)
    expect(state.page).toBe(2)
    // … but if it continues, we follow.
    state = followSlide(index, 'Also nochmal: ein Graph besteht aus Knoten und Kanten, siehe Dijkstra', state)
    expect(state.page).toBe(1)
  })

  it('stays put on small talk', () => {
    const index = buildSlideIndex(SLIDES)
    expect(
      followSlide(index, 'Guten Morgen, können Sie mich hinten verstehen?', { page: 3, candidate: null })
        .page,
    ).toBe(3)
  })
})
