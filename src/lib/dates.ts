/** Date helpers working on local calendar days. Dates in files are ISO strings ("2026-10-14"). */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/
const DAY_MS = 86_400_000

export function parseDate(value: string): Date | null {
  const match = ISO_DATE.exec(value.trim())
  if (match) {
    const [, y, m, d, hh = '0', mm = '0', ss = '0'] = match
    const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss))
    return date.getMonth() === Number(m) - 1 ? date : null
  }
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(value.trim())
  if (german) {
    const [, d, m, y] = german
    const date = new Date(Number(y), Number(m) - 1, Number(d))
    return date.getMonth() === Number(m) - 1 ? date : null
  }
  return null
}

const pad = (n: number) => String(n).padStart(2, '0')

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

/** Whole calendar days from `a` to `b` (positive if b is later). DST-safe. */
export function daysBetween(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((ub - ua) / DAY_MS)
}

/** Monday-based start of week. */
export function startOfWeek(date: Date): Date {
  const day = (date.getDay() + 6) % 7
  return startOfDay(addDays(date, -day))
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

/** Tokens: YYYY, MM, M, DD, D, HH, mm. Anything else is copied verbatim. */
export function formatDate(date: Date, pattern = 'DD.MM.YYYY'): string {
  return pattern.replace(/YYYY|MM|M|DD|D|HH|mm/g, (token) => {
    switch (token) {
      case 'YYYY':
        return String(date.getFullYear())
      case 'MM':
        return pad(date.getMonth() + 1)
      case 'M':
        return String(date.getMonth() + 1)
      case 'DD':
        return pad(date.getDate())
      case 'D':
        return String(date.getDate())
      case 'HH':
        return pad(date.getHours())
      default:
        return pad(date.getMinutes())
    }
  })
}

export function isSameDay(a: Date, b: Date): boolean {
  return daysBetween(a, b) === 0
}

/** 6×7 grid of days for a month calendar, starting on Monday. */
export function monthGrid(year: number, month: number): Date[] {
  const first = startOfWeek(new Date(year, month, 1))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}
