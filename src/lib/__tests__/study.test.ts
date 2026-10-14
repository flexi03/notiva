import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { moduleResults, type ExamRecord } from '../ecampus'
import { HSD_BMI_2018 } from '../study/catalog'
import { isOrgaCourse, matchExam, matchModuleName, nameScore } from '../study/match'
import { studyState } from '../study/state'
import { findStudyDashboard, planStudySync, readStudySetup } from '../study/sync'
import {
  addTerms,
  parseTerm,
  resolveTermPlaceholder,
  studySemester,
  termLabel,
  termOf,
  termRange,
} from '../study/terms'
import { resolveFilterDates } from '../widgets'
import { renderTemplate } from '../templates'

const now = new Date(2026, 9, 14, 10)
const start = parseTerm('WiSe 24/25')!

describe('semesters', () => {
  it('reads the usual spellings', () => {
    const cases: Array<[string, string]> = [
      ['WiSe 24/25', 'WiSe 24/25'],
      ['Software Engineering - WiSe 2025/2026', 'WiSe 25/26'],
      ['Wintersemester 2024/25', 'WiSe 24/25'],
      ['WS25', 'WiSe 25/26'],
      ['SoSe 25', 'SoSe 25'],
      ['Mathematik 2 (SoSe2025)', 'SoSe 25'],
      ['Sommersemester 2026', 'SoSe 26'],
      ['SS 2025', 'SoSe 25'],
      ['Bild- und Tontechnik (S26)', 'SoSe 26'],
    ]
    for (const [text, label] of cases) expect(termLabel(parseTerm(text)!), text).toBe(label)
    expect(parseTerm('Mathematik 1')).toBeNull()
    expect(parseTerm('BMI 05 & D1.4 : Mathematik 1')).toBeNull()
  })

  it('knows which semester a date is in and counts semesters', () => {
    expect(termLabel(termOf(now))).toBe('WiSe 26/27')
    expect(termLabel(termOf(new Date(2027, 1, 10)))).toBe('WiSe 26/27')
    expect(termLabel(termOf(new Date(2027, 3, 10)))).toBe('SoSe 27')
    expect(studySemester(start, termOf(now))).toBe(5)
    expect(termLabel(addTerms(start, 1))).toBe('SoSe 25')
    expect(termRange(parseTerm('SoSe 26')!)).toEqual({ start: '2026-03-01', end: '2026-08-31' })
  })

  it('resolves @semester in filters and {{semester}} in templates', () => {
    expect(resolveTermPlaceholder('@semester', now)).toBe('WiSe 26/27')
    expect(resolveTermPlaceholder('@nextSemester', now)).toBe('SoSe 27')
    expect(resolveFilterDates([{ property: 'Belegt', op: 'contains', value: '@lastSemester' }], now)).toEqual(
      [{ property: 'Belegt', op: 'contains', value: 'SoSe 26' }],
    )
    expect(renderTemplate('{{semester}} / {{semester+1}}', {}, now)).toBe('WiSe 26/27 / SoSe 27')
  })
})

describe('matching modules', () => {
  const nr = (name: string) => matchModuleName(name, HSD_BMI_2018)?.module.nr

  it('finds modules behind Moodle course names', () => {
    expect(nr('BMI 07: OOP2 SoSe 2025 - Für Wiederholer nach PO 2018 !')).toBe('BMI 07')
    expect(nr('BMI 13: Software Engineering - WiSe 2024/2025')).toBe('BMI 13')
    expect(nr('Datenbanksysteme 2 - WiSe 2025/26')).toBe('BMI 08')
    expect(nr('BMI 16 / BMT 11: Grundlagen Computergrafik')).toBe('BMI 16')
    expect(nr('BMI 05 & D1.4 : Mathematik 1')).toBe('BMI 05')
    expect(nr('Mobile Anwendungen')).toBe('BMI 96')
  })

  it('trusts the name over a code from another PO', () => {
    // Newer POs number differently: "BMI 15" is Informatikprojekt 2 in PO 2018.
    expect(nr('BMI 15: Mediengestaltung 1')).toBe('BMI 04')
    expect(nr('BMI 32: Datenbanksysteme 2')).toBe('BMI 08')
  })

  it('keeps numbered modules apart and knows orga courses', () => {
    expect(nameScore('Mathematik 2', 'Mathematik 1')).toBe(0)
    expect(nr('Mathe 3')).toBe('BMI 18')
    expect(isOrgaCourse('Informationen für Studierende BMI')).toBe(true)
    expect(isOrgaCourse('Fachschaft Medien')).toBe(true)
    expect(nr('Nachhaltiges Bauen – eine Kooperationsplattform')).toBeUndefined()
  })

  it('maps exam numbers, also exams of a module (3351 → 3350)', () => {
    expect(
      matchExam({ number: '3351', title: 'Rechnerarchitektur und Professionelles Studieren' }, HSD_BMI_2018)
        ?.nr,
    ).toBe('BMI 35')
    expect(
      matchExam({ number: '3150', title: 'Informatikprojekt 2 - Konzeption eines Werkzeugs' }, HSD_BMI_2018)
        ?.nr,
    ).toBe('BMI 15')
    expect(matchExam({ title: 'Software-Engineering' }, HSD_BMI_2018)?.nr).toBe('BMI 13')
  })
})

