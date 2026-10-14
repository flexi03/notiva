import { installPack, studyPack } from '../packs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import {
  applyMoodleImport,
  cleanEventTitle,
  importTargets,
  materialsOf,
  parseIcs,
  planMoodleImport,
  snapshotFromIcs,
  snapshotFromWebService,
  materialCategory,
} from '../moodle'

const now = new Date(2026, 9, 14, 10)

// Like Moodle's calendar export: CRLF, folded lines, escaped commas, UTC times.
const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Moodle Pty Ltd//NONSGML Moodle Version 2024100700//EN',
  'BEGIN:VEVENT',
  'UID:1234@moodle.example.org',
  'SUMMARY:Übungsblatt 4 ist fällig',
  'DESCRIPTION:Bitte als PDF\\, einzeln abgeben.',
  'CLASS:PUBLIC',
  'LAST-MODIFIED:20261001T080000Z',
  'DTSTAMP:20261014T080000Z',
  'DTSTART:20261021T120000Z',
  'DTEND:20261021T120000Z',
  'CATEGORIES:Lineare Algebra',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:1235@moodle.example.org',
  'SUMMARY:Quiz Kapitel 2 schließt',
  'DTSTART:20261030T100000Z',
  'CATEGORIES:Datenbanken',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:99@moodle.example.org',
  'SUMMARY:Alte Abgabe ist fällig',
  'DTSTART:20260101T100000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n')

const WS = {
  siteInfo: { userid: 7, fullname: 'Alex Beispiel', sitename: 'Moodle Uni' },
  courses: [
    { id: 42, shortname: 'LA1', fullname: 'Lineare Algebra', displayname: 'Lineare Algebra' },
    { id: 43, shortname: 'BS', fullname: 'Betriebssysteme &amp; Netze' },
  ],
  events: {
    events: [
      {
        id: 501,
        name: 'Blatt 5 ist fällig',
        activityname: 'Blatt 5',
        modulename: 'assign',
        timesort: Date.UTC(2026, 9, 20, 10) / 1000,
        course: { id: 42, fullname: 'Lineare Algebra' },
        url: 'https://moodle.example.org/mod/assign/view.php?id=9',
      },
      {
        id: 502,
        name: 'Projekt Shell',
        modulename: 'assign',
        timesort: Date.UTC(2026, 10, 2, 10) / 1000,
        course: { id: 43 },
        url: 'javascript:alert(1)',
      },
    ],
  },
  grades: {
    grades: [
      { courseid: 42, grade: '1,7' },
      { courseid: 43, grade: '-' },
    ],
  },
}

async function setup() {
  const ws = await Workspace.open(new MemoryVault())
  await installPack(ws, studyPack, {}, '', now)
  return ws
}

describe('Moodle calendar export', () => {
  it('reads events with unfolded lines, escapes and UTC times', () => {
    const events = parseIcs(ICS.replace('Bitte als PDF', 'Bitte als\r\n  PDF'))
    expect(events).toHaveLength(3)
    expect(events[0]).toMatchObject({ uid: '1234@moodle.example.org', categories: 'Lineare Algebra' })
    expect(events[0]!.description).toBe('Bitte als PDF, einzeln abgeben.')
    expect(events[0]!.start!.toISOString()).toBe('2026-10-21T12:00:00.000Z')
  })

  it('turns Moodle titles into task names', () => {
    expect(cleanEventTitle('Übungsblatt 4 ist fällig')).toBe('Übungsblatt 4')
    expect(cleanEventTitle('Assignment 2 is due')).toBe('Assignment 2')
    expect(cleanEventTitle('Quiz Kapitel 2 schließt')).toBe('Quiz Kapitel 2')
    expect(cleanEventTitle('ist fällig')).toBe('ist fällig')
  })

  it('never throws on garbage', () => {
    expect(parseIcs('kein Kalender')).toEqual([])
    expect(parseIcs('BEGIN:VEVENT\nDTSTART:gestern\nEND:VEVENT')).toEqual([{}])
  })
})

