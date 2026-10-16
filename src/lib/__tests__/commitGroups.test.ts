import { groupChanges } from '../commitGroups'

const U = 'Studium/Unterlagen/Datenbanksysteme 2'

describe('commit groups', () => {
  it('names moves, new files per folder and Notiva data – no cut-off file names', () => {
    const { bullets, texts } = groupChanges([
      { path: '.notiva/moodle-files.json', status: 'modified' },
      ...['DBS2-2_UML-Beispiel.pdf', 'Hinweise_SQL_Developer-V19.pdf', 'DBS2-9_B-Baum-Beispiel.pdf'].flatMap(
        (f) => [
          { path: `${U}/${f}`, status: 'deleted' },
          { path: `${U}/Praktikum & Übung/${f}`, status: 'untracked' },
        ],
      ),
      { path: `${U}/Vorlesung/DBS2-1.pdf`, status: 'renamed', from: `${U}/DBS2-1.pdf` },
      { path: `${U}/Vorlesung/DBS2-12.pdf`, status: 'untracked' },
      {
        path: 'Studium/Mitschriften/DBS2 – 2026-10-16.md',
        status: 'modified',
        added: 5,
        excerpt: ['+ B-Baum'],
      },
    ])
    expect(bullets).toEqual([
      '3 Dateien in „Unterlagen / Datenbanksysteme 2“ nach „Praktikum & Übung“ einsortiert',
      '1 Datei in „Unterlagen / Datenbanksysteme 2“ nach „Vorlesung“ einsortiert',
      'Neue Datei „DBS2-12.pdf“ in „Datenbanksysteme 2 / Vorlesung“',
      'Notiva-Daten aktualisiert (Unterlagen-Zuordnung, Einstellungen)',
    ])
    expect(texts.map((t) => t.path)).toEqual(['Studium/Mitschriften/DBS2 – 2026-10-16.md'])
  })

  it('sums up sorting in many folders', () => {
    const changes = ['A', 'B', 'C', 'D', 'E', 'F'].flatMap((m) => [
      { path: `U/${m}/x${m}.pdf`, status: 'deleted' },
      { path: `U/${m}/Vorlesung/x${m}.pdf`, status: 'untracked' },
    ])
    const { bullets, groupedFiles } = groupChanges(changes)
    expect(bullets[0]).toBe('6 Dateien in 6 Ordnern einsortiert bzw. verschoben')
    expect(bullets.at(-1)).toBe('… und 1 weitere Ordner')
    expect(groupedFiles).toBe(6)
  })
})
