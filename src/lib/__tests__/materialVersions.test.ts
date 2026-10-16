import type { MoodleMaterial } from '../moodle'
import { comparePdfText, planReindex, planSort, versionName } from '../materialVersions'

const file = (id: string, filename: string, extra: Partial<MoodleMaterial> = {}): MoodleMaterial => ({
  id,
  courseId: 'course:1',
  section: 'Vorlesung',
  title: filename,
  kind: 'file',
  filename,
  url: 'https://moodle.example/x',
  ...extra,
})

describe('re-reading materials', () => {
  const folder = () => 'Studium/Unterlagen/DBS 2'
  it('finds files in the wrong folder, missing files and newer versions', () => {
    const plan = planReindex(
      [
        file('a', 'VL01.pdf'),
        file('b', 'VL02.pdf'),
        file('c', 'VL03.pdf', { modified: '2026-10-10T08:00:00Z' }),
        file('d', 'P01.pdf'),
      ],
      {
        a: { path: 'Studium/Unterlagen/Orga/DBS/VL01.pdf' },
        c: { path: 'Studium/Unterlagen/DBS 2/Vorlesung/VL03.pdf', modified: '2026-10-01T08:00:00Z' },
        d: { path: 'Studium/Unterlagen/DBS 2/Praktikum & Übung/P01.pdf' },
      },
      folder,
      (p) => !p.endsWith('VL02.pdf'),
    )
    expect(plan.moves).toEqual([
      {
        id: 'a',
        from: 'Studium/Unterlagen/Orga/DBS/VL01.pdf',
        to: 'Studium/Unterlagen/DBS 2/Vorlesung/VL01.pdf',
      },
    ])
    expect(plan.missing.map((m) => m.id)).toEqual(['b'])
    expect(plan.updated.map((u) => [u.material.id, u.path])).toEqual([
      ['c', 'Studium/Unterlagen/DBS 2/Vorlesung/VL03.pdf'],
    ])
  })
  it('names the newer version with its date', () => {
    expect(versionName('Skript.pdf', new Date(2026, 9, 16))).toBe('Skript (neu 2026-10-16).pdf')
    expect(versionName('README', new Date(2026, 0, 2))).toBe('README (neu 2026-01-02)')
  })
})

describe('comparing two PDF versions', () => {
  const slide = (n: number) => `Folie ${n} Datenbanken Transaktionen Isolation Sperren Beispiel ${n * 7}`
  it('marks changed, new and removed pages', () => {
    const old = [slide(1), slide(2), slide(3), 'Organisatorisches Klausur Termin Raum']
    const next = [
      slide(1),
      `${slide(2)} neuer Hinweis zur Klausur`,
      'Ganz neue Folie über Recovery Logging',
      slide(3),
    ]
    const result = comparePdfText(old, next)
    expect(result.pages.map((p) => p.kind)).toEqual(['same', 'changed', 'new', 'same'])
    expect(result.pages[3]).toMatchObject({ old: 3 })
    expect(result.removed).toEqual([4])
  })
  it('finds moved pages', () => {
    const result = comparePdfText([slide(1), slide(2)], [slide(2), slide(1)])
    expect(result.pages).toMatchObject([
      { kind: 'same', old: 2 },
      { kind: 'same', old: 1 },
    ])
    expect(result.removed).toEqual([])
  })
})

describe('sorting loose files', () => {
  it('moves files lying in a module folder into their category', () => {
    const base = 'Studium/Unterlagen'
    const moves = planSort(
      [
        `${base}/Datenbanksysteme 2/DBS2-10_Anfrageverarbeitung.pdf`,
        `${base}/Datenbanksysteme 2/DBS2_Praktikum_03.pdf`,
        `${base}/Datenbanksysteme 2/DBS2 - Praktikum 01 - Vorbereitungsblatt (Notizen).md`,
        `${base}/Datenbanksysteme 2/Vorlesung/DBS2-1.pdf`,
        `${base}/Datenbanksysteme 2/MongoDB.pdf`,
        `${base}/Orga/Fachschaft/Termine.pdf`,
        `${base}/Prüfungsplan/plan.pdf`,
      ],
      base,
    )
    expect(moves).toEqual([
      {
        from: `${base}/Datenbanksysteme 2/DBS2-10_Anfrageverarbeitung.pdf`,
        to: `${base}/Datenbanksysteme 2/Vorlesung/DBS2-10_Anfrageverarbeitung.pdf`,
      },
      {
        from: `${base}/Datenbanksysteme 2/DBS2_Praktikum_03.pdf`,
        to: `${base}/Datenbanksysteme 2/Praktikum & Übung/DBS2_Praktikum_03.pdf`,
      },
      {
        from: `${base}/Datenbanksysteme 2/MongoDB.pdf`,
        to: `${base}/Datenbanksysteme 2/Sonstiges/MongoDB.pdf`,
      },
      { from: `${base}/Orga/Fachschaft/Termine.pdf`, to: `${base}/Orga/Fachschaft/Sonstiges/Termine.pdf` },
    ])
  })
})

describe('term folders', () => {
  it('names a course term and sorts files inside it', async () => {
    const { termFolder } = await import('../study/modules')
    expect(termFolder({ name: 'Datenbanksysteme 2 - WiSe 2025/26' })).toBe('WiSe 25-26')
    expect(termFolder({ name: 'BMI 12 Mathematik 2 (SoSe2025)' })).toBe('SoSe 25')
    expect(termFolder({ name: 'BMI 32: Datenbanksysteme 2', shortname: 'DBS2' })).toBe('DBS2')
    const base = 'U'
    expect(planSort([`${base}/DBS 2/WiSe 25-26/DBS2-3_SQL.pdf`], base)).toEqual([
      {
        from: `${base}/DBS 2/WiSe 25-26/DBS2-3_SQL.pdf`,
        to: `${base}/DBS 2/WiSe 25-26/Vorlesung/DBS2-3_SQL.pdf`,
      },
    ])
  })
})