describe('Moodle web service', () => {
  it('normalizes courses, deadlines and grades and drops unsafe links', () => {
    const snap = snapshotFromWebService('https://moodle.example.org/', WS, now)
    expect(snap.user).toBe('Alex Beispiel')
    expect(snap.courses.map((c) => c.name)).toEqual(['Lineare Algebra', 'Betriebssysteme & Netze'])
    expect(snap.courses[0]!.url).toBe('https://moodle.example.org/course/view.php?id=42')
    expect(snap.events[0]).toMatchObject({
      id: 'event:501',
      title: 'Blatt 5',
      kind: 'assign',
      course: { id: 'course:42' },
    })
    expect(snap.events[1]!.course!.name).toBe('Betriebssysteme & Netze')
    expect(snap.events[1]!.url).toBeUndefined()
    expect(snap.grades).toEqual([{ course: 'Lineare Algebra', grade: '1,7' }])
  })

  it('survives unexpected answers', () => {
    const snap = snapshotFromWebService(
      'https://x',
      { siteInfo: null, courses: { exception: 'x' }, events: 'nope' },
      now,
    )
    expect(snap).toMatchObject({ courses: [], events: [], grades: [] })
  })
})

describe('import into the study dashboard', () => {
  it('finds the dashboard databases', async () => {
    const ws = await setup()
    expect(importTargets(ws)[0]).toEqual({
      folder: 'Studium',
      modules: 'Studium/Module.md',
      tasks: 'Studium/Aufgaben.md',
    })
  })

  it('plans modules and tasks, links them and imports only once', async () => {
    const ws = await setup()
    const target = importTargets(ws)[0]!
    const snap = snapshotFromWebService('https://moodle.example.org', WS, now)
    const plan = planMoodleImport(ws, snap, target, now)
    // "Lineare Algebra" exists already: it only gets the Moodle id (and link).
    expect(plan.find((p) => p.key === 'course:42')).toMatchObject({ kind: 'update', what: 'module' })
    expect(plan.find((p) => p.key === 'course:43')).toMatchObject({
      kind: 'create',
      title: 'Betriebssysteme & Netze',
      values: { Status: 'In Vorlesung', Link: 'https://moodle.example.org/course/view.php?id=43' },
    })
    expect(plan.find((p) => p.key === 'event:501')).toMatchObject({
      kind: 'create',
      title: 'Blatt 5',
      values: { Fällig: '2026-10-20', Status: 'Offen', Art: 'Übungsblatt', Modul: ['[[Lineare Algebra]]'] },
    })
    await applyMoodleImport(ws, plan)
    const task = ws.rows('Studium/Aufgaben.md').find((r) => r.data.moodle === 'event:502')!
    // Linked to the module created in the same import.
    expect(task.data.Modul).toEqual([
      `[[${ws.linkText(ws.rows('Studium/Module.md').find((r) => r.data.moodle === 'course:43')!.path)}]]`,
    ])
    // Second import: nothing new.
    expect(planMoodleImport(ws, snap, target, now)).toEqual([])
    // Moved deadline: only the date changes, the user's status stays.
    await ws.setProperty(task.path, 'Status', 'In Arbeit')
    const moved = {
      ...snap,
      events: snap.events.map((e) => (e.id === 'event:502' ? { ...e, due: '2026-11-09T10:00:00.000Z' } : e)),
    }
    const update = planMoodleImport(ws, moved, target, now)
    expect(update).toEqual([expect.objectContaining({ kind: 'update', changes: { Fällig: '2026-11-09' } })])
    await applyMoodleImport(ws, update)
    expect(ws.get(task.path)!.data).toMatchObject({ Fällig: '2026-11-09', Status: 'In Arbeit' })
  })

  it('imports calendar deadlines from today on and links known modules by name', async () => {
    const ws = await setup()
    const snap = snapshotFromIcs(ICS, 'https://moodle.example.org', now)
    const plan = planMoodleImport(ws, snap, importTargets(ws)[0]!, now)
    expect(plan.map((p) => p.title)).toEqual(['Übungsblatt 4', 'Quiz Kapitel 2'])
    expect(plan[0]).toMatchObject({ values: { Modul: ['[[Lineare Algebra]]'], Fällig: '2026-10-21' } })
    expect(plan[1]).toMatchObject({ values: { Art: 'Lernen', Modul: ['[[Datenbanken]]'] } })
  })
})