const exam = (
  number: string,
  title: string,
  semester: string,
  attempt: number,
  grade: number | null,
  extra: Partial<ExamRecord> = {},
): ExamRecord => ({
  id: `${number}#${attempt}`,
  number,
  title,
  semester,
  ...(grade !== null ? { grade, gradeText: grade.toFixed(1).replace('.', ',') } : {}),
  status: grade !== null && grade <= 4 ? 'passed' : 'failed',
  statusText: grade !== null && grade <= 4 ? 'bestanden' : 'nicht bestanden',
  credits: grade !== null && grade <= 4 ? 5 : 0,
  attempt,
  level: 'exam',
  ...extra,
})

const RECORDS: ExamRecord[] = [
  exam('3010', 'Objektorientierte Programmierung 1', 'WiSe 24/25', 1, 5),
  exam('3010', 'Objektorientierte Programmierung 1', 'SoSe 25', 2, 3.3),
  exam('3070', 'Objektorientierte Programmierung 2', 'SoSe 25', 1, 5),
  exam('3070', 'Objektorientierte Programmierung 2', 'SoSe 26', 2, null, { remark: 'nicht erschienen' }),
  exam('3120', 'Mathematik 2', 'WiSe 25/26', 1, 1.3),
]

const COURSES = [
  { id: 'course:1', name: 'BMI 13: Software Engineering - WiSe 2024/2025' },
  { id: 'course:2', name: 'BMI 13: Software Engineering - WiSe 2025/2026' },
  { id: 'course:3', name: 'BMI 40: Betriebssysteme', url: 'https://moodle.example.org/course/view.php?id=3' },
  { id: 'course:4', name: 'Informationen für Studierende BMI' },
  { id: 'course:5', name: 'Nachhaltiges Bauen – eine Kooperationsplattform' },
]

describe('study state', () => {
  const state = studyState(HSD_BMI_2018, start, { results: moduleResults(RECORDS), courses: COURSES, now })
  const of = (nr: string) => state.modules.find((m) => m.module.nr === nr)!

  it('derives status, history and semesters per module', () => {
    expect(state.semester).toBe(5)
    expect(of('BMI 01')).toMatchObject({
      status: 'Bestanden',
      history: '1. WiSe 24/25: 5,0 · 2. SoSe 25: 3,3 ✓',
    })
    expect(of('BMI 07')).toMatchObject({ status: 'Wiederholung' })
    expect(of('BMI 07').history).toBe('1. SoSe 25: 5,0 · 2. SoSe 26: nicht erschienen')
    // Retake now: belongs to this semester too.
    expect(of('BMI 07').terms.map(termLabel)).toEqual(['SoSe 25', 'SoSe 26', 'WiSe 26/27'])
    // Semester 3 module without attempt: missing, planned for the next time it is offered.
    expect(of('BMI 18')).toMatchObject({ status: 'Fehlt' })
    expect(of('BMI 18').terms.map(termLabel)).toEqual(['WiSe 26/27'])
    expect(of('BMI 22').terms.map(termLabel)).toEqual(['SoSe 27'])
    // Plan semester 5 = now.
    expect(of('BMI 40')).toMatchObject({ status: 'In Vorlesung' })
    expect(of('BMI 40').courses.map((c) => c.id)).toEqual(['course:3'])
    expect(of('BMI 41')).toMatchObject({ status: 'Geplant' })
    expect(of('BMI 41').terms.map(termLabel)).toEqual(['SoSe 27'])
  })

  it('puts both Moodle courses of a module together and sorts out the rest', () => {
    expect(of('BMI 13').courses.map((c) => c.id)).toEqual(['course:1', 'course:2'])
    expect(of('BMI 13').terms.map(termLabel)).toEqual(['WiSe 24/25', 'WiSe 25/26', 'WiSe 26/27'])
    expect(state.orga.map((c) => c.id)).toEqual(['course:4'])
    expect(state.other.map((c) => c.id)).toEqual(['course:5'])
  })
})

