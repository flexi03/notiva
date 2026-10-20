import type { FrontmatterData } from '../frontmatter'
import { courseTracking, moduleIsActive, parseCourseTracking, trackOf } from '../courseTracking'

const now = new Date('2026-11-10T10:00:00Z') // WiSe 2026/27
const course = (id: number, name: string) => ({ id: `course:${id}`, name })

describe('course tracking', () => {
  const courses = [
    course(1, 'Datenbanken WiSe 2026/27'),
    course(2, 'Datenbanken WiSe 2025/26'),
    course(3, 'Analysis I WiSe 2026/27'),
    course(4, 'Programmieren 2 SoSe 2026'),
    course(5, 'Informationen für Studierende Informatik'),
    course(6, 'Mobile Systeme WiSe 2026/27'),
    course(7, 'Altes Wahlfach SoSe 2024'),
    course(8, 'Netze WiSe 2026/27'),
    course(11, 'Compilerbau'),
  ]
  const modules: Array<{ title?: string; data: FrontmatterData }> = [
    { data: { Status: 'In Vorlesung', kurse: ['course:1', 'course:2'] } },
    { data: { Status: 'Bestanden', kurse: ['course:3'] } },
    { data: { Status: 'Prüfung angemeldet', Belegung: ['Prüfung'], kurse: ['course:4'] } },
    // Exam registered, but the lab is still open: still active.
    { data: { Status: 'Prüfung angemeldet', Praktikum: 'Offen', kurse: ['course:8'] } },
    // Not linked yet (no study sync): found by its name.
    { title: 'Compilerbau', data: { Status: 'Bestanden' } },
  ]
  const tracking = courseTracking({ courses, modules, choices: { 'course:6': 'later' }, now })

  it('active modules count, passed/exam ones only notify about posts, the rest is quiet', () => {
    expect(tracking.courses).toEqual({
      'course:1': { level: 'track' },
      'course:2': { level: 'quiet', reason: 'other' },
      'course:3': { level: 'notices', reason: 'done' },
      'course:4': { level: 'notices', reason: 'done' },
      'course:5': { level: 'notices', reason: 'orga' },
      'course:6': { level: 'quiet', reason: 'later' },
      'course:7': { level: 'quiet', reason: 'other' },
      'course:8': { level: 'track' },
      'course:11': { level: 'notices', reason: 'done' },
    })
  })

  it('a course enrolled since: this semester counts, older ones are quiet', () => {
    expect(trackOf(tracking, {}, course(9, 'Mobile Systeme 2 WiSe 2026/27'), now)).toEqual({ level: 'track' })
    expect(trackOf(tracking, {}, course(10, 'Statistik SoSe 2025'), now)).toEqual({
      level: 'quiet',
      reason: 'other',
    })
  })

  it('without the file every course counts – except "später"', () => {
    expect(trackOf(null, {}, course(7, 'Altes Wahlfach SoSe 2024'), now)).toEqual({ level: 'track' })
    expect(trackOf(null, { 'course:7': 'later' }, course(7, 'x'), now).level).toBe('quiet')
  })

  it('attending again keeps a module active', () => {
    expect(moduleIsActive({ Status: 'Bestanden' })).toBe(false)
    expect(moduleIsActive({ Status: 'Note ausstehend', Belegung: ['Vorlesung'] })).toBe(true)
    expect(moduleIsActive({ Status: 'Geplant' })).toBe(true)
  })

  it('parses the stored file and drops anything else', () => {
    expect(parseCourseTracking(null)).toBeNull()
    expect(
      parseCourseTracking({
        courses: { 'course:1': { level: 'quiet', reason: 'later' }, 'course:2': { level: 'loud' }, x: {} },
      }),
    ).toEqual({ courses: { 'course:1': { level: 'quiet', reason: 'later' } } })
  })
})