describe('course materials', () => {
  const contents = [
    {
      name: 'Woche 1',
      modules: [
        {
          id: 77,
          name: 'Vorlesung 1 – Folien',
          modname: 'resource',
          url: 'https://moodle.example.org/mod/resource/view.php?id=77',
          contents: [
            {
              type: 'file',
              filename: 'vl01.pdf',
              fileurl:
                'https://moodle.example.org/webservice/pluginfile.php/1/mod_resource/content/1/vl01.pdf?forcedownload=1',
              filesize: 123456,
              mimetype: 'application/pdf',
              timemodified: 1790000000,
            },
          ],
        },
        {
          id: 78,
          name: 'Skript (extern)',
          modname: 'url',
          contents: [{ type: 'url', fileurl: 'https://skript.example.org/la.pdf' }],
        },
        {
          id: 79,
          name: 'Böser Link',
          modname: 'url',
          contents: [{ type: 'url', fileurl: 'javascript:alert(1)' }],
        },
        {
          id: 80,
          name: 'Übungen',
          modname: 'folder',
          contents: [
            { type: 'file', filename: 'blatt1.pdf', fileurl: 'https://moodle.example.org/f/blatt1.pdf' },
          ],
        },
        { id: 81, name: 'Forum', modname: 'forum' },
      ],
    },
  ]

  it('lists files, links and folder contents per course', () => {
    const list = materialsOf('course:42', contents)
    expect(list.map((m) => [m.id, m.kind, m.title])).toEqual([
      ['file:77:vl01.pdf', 'file', 'Vorlesung 1 – Folien'],
      ['url:78', 'url', 'Skript (extern)'],
      ['file:80:blatt1.pdf', 'file', 'Übungen / blatt1.pdf'],
    ])
    expect(list[0]).toMatchObject({ section: 'Woche 1', mimetype: 'application/pdf', size: 123456 })
    expect(materialsOf('course:42', 'kaputt')).toEqual([])
  })

  it('adds materials and Moodle notifications to the snapshot', () => {
    const snap = snapshotFromWebService(
      'https://moodle.example.org',
      {
        ...WS,
        contents: { '42': contents },
        notices: {
          notifications: [
            {
              id: 9,
              subject: 'Neuer Beitrag im Forum',
              smallmessage: '<b>Hallo</b>',
              contexturl: 'https://moodle.example.org/mod/forum/discuss.php?d=1',
              timecreated: 1790000000,
            },
          ],
        },
      },
      now,
    )
    expect(snap.materials).toHaveLength(3)
    expect(snap.materials![0]!.courseId).toBe('course:42')
    expect(snap.notices).toEqual([
      {
        id: 'notice:9',
        subject: 'Neuer Beitrag im Forum',
        text: 'Hallo',
        url: 'https://moodle.example.org/mod/forum/discuss.php?d=1',
        time: new Date(1790000000 * 1000).toISOString(),
      },
    ])
  })
})

describe('material categories', () => {
  it('tells lecture, lab/exercise and other files apart', () => {
    const c = (title: string, section = '', filename = 'x.pdf') =>
      materialCategory({ title, section, filename })
    expect(c('Vorlesung 3 – Folien')).toBe('Vorlesung')
    expect(c('Skript Kapitel 2')).toBe('Vorlesung')
    expect(c('Übungsblatt 4')).toBe('Praktikum & Übung')
    expect(c('Aufgabe', 'Praktikum')).toBe('Praktikum & Übung')
    expect(c('Datensatz', 'Labor', 'daten.csv')).toBe('Praktikum & Übung')
    expect(c('Klausurinfos', 'Allgemeines')).toBe('Sonstiges')
  })
})

describe('HTML resources', () => {
  it('lists uploaded web pages as pages to open, not as files to save', () => {
    const list = materialsOf('course:1', [
      {
        name: 'Praktikum',
        modules: [
          {
            id: 9,
            name: 'ER-Trainer',
            modname: 'resource',
            url: 'https://moodle.example.org/mod/resource/view.php?id=9',
            contents: [
              {
                type: 'file',
                filename: 'index.html',
                mimetype: 'text/html',
                fileurl: 'https://moodle.example.org/pluginfile.php/1/index.html',
              },
              {
                type: 'file',
                filename: 'app.js',
                fileurl: 'https://moodle.example.org/pluginfile.php/1/app.js',
              },
            ],
          },
        ],
      },
    ])
    expect(list).toEqual([expect.objectContaining({ id: 'page:9', kind: 'page', title: 'ER-Trainer' })])
  })
})
