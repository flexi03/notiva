/**
 * Timetable from course texts: "Vorlesung dienstags 10:00–11:30 in 4.E.001", "Praktikum: Do, 14.15
 * - 15.45 Uhr", … Recognized per module and entered into the timetable; differences to the user's
 * own entries are asked about. Plus: which event runs now and which comes next. Pure.
 */

export const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'] as const
export type Day = (typeof DAYS)[number]
export type SessionType = 'Vorlesung' | 'Übung' | 'Praktikum' | 'Tutorium'

export interface Session {
  type: SessionType
  day: Day
  start: string
  end: string
  room?: string
  /** "Gruppe A" – one of several parallel groups; the user attends only one */
  group?: string
  /** The sentence it was read from ("Vorlesung dienstags 10:00–11:30 in 4.E.001"). */
  snippet?: string
  /** Where that sentence stands ("Moodle: BMI 32 Datenbanksysteme 2", "Folien: VL00.pdf, S. 4"). */
  source?: string
}

const DAY_WORDS: Array<[RegExp, Day]> = [
  [/\b(montags?|mo\.?)(?=[\s,:/])/i, 'Mo'],
  [/\b(dienstags?|di\.?)(?=[\s,:/])/i, 'Di'],
  [/\b(mittwochs?|mi\.?)(?=[\s,:/])/i, 'Mi'],
  [/\b(donnerstags?|do\.?)(?=[\s,:/])/i, 'Do'],
  [/\b(freitags?|fr\.?)(?=[\s,:/])/i, 'Fr'],
  [/\b(samstags?|sa\.?)(?=[\s,:/])/i, 'Sa'],
]
const TYPES: Array<[RegExp, SessionType]> = [
  [/praktik|labor|\blab\b/i, 'Praktikum'],
  [/übung|uebung|exercise/i, 'Übung'],
  [/tutori/i, 'Tutorium'],
  [/vorlesung|lecture|\bvl\b/i, 'Vorlesung'],
]
const TIME = /(\d{1,2})[:.](\d{2})\s*(?:uhr\s*)?(?:-|–|—|bis)\s*(\d{1,2})[:.](\d{2})/i
// A room has a digit: "Raum der Veranstaltung" is no room, "Hörsaal 04.1.009" and "4.E.001" are.
const ROOM =
  /\b(?:raum|room|hörsaal|r\.)\s*:?\s*(?=[\w.\-/]*\d)([A-Z0-9][\w.\-/]{1,15})|\b(\d{1,2}\.[A-Z0-9]\.\d{2,3})\b/i
// A concrete date ("18.12.", "29.4.26", "2. Juli") – a one-off appointment, not a weekly session …
const DATE =
  /\b\d{1,2}\.\s?(?:\d{1,2}\.(?:\d{2,4})?|(?:jan|feb|mär|apr|mai|jun|jul|aug|sep|okt|nov|dez)[a-zä]*)(?!\d)/i
// … unless it says when the weekly sessions start ("dienstags ab dem 28.10.", "jeweils mittwochs").
const WEEKLY =
  /\b(?:ab dem|ab|jeweils|wöchentlich|weekly|every|immer|montags|dienstags|mittwochs|donnerstags|freitags|samstags)\b/i
const GROUP = /\bgruppe\s+([A-Z0-9]{1,3})\b|\bgroup\s+([A-Z0-9]{1,3})\b/i

const pad = (h: string, m: string) => `${h.padStart(2, '0')}:${m}`

/** Sessions mentioned in a text (one per line/sentence that has a weekday, a time range and a type). */
export function findSessions(text: string, fallbackType?: SessionType, program?: string): Session[] {
  const out: Session[] = []
  // "für den Studiengang BMT reserviert" – not for a BMI student.
  const code = program?.match(/^[A-Za-z]+/)?.[0]?.toUpperCase()
  const otherProgram = (piece: string) => {
    const named = /studiengang\s+([A-Z]{2,5})\b/i.exec(piece)?.[1]?.toUpperCase()
    return Boolean(code && named && named !== code)
  }
  const pieces = text.split(/\n|(?<=[.;])\s+(?=[A-ZÄÖÜ])/)
  let lastType: SessionType | undefined
  for (const piece of pieces) {
    const type = TYPES.find(([re]) => re.test(piece))?.[1]
    if (type) lastType = type
    const time = TIME.exec(piece)
    const day = DAY_WORDS.find(([re]) => re.test(piece))?.[1]
    if (!time || !day) continue
    if (DATE.test(piece.replace(TIME, '')) && !WEEKLY.test(piece)) continue
    if (otherProgram(piece)) continue
    const [, h1, m1, h2, m2] = time
    if (Number(h1) > 23 || Number(h2) > 23) continue
    const room = ROOM.exec(piece)
    const kind = type ?? lastType ?? fallbackType
    if (!kind) continue
    const group = GROUP.exec(piece)
    const session: Session = {
      type: kind,
      day,
      start: pad(h1!, m1!),
      end: pad(h2!, m2!),
      ...(room ? { room: (room[1] ?? room[2])! } : {}),
      ...(group ? { group: (group[1] ?? group[2])!.toUpperCase() } : {}),
      snippet: piece.replace(/\s+/g, ' ').trim().slice(0, 160),
    }
    if (!out.some((s) => s.type === session.type && s.day === session.day && s.start === session.start))
      out.push(session)
  }
  return out
}

