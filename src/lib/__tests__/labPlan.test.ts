import { labSheets, nextWeekday, planLabs, reminderHours } from '../labPlan'

describe('lab plan', () => {
  it('suggests a lab date and a preparation per sheet', () => {
    const plan = planLabs({
      module: 'DBS 2',
      first: '2026-10-22',
      start: '09:00',
      everyWeeks: 2,
      count: 2,
      prepDays: 1,
      sheets: { 1: 'U/DBS2_Praktikum_01.pdf' },
    })
    expect(plan).toEqual([
      {
        n: 1,
        kind: 'Praktikumstermin',
        title: 'DBS 2 – P01 Praktikumstermin',
        due: '2026-10-22T09:00',
        sheet: 'U/DBS2_Praktikum_01.pdf',
      },
      {
        n: 1,
        kind: 'Vorbereitung',
        title: 'DBS 2 – P01 Vorbereitung',
        due: '2026-10-21',
        sheet: 'U/DBS2_Praktikum_01.pdf',
      },
      { n: 2, kind: 'Praktikumstermin', title: 'DBS 2 – P02 Praktikumstermin', due: '2026-11-05T09:00' },
      { n: 2, kind: 'Vorbereitung', title: 'DBS 2 – P02 Vorbereitung', due: '2026-11-04' },
    ])
  })
  it('finds the sheets, not the solutions or copies', () => {
    expect(
      labSheets([
        'a/DBS2_Praktikum_01.pdf',
        'a/DBS2_Praktikum_01 2.pdf',
        'a/DBS2_Praktikum_01_Datenbank_STUNDE2.zip',
        'a/DBS2_Praktikum_02_Musterloesung.pdf',
        'a/DBS2_Praktikum_02.pdf',
        'a/OOP2 - P03 Vererbung.pdf',
        'a/DBS2_Praktikum_07-Lösung.pdf',
      ]),
    ).toEqual({ 1: 'a/DBS2_Praktikum_01.pdf', 2: 'a/DBS2_Praktikum_02.pdf', 3: 'a/OOP2 - P03 Vererbung.pdf' })
  })
  it('reads reminders and weekdays', () => {
    expect(reminderHours('2 Std. vorher')).toBe(2)
    expect(reminderHours('1 Woche vorher')).toBe(168)
    expect(reminderHours('Keine')).toBeNull()
    expect(reminderHours(undefined)).toBe(24)
    // Friday 16.10.2026 → next Thursday 22.10.
    expect(nextWeekday('Do', new Date(2026, 9, 16)).getDate()).toBe(22)
    expect(nextWeekday('Fr', new Date(2026, 9, 16)).getDate()).toBe(16)
  })
})