describe('study folder sync', () => {
  async function setup() {
    const ws = await Workspace.open(new MemoryVault())
    await installPack(ws, studyPack, {}, '', now)
    const dash = findStudyDashboard(ws)!
    await ws.save(dash.path, {
      data: { ...ws.get(dash.path)!.data, studium: { programm: 'hsd-bmi-2018', beginn: 'WiSe 24/25' } },
    })
    return ws
  }
  const state = () =>
    studyState(HSD_BMI_2018, start, { results: moduleResults(RECORDS), courses: COURSES, now })

  it('reads the setup from the dashboard', async () => {
    const ws = await setup()
    expect(findStudyDashboard(ws)).toMatchObject({
      folder: 'Studium',
      setup: { program: 'hsd-bmi-2018', start: 'WiSe 24/25' },
    })
    expect(readStudySetup({ studium: { programm: 'x', beginn: 'kein Semester' } })).toBeNull()
  })

  it('creates all modules, semesters and courses and is idempotent', async () => {
    const ws = await setup()
    const plan = planStudySync(ws, 'Studium', state())
    expect(plan.changes.filter((c) => c.what === 'module' && c.kind === 'create').length).toBeGreaterThan(30)
    await plan.apply()
    const rows = ws.rows('Studium/Module.md')
    const oop1 = rows.find((r) => r.data.modul === 'BMI 01')!
    expect(oop1.title).toBe('Objektorientierte Programmierung 1')
    expect(oop1.data).toMatchObject({
      Status: 'Bestanden',
      Note: 3.3,
      Versuche: 2,
      'Bestanden im': 'SoSe 25',
      Fachsemester: 1,
      Praktikum: 'Bestanden',
      Voraussetzung: 'Praktikum',
    })
    expect(ws.get(oop1.path)!.body).toContain('type: related')
    const se = rows.find((r) => r.data.modul === 'BMI 13')!
    expect(se.data.kurse).toEqual(['course:1', 'course:2'])
    // Only one page per module although there are two courses.
    expect(rows.filter((r) => r.data.modul === 'BMI 13')).toHaveLength(1)
    const sem5 = ws.rows('Studium/Semester.md').find((r) => r.data.fachsemester === 5)!
    expect(sem5.data).toMatchObject({ Zeitraum: 'WiSe 26/27', Status: 'Aktiv', 'ECTS Plan': 30 })
    expect(ws.get(sem5.path)!.body).toContain('value: "WiSe 26/27"')
    const courses = ws.rows('Studium/Kurse.md')
    expect(courses.find((c) => c.data.moodle === 'course:2')!.data).toMatchObject({
      Art: 'Modul',
      Semester: 'WiSe 25/26',
      Modul: ['[[Software Engineering]]'],
    })
    expect(courses.find((c) => c.data.moodle === 'course:4')!.data.Art).toBe('Orga')
    // Second run: nothing left to do.
    expect(planStudySync(ws, 'Studium', state()).changes).toEqual([])
  })

  it('adopts existing pages and keeps a status the user chose', async () => {
    const ws = await setup()
    await planStudySync(ws, 'Studium', state()).apply()
    // The template's own "Software Engineering" row was adopted, not duplicated.
    expect(ws.rows('Studium/Module.md').filter((r) => /software engineering/i.test(r.title))).toHaveLength(1)
    const bs = ws.rows('Studium/Module.md').find((r) => r.data.modul === 'BMI 40')!
    await ws.save(bs.path, { data: { ...bs.data, Status: 'Geplant' } })
    expect(planStudySync(ws, 'Studium', state()).changes).toEqual([])
    // A new fact (passed) wins.
    const passed = [...RECORDS, exam('3400', 'Betriebssysteme', 'WiSe 26/27', 1, 2)]
    const next = studyState(HSD_BMI_2018, start, { results: moduleResults(passed), courses: COURSES, now })
    await planStudySync(ws, 'Studium', next).apply()
    expect(ws.get(bs.path)!.data).toMatchObject({ Status: 'Bestanden', Note: 2 })
  })

  it('shows only the current semester with the "Dieses Semester" view', async () => {
    const ws = await setup()
    await planStudySync(ws, 'Studium', state()).apply()
    const db = ws.get('Studium/Module.md')!.database!
    const view = db.views.find((v) => v.name === 'Dieses Semester')!
    const rows = ws
      .resolvedRows('Studium/Module.md', now)
      .filter((r) =>
        resolveFilterDates(view.filter, now)!.every(
          (f) => r.values[f.property] && JSON.stringify(r.values[f.property]).includes(String(f.value)),
        ),
      )
    const names = rows.map((r) => r.row.data.modul)
    expect(names).toContain('BMI 40')
    expect(names).toContain('BMI 07')
    expect(names).not.toContain('BMI 01')
  })
})
