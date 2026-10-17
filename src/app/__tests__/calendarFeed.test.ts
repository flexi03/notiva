import { installPack, studyPack } from '@/lib/packs'
import { MemoryVault } from '@/lib/vault/memory'
import { Workspace } from '@/lib/workspace'
import { calendarEvents, calendarFeed } from '../calendarFeed'

async function demo() {
  const ws = await Workspace.open(new MemoryVault('Test'))
  await installPack(ws, studyPack, { studiengang: 'Informatik (B.Sc.)' })
  return ws
}

describe('calendar feed', () => {
  it('lectures weekly through the semester, exams with their time, the same as "Heute"', async () => {
    const ws = await demo()
    const events = calendarEvents(ws, null)
    const lecture = events.find((e) => e.summary.startsWith('Datenbanken (Vorlesung'))
    expect(lecture).toMatchObject({ time: '12:00', end: '13:30', location: 'H3' })
    expect(lecture!.weeklyUntil).toMatch(/^\d{4}-\d\d-\d\d$/)
    expect(events.some((e) => e.summary === 'Prüfung: Klausur Lineare Algebra')).toBe(true)
    const text = calendarFeed(ws, null)
    expect(text).toContain('BEGIN:VCALENDAR')
    expect(text).toContain('RRULE:FREQ=WEEKLY')
    expect(text).toContain('X-WR-CALNAME:Notiva – Studium')
  })
})
