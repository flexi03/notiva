/**
 * The shelf ("Ablage"): a folder in the vault for things put aside quickly – dropped files,
 * pasted text. Plain files, so they sync and can be moved into pages later. Pure helpers.
 */

export const SHELF_FOLDER = 'Ablage'

const pad = (n: number) => String(n).padStart(2, '0')

/** "2026-10-15 14-05 Erste Worte" – sorts by time, readable in Finder. */
export function textItemName(text: string, now: Date): string {
  const words = text
    .replace(/[\\/:*?"<>|#^[\]\n\r\t]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join(' ')
    .slice(0, 48)
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`
  return words ? `${stamp} ${words}` : stamp
}

/** A free path in the shelf for `name` ("Bild.png" → "Bild 2.png" if taken). */
export function freeShelfPath(name: string, taken: (path: string) => boolean): string {
  const clean = name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Datei'
  const dot = clean.lastIndexOf('.')
  const base = dot > 0 ? clean.slice(0, dot) : clean
  const ext = dot > 0 ? clean.slice(dot) : ''
  for (let i = 1; ; i++) {
    const path = `${SHELF_FOLDER}/${i === 1 ? base : `${base} ${i}`}${ext}`
    if (!taken(path)) return path
  }
}
