import { fileKey, matchExisting } from '../materialMatch'

const files = [
  { path: 'Studium/Unterlagen/DBS 2/Vorlesung/DBS2 - Vorlesung 00.pdf', size: 100 },
  { path: 'Studium/Unterlagen/DBS 2/Archiv/WiSe 25-26/Vorlesung/DBS2 - Vorlesung 00.pdf', size: 90 },
  { path: 'Studium/Unterlagen/SE/Vorlesung/Einführung.pdf', size: 50 },
  { path: 'Studium/Unterlagen/SE/Vorlesung/Einführung (neu 2026-10-16).pdf', size: 55 },
]

describe('matchExisting', () => {
  it('same name and size → the same file, preferring the module folder', () => {
    const m = { id: 'file:1', filename: 'DBS2 - Vorlesung 00.pdf', size: 90 }
    expect(matchExisting([m], files, () => 'Studium/Unterlagen/DBS 2')).toEqual([
      {
        id: 'file:1',
        path: 'Studium/Unterlagen/DBS 2/Archiv/WiSe 25-26/Vorlesung/DBS2 - Vorlesung 00.pdf',
        kind: 'same',
      },
    ])
  })

  it('compares names case- and Unicode-insensitively (macOS decomposed umlauts)', () => {
    const m = { id: 'file:2', filename: 'EINFÜHRUNG.pdf', size: 50 }
    expect(matchExisting([m], files)).toEqual([
      { id: 'file:2', path: 'Studium/Unterlagen/SE/Vorlesung/Einführung.pdf', kind: 'same' },
    ])
    expect(fileKey('Ordner/U\u0308bung.PDF')).toBe('übung.pdf')
  })

  it('another size and only one file of that name → a newer version; pending versions never count', () => {
    const m = { id: 'file:3', filename: 'Einführung.pdf', size: 70 }
    expect(matchExisting([m], files)).toEqual([
      { id: 'file:3', path: 'Studium/Unterlagen/SE/Vorlesung/Einführung.pdf', kind: 'version' },
    ])
  })

  it('another size and several files of that name → no guess; unknown names → nothing', () => {
    expect(matchExisting([{ id: 'x', filename: 'DBS2 - Vorlesung 00.pdf', size: 1 }], files)).toEqual([])
    expect(matchExisting([{ id: 'y', filename: 'neu.pdf', size: 1 }], files)).toEqual([])
  })
})
