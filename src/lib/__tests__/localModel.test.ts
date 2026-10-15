import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/vault', () => ({ electronBridge: () => null }))
const { describeChange, firstLine } = await import('@/app/localModel')

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
})
