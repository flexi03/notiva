import { defaultPlan, parsePlanSettings, planFrom, planTopics, studyDays, todaysPortion } from '../studyPlan'

const M = 'Studium/Unterlagen/DBS 2'
const files = [
  `${M}/Vorlesung/DBS2 - Vorlesung 10 - Recovery.pdf`,
  `${M}/Vorlesung/DBS2 - Vorlesung 02 - Query Processing.pdf`,
  `${M}/Vorlesung/DBS2 - Vorlesung 01 - Architektur.pdf`,
  `${M}/Vorlesung/DBS2 - Vorlesung 01 - Architektur (Notizen).md`,
  `${M}/Sonstiges/DBS2_Probeklausur.pdf`,
  `${M}/Sonstiges/DBS2_Probeklausur_Loesung.pdf`,
  `${M}/Archiv/WiSe 25-26/Vorlesung/DBS2-alt.pdf`,
]
// Thursday 2026-10-29 to the exam on Monday 2026-11-09.
const settings = {
  start: '2026-10-29',
  exam: '2026-11-09',
  weekdays: [0, 1, 2, 3, 4],
  skip: ['2026-11-03'],
  examDays: 1,
}

describe('studyPlan', () => {
  it('topics: current lectures in their order, then practice exams', () => {
    expect(planTopics(files, M).map((t) => `${t.kind}:${t.key}`)).toEqual([
      'lecture:DBS2 - Vorlesung 01 - Architektur.pdf',
      'lecture:DBS2 - Vorlesung 02 - Query Processing.pdf',
      'lecture:DBS2 - Vorlesung 10 - Recovery.pdf',
      'exam:DBS2_Probeklausur.pdf',
    ])
  })

  it('study days: chosen weekdays, single days off, until the day before the exam', () => {
    expect(studyDays(settings, '2026-10-29')).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-11-02',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ])
  })

  it('spreads lectures first, exams on the last days; a missed day moves on', () => {
    const topics = planTopics(files, M)
    const plan = planFrom(topics, new Set(), settings, '2026-10-29')
    const short = (key: string) => /Vorlesung (\d+)/.exec(key)?.[1] ?? key
    expect(plan.map((d) => d.topics.map((t) => short(t.key)))).toEqual([
      ['01'],
      ['02'],
      ['10'],
      [],
      [],
      ['DBS2_Probeklausur.pdf'],
    ])
    // Nothing done on Thursday and Friday: on Monday the three lectures are spread over the days left.
    const later = planFrom(topics, new Set(), settings, '2026-11-02')
    expect(later.map((d) => d.topics.length)).toEqual([1, 1, 1, 1])
    expect(
      todaysPortion(topics, new Set(['DBS2 - Vorlesung 01 - Architektur.pdf']), settings, '2026-11-02'),
    ).toHaveLength(1)
    // Saturday is no study day: nothing today.
    expect(todaysPortion(topics, new Set(), settings, '2026-10-31')).toEqual([])
  })

  it('reads settings from the module page and suggests a default', () => {
    expect(
      parsePlanSettings({ start: '2026-10-01', exam: '2026-10-30', weekdays: [9, 2, 2], examDays: 99 }),
    ).toEqual({
      start: '2026-10-01',
      exam: '2026-10-30',
      weekdays: [2],
      skip: [],
      examDays: 14,
    })
    expect(parsePlanSettings({ start: 'x' })).toBeNull()
    expect(defaultPlan('2026-11-30', '2026-10-17')).toMatchObject({
      start: '2026-11-02',
      weekdays: [0, 1, 2, 3, 4],
    })
    expect(defaultPlan('2026-10-30', '2026-10-17').start).toBe('2026-10-17')
  })
})
