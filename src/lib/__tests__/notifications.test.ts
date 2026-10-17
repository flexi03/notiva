import {
  deadlineReminders,
  mergeNotifications,
  moodleNews,
  parseNotifications,
  checkResult,
  newsSummary,
  parseCourseChoices,
} from '../notifications'
import { parseSubmission } from '../moodle'
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

describe('check results', () => {
  it('replace their older entry, are read and never count as news', () => {
    const first = mergeNotifications(
      [],
      [checkResult('moodle', 'Moodle geprüft', 'nichts Neues', new Date('2026-10-15T08:00:00Z'))],
    )
    expect(first.added).toEqual([])
    const second = mergeNotifications(first.list, [
      checkResult('moodle', 'Moodle geprüft', '2 neue Termine', new Date('2026-10-15T09:00:00Z')),
    ])
    expect(second.list).toHaveLength(1)
    expect(second.list[0]).toMatchObject({ body: '2 neue Termine', read: true })
    expect(newsSummary([])).toBe('nichts Neues')
  })
})

describe('sign-in and suggestion entries', () => {
  it('keeps relogin/review targets and replaces a suggestion instead of piling them up', async () => {
    const { mergeNotifications, parseNotifications } = await import('../notifications')
    const parsed = parseNotifications([
      {
        id: 'ecampus-login:1',
        kind: 'notice',
        title: 'x',
        time: '2026-10-15T10:00:00Z',
        target: { type: 'relogin', service: 'ecampus' },
      },
      {
        id: 'suggest:materials',
        kind: 'material',
        title: 'y',
        time: '2026-10-15T10:00:00Z',
        target: { type: 'review', what: 'materials' },
      },
      {
        id: 'bad',
        kind: 'notice',
        title: 'z',
        time: '2026-10-15T10:00:00Z',
        target: { type: 'relogin', service: 'evil' },
      },
    ])
    expect(parsed.map((n) => n.target)).toEqual([
      { type: 'relogin', service: 'ecampus' },
      { type: 'review', what: 'materials' },
      undefined,
    ])
    const one = {
      id: 'suggest:materials',
      kind: 'material' as const,
      title: '1 neue',
      body: 'a',
      time: '2026-10-15T10:00:00Z',
    }
    const first = mergeNotifications([], [one])
    expect(first.added).toHaveLength(1)
    const same = mergeNotifications(
      first.list.map((n) => ({ ...n, read: true })),
      [{ ...one, time: '2026-10-15T11:00:00Z' }],
    )
    expect(same.added).toHaveLength(0)
    expect(same.list.filter((n) => n.id === 'suggest:materials')).toHaveLength(1)
    const changed = mergeNotifications(same.list, [{ ...one, title: '2 neue', body: 'a, b' }])
    expect(changed.added).toHaveLength(1)
    expect(changed.list.filter((n) => n.id === 'suggest:materials')).toHaveLength(1)
  })
})

describe('moodleNews with course choices', () => {
  const twoCourses: MoodleSnapshot = {
    ...base,
    courses: [...base.courses, { id: 'course:99', name: 'DBS 2 – WiSe 25/26' }],
  }
  const next: MoodleSnapshot = {
    ...twoCourses,
    events: [
      ...base.events,
      {
        id: 'event:9',
        title: 'Abgabe alt',
        due: '2026-11-01T10:00:00.000Z',
        course: { id: 'course:99', name: 'DBS 2' },
        kind: 'assign',
      },
    ],
    materials: [
      ...base.materials!,
      {
        id: 'file:1:a.pdf',
        courseId: 'course:99',
        title: 'A',
        section: 'S',
        filename: 'a.pdf',
        kind: 'file',
        url: 'u',
      },
      {
        id: 'file:2:b.pdf',
        courseId: 'course:99',
        title: 'B',
        section: 'S',
        filename: 'b.pdf',
        kind: 'file',
        url: 'u',
      },
    ],
  }

  it('"later": one grey note per course instead of materials', () => {
    const news = moodleNews(twoCourses, next, {
      now,
      choice: (id) => (id === 'course:99' ? 'later' : undefined),
    })
    expect(news.filter((n) => n.kind === 'material')).toEqual([])
    const aside = news.filter((n) => n.kind === 'aside')
    expect(aside).toHaveLength(1)
    expect(aside[0]!.body).toBe('a.pdf, b.pdf')
    expect(aside[0]!.target).toEqual({ type: 'course', courseId: 'course:99' })
  })

  it('"ignore": nothing at all – no files, no deadlines', () => {
    const news = moodleNews(twoCourses, next, {
      now,
      choice: (id) => (id === 'course:99' ? 'ignore' : undefined),
    })
    expect(news).toEqual([])
  })

  it('parses stored choices and drops anything else', () => {
    expect(parseCourseChoices({ 'course:1': 'later', 'course:2': 'ignore', 'course:3': 'yes' })).toEqual({
      'course:1': 'later',
      'course:2': 'ignore',
    })
    expect(parseCourseChoices('x')).toEqual({})
  })
})

describe('assignment submissions', () => {
  it("reads Moodle's submission status: open, submitted, graded with feedback", () => {
    expect(parseSubmission({ lastattempt: { submission: { status: 'new' } } })).toEqual({ state: 'open' })
    expect(parseSubmission({ lastattempt: { submission: { status: 'submitted' } } })).toEqual({
      state: 'submitted',
    })
    expect(
      parseSubmission({
        lastattempt: { submission: { status: 'submitted' }, gradingstatus: 'graded' },
        feedback: {
          gradefordisplay: '<b>1,7</b>',
          plugins: [{ editorfields: [{ text: '<p>Gut gelöst!</p>' }] }],
        },
      }),
    ).toEqual({ state: 'graded', grade: '1,7', feedback: 'Gut gelöst!' })
    expect(parseSubmission(null)).toBeUndefined()
  })

  it('reports an assignment graded since the last fetch – once', () => {
    const before: MoodleSnapshot = {
      ...base,
      events: [{ ...base.events[0]!, submission: { state: 'submitted' } }],
    }
    const after: MoodleSnapshot = {
      ...base,
      events: [
        { ...base.events[0]!, submission: { state: 'graded', grade: '1,7', feedback: 'Gut gelöst!' } },
      ],
    }
    const graded = moodleNews(before, after, { now }).filter((n) => n.id.startsWith('graded:'))
    expect(graded).toEqual([
      expect.objectContaining({ kind: 'grade', title: 'Bewertet: Blatt 5 – 1,7', body: 'Gut gelöst!' }),
    ])
    expect(moodleNews(after, after, { now }).filter((n) => n.id.startsWith('graded:'))).toEqual([])
  })
})
