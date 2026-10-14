import { deadlineReminders, mergeNotifications, moodleNews, parseNotifications } from '../notifications'
import type { MoodleSnapshot } from '../moodle'

const now = new Date('2026-10-14T10:00:00Z')

const base: MoodleSnapshot = {
  site: 'https://moodle.example.org',
  source: 'webservice',
  fetchedAt: now.toISOString(),
  courses: [{ id: 'course:42', name: 'Lineare Algebra' }],
  events: [
    {
      id: 'event:1',
      title: 'Blatt 5',
      due: '2026-10-20T10:00:00.000Z',
      course: { id: 'course:42', name: 'Lineare Algebra' },
      kind: 'assign',
    },
  ],
  grades: [],
  materials: [
    {
      id: 'file:77:vl01.pdf',
      courseId: 'course:42',
      section: 'Woche 1',
      title: 'VL 1',
      kind: 'file',
      url: 'https://x/vl01.pdf',
      modified: '2026-10-01T08:00:00.000Z',
    },
  ],
  notices: [],
}

describe('moodleNews', () => {
  it('reports nothing on the very first fetch', () => {
    expect(moodleNews(null, base, { now })).toEqual([])
  })

  it('finds new and moved deadlines, new and updated materials, notices and grades', () => {
    const next: MoodleSnapshot = {
      ...base,
      events: [
        { ...base.events[0]!, due: '2026-10-22T10:00:00.000Z' },
        { id: 'event:2', title: 'Projekt', due: '2026-11-01T10:00:00.000Z', kind: 'assign' },
        { id: 'event:3', title: 'Vorbei', due: '2026-10-01T10:00:00.000Z', kind: 'assign' },
      ],
      materials: [
        { ...base.materials![0]!, modified: '2026-10-13T08:00:00.000Z' },
        {
          id: 'file:90:vl02.pdf',
          courseId: 'course:42',
          section: 'Woche 2',
          title: 'VL 2',
          kind: 'file',
          url: 'https://x/vl02.pdf',
        },
      ],
      notices: [
        { id: 'notice:5', subject: 'Raumänderung', text: 'Heute in H3', time: '2026-10-14T09:00:00.000Z' },
      ],
      grades: [{ course: 'Lineare Algebra', grade: '1,7' }],
    }
    const news = moodleNews(base, next, { now, pages: new Map([['event:2', 'Studium/Aufgaben/Projekt.md']]) })
    expect(news.map((n) => [n.kind, n.title])).toEqual([
      ['moved', 'Blatt 5'],
      ['deadline', 'Projekt'],
      ['updated', 'VL 1'],
      ['material', 'VL 2'],
      ['notice', 'Raumänderung'],
      ['grade', 'Lineare Algebra'],
    ])
    expect(news[1]!.target).toEqual({ type: 'page', path: 'Studium/Aufgaben/Projekt.md' })
    expect(news[3]).toMatchObject({
      course: 'Lineare Algebra',
      body: 'Woche 2',
      target: { type: 'material', id: 'file:90:vl02.pdf' },
    })
    // Nothing new → nothing reported.
    expect(moodleNews(next, next, { now })).toEqual([])
  })

  it('reminds of deadlines in the next 24 hours once per date', () => {
    const reminders = deadlineReminders(
      [
        { id: 'a', title: 'Morgen', due: '2026-10-15T08:00:00.000Z' },
        { id: 'b', title: 'Später', due: '2026-10-20T08:00:00.000Z' },
      ],
      { now },
    )
    expect(reminders.map((r) => r.id)).toEqual(['reminder:a:2026-10-15'])
  })
})

describe('mergeNotifications', () => {
  it('adds only unknown ones, newest first', () => {
    const a = { id: 'a', kind: 'notice' as const, title: 'A', time: '2026-10-14T08:00:00Z' }
    const b = { id: 'b', kind: 'notice' as const, title: 'B', time: '2026-10-14T09:00:00Z' }
    const first = mergeNotifications([], [a])
    const second = mergeNotifications(first.list, [a, b, b])
    expect(second.added.map((n) => n.id)).toEqual(['b'])
    expect(second.list.map((n) => n.id)).toEqual(['b', 'a'])
  })

  it('validates stored notifications', () => {
    expect(
      parseNotifications([
        {
          id: 'x',
          kind: 'notice',
          title: 'T',
          time: '2026-10-14T08:00:00Z',
          target: { type: 'url', url: 'javascript:alert(1)' },
        },
        { id: 'y', kind: 'evil', title: 'T', time: '2026-10-14T08:00:00Z' },
        'kaputt',
      ]),
    ).toEqual([{ id: 'x', kind: 'notice', title: 'T', time: '2026-10-14T08:00:00Z' }])
  })
})
