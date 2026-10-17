/**
 * iCalendar (RFC 5545) for the calendar feed: one-off and weekly events in local ("floating")
 * time – the phone shows them in its own time zone, which is the study's. Pure logic.
 */

export interface IcsEvent {
  uid: string
  summary: string
  description?: string
  location?: string
  /** first day (YYYY-MM-DD) */
  date: string
  /** "09:15"; none: all-day */
  time?: string
  /** "10:45" – or `minutes` */
  end?: string
  minutes?: number
  /** repeats every week until this day (YYYY-MM-DD, included) */
  weeklyUntil?: string
}

/** Escapes text values (backslash, ; , and line breaks). */
export const icsText = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')

/** Lines longer than 75 characters are folded (continuation lines start with a space). */
export function fold(line: string): string {
  const out: string[] = []
  let rest = line
  while (rest.length > 75) {
    out.push(rest.slice(0, 75))
    rest = ` ${rest.slice(75)}`
  }
  out.push(rest)
  return out.join('\r\n')
}

const compact = (date: string) => date.replace(/-/g, '')
const at = (date: string, time: string) => `${compact(date)}T${time.replace(':', '')}00`

function addMinutes(date: string, time: string, minutes: number): string {
  const d = new Date(`${date}T${time}:00`)
  d.setMinutes(d.getMinutes() + minutes)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`
}

function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00`)
  d.setDate(d.getDate() + 1)
  return compact(d.toISOString().slice(0, 10))
}

export function toIcs(events: IcsEvent[], { name, now = new Date() }: { name: string; now?: Date }): string {
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Notiva//Studium//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsText(name)}`,
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ]
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, `SUMMARY:${icsText(e.summary)}`)
    if (e.time) {
      lines.push(`DTSTART:${at(e.date, e.time)}`)
      lines.push(`DTEND:${e.end ? at(e.date, e.end) : addMinutes(e.date, e.time, e.minutes ?? 30)}`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`)
    }
    if (e.weeklyUntil) lines.push(`RRULE:FREQ=WEEKLY;UNTIL=${compact(e.weeklyUntil)}T235959`)
    if (e.location) lines.push(`LOCATION:${icsText(e.location)}`)
    if (e.description) lines.push(`DESCRIPTION:${icsText(e.description)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return `${lines.map(fold).join('\r\n')}\r\n`
}
