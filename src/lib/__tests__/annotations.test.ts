import { parseMarkdown, serializeMarkdown } from '../frontmatter'
import {
  mergeRects,
  notedPages,
  notesPathFor,
  pageNote,
  parseAnnotations,
  serializeAnnotations,
  setPageNote,
  type Annotation,
} from '../annotations'

describe('annotations', () => {
  it('lives next to the PDF', () => {
    expect(notesPathFor('Studium/Unterlagen/LA/vl01.pdf')).toBe('Studium/Unterlagen/LA/vl01 (Notizen).md')
  })

  it('round-trips through the frontmatter', () => {
    const list: Annotation[] = [
      {
        id: 'a1',
        type: 'highlight',
        page: 2,
        rects: [[10, 20, 100.04, 12]],
        color: 'green',
        text: 'Laufzeit O(n)',
        comment: 'Klausur!',
      },
      { id: 'a2', type: 'note', page: 1, x: 300, y: 40, text: 'Nachfragen', color: 'yellow' },
      {
        id: 'a3',
        type: 'ink',
        page: 3,
        color: 'red',
        width: 2,
        points: [
          [1, 2],
          [3.333, 4],
        ],
      },
    ]
    const file = serializeMarkdown({
      data: { pdf: 'vl01.pdf', annotations: serializeAnnotations(list) },
      body: '',
    })
    const back = parseAnnotations(parseMarkdown(file).data.annotations)
    expect(back).toEqual([
      { ...list[0], rects: [[10, 20, 100, 12]] },
      list[1],
      {
        ...list[2],
        points: [
          [1, 2],
          [3.3, 4],
        ],
      },
    ])
  })

  it('skips broken entries', () => {
    expect(
      parseAnnotations([
        { id: 'x', type: 'highlight', page: 1, rects: [[1, 2, 3]] },
        { id: 'y', type: 'ink', page: 1, points: 'kaputt' },
        { type: 'note', page: 1, x: 1, y: 1 },
        { id: 'z', type: 'note', page: 0, x: 1, y: 1 },
        { id: 'ok', type: 'note', page: 1, x: 1, y: 1, text: 'hi', color: 'evil' },
      ]),
    ).toEqual([{ id: 'ok', type: 'note', page: 1, x: 1, y: 1, text: 'hi', color: 'yellow' }])
  })

  it('merges selection rectangles per line', () => {
    expect(
      mergeRects([
        [10, 100, 30, 12],
        [42, 100.5, 20, 12],
        [10, 120, 50, 12],
        [0, 0, 0.1, 0.1],
      ]),
    ).toEqual([
      [10, 100, 52, 12.5],
      [10, 120, 50, 12],
    ])
  })
})

describe('page notes', () => {
  it('keeps notes per page in sorted sections', () => {
    let body = 'Allgemeines zur Vorlesung\n'
    body = setPageNote(body, 5, 'Beweis nochmal ansehen')
    body = setPageNote(body, 2, '- Definition Graph\n- Beispiel')
    expect(body).toBe(
      'Allgemeines zur Vorlesung\n\n## Seite 2\n\n- Definition Graph\n- Beispiel\n\n## Seite 5\n\nBeweis nochmal ansehen\n',
    )
    expect(pageNote(body, 2)).toBe('- Definition Graph\n- Beispiel')
    expect(notedPages(body)).toEqual([2, 5])
    expect(setPageNote(body, 5, '')).not.toContain('Seite 5')
  })
})
