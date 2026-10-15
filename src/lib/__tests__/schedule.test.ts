import { duration, findSessions, nowAndNext, planTimetable, upcomingEvents } from '../schedule'

describe('timetable from course texts', () => {
  it('finds weekday, time, room and type', () => {
    const text =
      'Die Vorlesung findet dienstags 10:00–11:30 Uhr in 4.E.001 statt.\nPraktikum: Do, 14.15 - 15.45 Uhr, Raum 5.E.002'
    const found = findSessions(text)
    expect(found).toMatchObject([
      { type: 'Vorlesung', day: 'Di', start: '10:00', end: '11:30', room: '4.E.001' },
      { type: 'Praktikum', day: 'Do', start: '14:15', end: '15:45', room: '5.E.002' },
    ])
    // The sentence it came from – shown as the source in the suggestion.
    expect(found[0]!.snippet).toContain('dienstags 10:00')
    expect(found[1]!.snippet).toContain('Praktikum')
  })
  it('asks when the own entry differs', () => {
    const changes = planTimetable(
      'DBS 2',
      [{ type: 'Praktikum', day: 'Do', start: '14:15', end: '15:45' }],
      [{ path: 'a', title: 'DBS Labor', day: 'Mi', start: '12:00', type: 'Labor', module: 'DBS 2' }],
    )
    expect(changes[0]).toMatchObject({ kind: 'conflict' })
  })
  it('knows what runs now and what is next', () => {
    const now = new Date(2026, 9, 15, 10, 30) // Thursday
    const events = upcomingEvents(
      [
        { path: 'x', title: 'DBS Praktikum', day: 'Do', start: '10:00', end: '11:30' },
        { path: 'y', title: 'BWL', day: 'Fr', start: '08:15', end: '09:45' },
      ],
      [],
      now,
    )
    const { current, next } = nowAndNext(events, now)
    expect(current?.title).toBe('DBS Praktikum')
    expect(next?.title).toBe('BWL')
    expect(duration(61 * 60_000)).toBe('1 Std. 1 Min.')
  })
})
