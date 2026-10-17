import { fold, icsText, toIcs } from '../ics'

const now = new Date('2026-10-17T08:00:00Z')

describe('ics', () => {
  it('weekly lectures, timed and all-day events', () => {
    const text = toIcs(
      [
        {
          uid: 'a@notiva',
          summary: 'Datenbanken',
          location: 'H3',
          date: '2026-10-20',
          time: '12:00',
          end: '13:30',
          weeklyUntil: '2027-01-31',
        },
        { uid: 'b@notiva', summary: 'Klausur Mathematik 3', date: '2026-11-23', time: '10:00', minutes: 90 },
        { uid: 'c@notiva', summary: 'Lernen: DBS 2', description: 'VL 05, VL 06', date: '2026-10-21' },
      ],
      { name: 'Notiva – Studium', now },
    )
    expect(text).toContain(
      'DTSTART:20261020T120000\r\nDTEND:20261020T133000\r\nRRULE:FREQ=WEEKLY;UNTIL=20270131T235959',
    )
    expect(text).toContain('DTSTART:20261123T100000\r\nDTEND:20261123T113000')
    expect(text).toContain('DTSTART;VALUE=DATE:20261021\r\nDTEND;VALUE=DATE:20261022')
    expect(text).toContain('DESCRIPTION:VL 05\\, VL 06')
    expect(text).toContain('DTSTAMP:20261017T080000Z')
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true)
  })

  it('escapes and folds', () => {
    expect(icsText('a;b,c\nd\\')).toBe('a\\;b\\,c\\nd\\\\')
    const long = fold(`SUMMARY:${'x'.repeat(100)}`)
    expect(long.split('\r\n').map((l) => l.length)).toEqual([75, 34])
    expect(long.split('\r\n')[1]!.startsWith(' ')).toBe(true)
  })
})
