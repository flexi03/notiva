import { courseInfoMarkdown, courseInfoNews, courseInfoOf, htmlToMarkdown, lastChange } from '../moodleInfo'
import { snapshotFromWebService } from '../moodle'

const CONTENTS = [
  {
    id: 1,
    section: 0,
    name: 'Allgemeines',
    summary: '<p>Vorlesung <strong>dienstags</strong> 10:00 in 4.E.001<br>Praktikum ab KW 42.</p>',
    modules: [
      { id: 11, modname: 'forum', name: 'Ankündigungen', instance: 5 },
      {
        id: 12,
        modname: 'label',
        description: '<h3>Klausur</h3><ul><li>Termin: 03.02.</li><li>Hilfsmittel: keine</li></ul>',
      },
    ],
  },
  {
    id: 2,
    section: 1,
    name: 'Woche 1',
    summary: '',
    modules: [{ id: 21, modname: 'resource', name: 'Folien' }],
  },
]

describe('Moodle course texts', () => {
  it('turns Moodle HTML into safe Markdown', () => {
    expect(htmlToMarkdown('<p>A &amp; B</p><p>Zeile<br/>zwei</p>')).toBe('A & B\n\nZeile\nzwei')
    expect(htmlToMarkdown('<ul><li>eins</li><li><b>zwei</b></li></ul>')).toBe('- eins\n- **zwei**')
    expect(htmlToMarkdown('<a href="https://x.org/a">Plan</a> <a href="javascript:alert(1)">böse</a>')).toBe(
      '[Plan](https://x.org/a) böse',
    )
    expect(htmlToMarkdown('<script>alert(1)</script><img src=x onerror=alert(1)>ok')).toBe('ok')
    expect(htmlToMarkdown('&#8222;Zitat&#8220; &nbsp;&uuml;')).toBe('„Zitat“ ü')
  })

  it('collects description, sections with text blocks, pages and announcements', () => {
    const info = courseInfoOf('course:7', {
      course: { id: 7, summary: '<p>Einführung in Datenbanken.</p>' },
      contents: CONTENTS,
      pages: {
        pages: [
          {
            id: 3,
            coursemodule: 30,
            course: 7,
            name: 'Organisation',
            content: '<p>Testat in Woche 6</p>',
            timemodified: 1760000000,
          },
        ],
      },
      discussions: {
        discussions: [
          {
            discussion: 9,
            subject: 'Raumänderung',
            message: '<p>Heute in 5.E.001</p>',
            timemodified: 1760100000,
          },
        ],
      },
    })
    expect(info.summary?.text).toBe('Einführung in Datenbanken.')
    expect(info.sections).toHaveLength(1)
    expect(info.sections[0]).toMatchObject({ title: 'Allgemeines' })
    expect(info.sections[0]!.text).toContain('**dienstags**')
    expect(info.sections[0]!.text).toContain('- Termin: 03.02.')
    expect(info.pages[0]).toMatchObject({ id: 'page:30', title: 'Organisation', text: 'Testat in Woche 6' })
    expect(info.announcements[0]).toMatchObject({ id: 'news:9', title: 'Raumänderung' })
    expect(lastChange(info)).toBe(new Date(1760100000 * 1000).toISOString())
  })

  it('writes the course page and keeps the own notes', () => {
    const info = courseInfoOf('course:7', { course: { summary: 'Kurs' }, contents: CONTENTS })
    const first = courseInfoMarkdown(info)
    expect(first).toContain('## Beschreibung')
    expect(first).toContain('## Abschnitte')
    expect(first).toContain('## Meine Notizen')
    const edited = first.replace(/## Meine Notizen\n\n-.*/, '## Meine Notizen\n\n- Tutor fragen')
    const changed = courseInfoOf('course:7', { course: { summary: 'Kurs, neu' }, contents: CONTENTS })
    const next = courseInfoMarkdown(changed, edited)
    expect(next).toContain('Kurs, neu')
    expect(next).toContain('- Tutor fragen')
  })

  it('reports new announcements and changed texts', () => {
    const before = { 'course:7': courseInfoOf('course:7', { course: { summary: 'A' }, contents: CONTENTS }) }
    const after = {
      'course:7': courseInfoOf('course:7', {
        course: { summary: 'A' },
        contents: [{ ...CONTENTS[0], summary: '<p>Vorlesung fällt am 21.10. aus</p>' }, CONTENTS[1]],
        discussions: {
          discussions: [{ discussion: 10, subject: 'Klausurtermin steht', message: 'am 03.02.' }],
        },
      }),
    }
    const news = courseInfoNews(before, after, () => 'Datenbanken')
    expect(news.map((n) => n.title)).toEqual(['Klausurtermin steht', 'Geändert: Allgemeines'])
    expect(news[1]).toMatchObject({ course: 'Datenbanken', kind: 'notice' })
    expect(news[1]!.body).toContain('fällt am 21.10. aus')
    expect(courseInfoNews(undefined, after, () => '')).toEqual([])
    expect(courseInfoNews(after, after, () => '')).toEqual([])
  })

  it('is part of the web service snapshot', () => {
    const snap = snapshotFromWebService('https://moodle.example.org', {
      siteInfo: {},
      courses: [{ id: 7, fullname: 'Datenbanken', summary: '<p>Hallo</p>' }],
      events: { events: [] },
      contents: { '7': CONTENTS },
    })
    expect(snap.info?.['course:7']?.summary?.text).toBe('Hallo')
  })
})
