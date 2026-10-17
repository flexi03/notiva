import { PdfSearch } from '../pdfSearch'

const entry = (path: string, pages: string[]) => ({ path, size: 1, mtime: 1, pages })

describe('PdfSearch', () => {
  it('finds the page with the word and a snippet around it', () => {
    const s = new PdfSearch([
      entry('Unterlagen/DBS 2/Vorlesung/DBS2-03.pdf', [
        'Einführung',
        'Die dritte Normalform verhindert Anomalien',
      ]),
      entry('Unterlagen/LA/Blatt 1.pdf', ['Matrizen und Vektoren']),
    ])
    const [hit] = s.search('Normalform')
    expect(hit).toMatchObject({ path: 'Unterlagen/DBS 2/Vorlesung/DBS2-03.pdf', page: 2 })
    expect(hit!.snippet).toContain('Normalform')
  })

  it('all words must match; prefixes count', () => {
    const s = new PdfSearch([entry('a.pdf', ['dritte Normalform', 'zweite Normalform'])])
    expect(s.search('dritte Norm').map((h) => h.page)).toEqual([1])
  })

  it('replaces a PDF read again and forgets removed ones', () => {
    const s = new PdfSearch([entry('a.pdf', ['alt'])])
    s.add(entry('a.pdf', ['neu']))
    expect(s.search('alt')).toEqual([])
    expect(s.search('neu')).toHaveLength(1)
    s.remove('a.pdf')
    expect(s.size).toBe(0)
  })
})