export interface TimetableRow {
  path: string
  title: string
  day?: string
  start?: string
  end?: string
  type?: string
  module?: string
  room?: string
  /** where the time was found ("Moodle: …", "Folien: …, S. 3") */
  source?: string
}

export interface ScheduleChange {
  kind: 'create' | 'conflict' | 'groups'
  module: string
  session: Session
  /** conflict: the user's row that says otherwise */
  row?: TimetableRow
  /** groups: all parallel groups of this type – the user picks theirs */
  options?: Session[]
}

/** New sessions to add and differences to the user's rows (same module and type). */
export function planTimetable(
  moduleTitle: string,
  sessions: Session[],
  rows: TimetableRow[],
): ScheduleChange[] {
  const mine = rows.filter((r) => r.module === moduleTitle)
  const changes: ScheduleChange[] = []
  const sameType = (r: TimetableRow, type: SessionType) =>
    (r.type ?? '') === type || (type === 'Praktikum' && r.type === 'Labor')
  // Parallel groups: nothing to add when the user already has one of them, otherwise ask once.
  for (const type of new Set(sessions.filter((s) => s.group).map((s) => s.type))) {
    const options = sessions.filter((s) => s.group && s.type === type)
    if (mine.some((r) => sameType(r, type))) continue
    if (options.length === 1) changes.push({ kind: 'create', module: moduleTitle, session: options[0]! })
    else changes.push({ kind: 'groups', module: moduleTitle, session: options[0]!, options })
  }
  for (const session of sessions.filter((s) => !s.group)) {
    const same = mine.filter(
      (r) => (r.type ?? '') === session.type || (session.type === 'Praktikum' && r.type === 'Labor'),
    )
    if (same.some((r) => r.day === session.day && r.start === session.start)) continue
    if (same.length) changes.push({ kind: 'conflict', module: moduleTitle, session, row: same[0]! })
    else changes.push({ kind: 'create', module: moduleTitle, session })
  }
  return changes
}

export interface CalendarEvent {
  title: string
  start: Date
  end: Date
  room?: string
  /** Module title (timetable rows) – the badge and the timetable link to it. */
  module?: string
  /** The page behind the event (timetable row or exam). */
  path?: string
  type?: string
}

const toDate = (base: Date, hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date(base)
  d.setHours(h ?? 0, m ?? 0, 0, 0)
  return d
}

/** Weekly sessions of the next 7 days and dated events (exams) as one sorted list. */
export function upcomingEvents(rows: TimetableRow[], dated: CalendarEvent[], now: Date): CalendarEvent[] {
  const out: CalendarEvent[] = []
  for (let offset = 0; offset < 8; offset++) {
    const day = new Date(now)
    day.setDate(now.getDate() + offset)
    const code = DAYS[(day.getDay() + 6) % 7]
    for (const r of rows) {
      if (r.day !== code || !r.start) continue
      const start = toDate(day, r.start)
      const end = r.end ? toDate(day, r.end) : new Date(start.getTime() + 90 * 60_000)
      out.push({
        title: r.title,
        start,
        end,
        path: r.path,
        ...(r.room ? { room: r.room } : {}),
        ...(r.module ? { module: r.module } : {}),
        ...(r.type ? { type: r.type } : {}),
      })
    }
  }
  out.push(...dated)
  return out.filter((e) => e.end > now).sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** What runs now and what comes next. */
export function nowAndNext(
  events: CalendarEvent[],
  now: Date,
): { current?: CalendarEvent; next?: CalendarEvent } {
  const current = events.find((e) => e.start <= now && e.end > now)
  const next = events.find((e) => e.start > now)
  return { ...(current ? { current } : {}), ...(next ? { next } : {}) }
}

/** "1 Std. 20 Min." / "35 Min." / "2 Tage" */
export function duration(ms: number): string {
  const min = Math.max(0, Math.round(ms / 60_000))
  if (min < 60) return `${min} Min.`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} Std.${min % 60 ? ` ${min % 60} Min.` : ''}`
  const d = Math.round(h / 24)
  return `${d} ${d === 1 ? 'Tag' : 'Tage'}`
}
