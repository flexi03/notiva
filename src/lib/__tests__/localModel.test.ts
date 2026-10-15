import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/vault', () => ({ electronBridge: () => null }))
const { commitScope, commitType, describeChange, firstLine } = await import('@/app/localModel')

describe('local model helpers', () => {
  it('describes changes in words, not paths', () => {
    expect(
      describeChange({ path: 'Studium/Mitschriften/Graphen.md', status: 'M', added: 24, removed: 2 }),
    ).toBe('Seite „Graphen“ in „Studium / Mitschriften“ bearbeitet (+24 −2 Zeilen)')
    expect(describeChange({ path: 'Studium/Module/Datenbanken/Praktikum 3/abfragen.py', status: '?' })).toBe(
      'neue Datei „abfragen.py“ in „Datenbanken / Praktikum 3“',
    )
    expect(describeChange({ path: 'Alt.md', status: 'D' }, false)).toBe('page “Alt” deleted')
  })

  it('keeps one line of at most 72 characters', () => {
    expect(firstLine('- „Klausurplan aktualisiert“\nmehr')).toBe('Klausurplan aktualisiert')
    const long = firstLine(
      'Mitschrift zu Graphen ergänzt, Abfrage-Datei für Datenbanken erstellt, Schema-Datei für Datenbanken erstellt',
    )
    expect(long.length).toBeLessThanOrEqual(72)
    expect(long).toBe('Mitschrift zu Graphen ergänzt, Abfrage-Datei für Datenbanken erstellt')
  })

  it('picks a Conventional Commits type and the module as scope', () => {
    const notes = { path: 'Studium/Mitschriften/DBS2 – Normalformen.md', status: 'M', added: 18, removed: 2 }
    const lab = { path: 'Studium/Module/Datenbanksysteme 2/Praktikum 3/abfragen.sql', status: '?', added: 1 }
    expect(commitType([notes])).toBe('docs')
    expect(commitType([notes, lab])).toBe('feat')
    expect(
      commitType([
        { path: 'a.md', status: 'D' },
        { path: 'b.pdf', status: 'D' },
      ]),
    ).toBe('chore')
    expect(commitScope([notes])).toBe('mitschriften')
    expect(
      commitScope([lab, { ...lab, path: 'Studium/Module/Datenbanksysteme 2/Praktikum 3/schema.sql' }]),
    ).toBe('praktikum-3')
  })
})
