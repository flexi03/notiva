import {
  examPlanNews,
  examsForStudy,
  findPlanLinks,
  parsePlanTable,
  planExamDates,
  planVersion,
} from '../examPlan'
import { installPack, studyPack } from '../packs'
import { HSD_BMI_2018 } from '../study/catalog'
import { studyState } from '../study/state'
import { planStudySync } from '../study/sync'
import { parseTerm } from '../study/terms'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import type { PdfTextItem } from '../pdfText'

const X = [30, 80, 110, 160, 230, 420, 500, 600, 640, 690]
const line = (y: number, cells: string[]): PdfTextItem[] =>
  cells.map((str, i) => ({ x: X[i]!, y, w: 10, str })).filter((c) => c.str)

const PAGE: PdfTextItem[] = [
  { x: 30, y: 20, w: 100, str: 'Prüfungsplanung FB Medien' },
  { x: 30, y: 30, w: 100, str: 'Version 1.3, 08.06.2026' },
  ...line(50, [
    'Datum',
    'Tag',
    'Studieng.',
    'Code',
    'Fachname',
    'PrüferIn',
    'Raum',
    'Dauer',
    'Beginn',
    'Titel',
  ]),
  ...line(60, [
    '20.08.2026',
    'Do',
    'BMI18',
    'BMI 07',
    'Objektorientierte Programmierung 2',
    'Dozent A',
    'AM',
    '90',
    '10:00',
  ]),
  ...line(70, ['28.08.2026', 'Fr', 'BMI18', 'BMI 05', 'Mathematik 1', 'Dozent B', 'AM', '90', '14:00']),
  ...line(80, [
    '15.07.2026',
    'Mi',
    'BMI18',
    'BMI 36/37/38/39/42',
    'BMI 96: Mobile Anwendungen',
    'Dozent C',
    'AM',
    '90',
    '10:30',
  ]),
  ...line(90, ['20.08.2026', 'Do', 'BMT18', 'BMT 05', 'Mathematik 1', 'Dozent B', 'AM', '90', '14:00']),
  ...line(100, [
    'T.n.V.',
    '',
    'BMI18',
    'BMI 10',
    'Informatikprojekt 1',
    'Dozent D',
    'n.V.',
    'Projektprüfung',
    'n.V.',
    'Parallax',
  ]),
  { x: 690, y: 104, w: 10, str: 'Scrolling' },
]

describe('exam plans', () => {
  it('finds the plan PDFs on the faculty page, newest first', () => {
    const html = `<a href="/pruefungen/Documents/Pr%C3%BCfungstermine/20260104-WiSe2025-Pruefungsplanung-FBM.pdf">Alt</a>
      <a href="/pruefungen/Documents/Pr%C3%BCfungstermine/20260608%20SoSe2026%20Pr%C3%BCfungsplanung%20FBM.pdf">Prüfungsplanung SoSe</a>
      <a href="/Documents/Formular.pdf">Formular</a>`
    const links = findPlanLinks(html, 'https://medien.example.org/studium/')
    expect(links.map((l) => l.date)).toEqual(['2026-06-08', '2026-01-04'])
    expect(links[0]!.url).toMatch(/^https:\/\/medien\.example\.org\/pruefungen\//)
  })

  it('reads the table, also long titles over two lines', () => {
    const rows = parsePlanTable([PAGE])
    expect(rows).toHaveLength(5)
    expect(rows[0]).toMatchObject({
      date: '2026-08-20',
      program: 'BMI18',
      code: 'BMI 07',
      name: 'Objektorientierte Programmierung 2',
      room: 'AM',
      duration: '90',
      start: '10:00',
    })
    expect(rows[4]).toMatchObject({ name: 'Informatikprojekt 1', title: 'Parallax Scrolling' })
    expect(rows[4]!.date).toBeUndefined()
    expect(planVersion([PAGE])).toBe('Version 1.3, 08.06.2026')
  })

  it('keeps the dates of open modules of the own program and enters them', async () => {
    const now = new Date(2026, 6, 1)
    const state = studyState(HSD_BMI_2018, parseTerm('WiSe 24/25')!, {
      results: [
        {
          key: '3050',
          number: '3050',
          title: 'Mathematik 1',
          status: 'passed',
          attempts: [],
          tries: 1,
          failedTries: 0,
        },
      ],
      courses: [{ id: 'course:1', name: 'Mobile Anwendungen' }],
      now,
    })
    const exams = examsForStudy(parsePlanTable([PAGE]), state)
    // Mathematik 1 is passed, BMT18 is another program, the project has no date.
    expect(exams.map((e) => e.moduleNr)).toEqual(['BMI 07', 'BMI 96'])

    const ws = await Workspace.open(new MemoryVault())
    await installPack(ws, studyPack, {}, '', now)
    await planStudySync(ws, 'Studium', state).apply()
    const pathOf = (nr: string) => ws.rows('Studium/Module.md').find((r) => r.data.modul === nr)?.path
    const plan = planExamDates(ws, 'Studium/Prüfungen.md', exams, pathOf)
    expect(plan.changes.map((c) => c.kind)).toEqual(['create', 'create'])
    await plan.apply()
    const oop = ws
      .rows('Studium/Prüfungen.md')
      .find((r) => String(r.data.pruefungsplan).startsWith('BMI 07|'))!
    expect(oop.data).toMatchObject({
      Datum: '2026-08-20',
      Raum: 'AM',
      Beginn: '10:00',
      Dauer: '90 Min.',
      Art: 'Klausur',
    })
    expect(oop.data.Modul).toEqual(['[[Objektorientierte Programmierung 2]]'])
    expect(planExamDates(ws, 'Studium/Prüfungen.md', exams, pathOf).changes).toEqual([])

    // The date moves: the same entry is updated and reported.
    const moved = exams.map((e) =>
      e.moduleNr === 'BMI 07'
        ? { ...e, key: 'BMI 07|2026-08-21|10:00', entry: { ...e.entry, date: '2026-08-21' } }
        : e,
    )
    const update = planExamDates(ws, 'Studium/Prüfungen.md', moved, pathOf)
    expect(update.changes).toEqual([
      expect.objectContaining({ kind: 'update', detail: expect.stringContaining('2026-08-20 → 2026-08-21') }),
    ])
    const news = examPlanNews('Version 1.4', 'Version 1.3', update.changes)
    expect(news.map((n) => n.title)).toEqual([
      'Neuer Prüfungsplan (Version 1.4)',
      expect.stringContaining('Prüfungstermin geändert'),
    ])
  })
})
