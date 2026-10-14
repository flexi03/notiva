/**
 * Vault paths are always relative, use "/" as separator and never leave the vault root.
 * Every adapter validates paths with {@link assertSafePath} before touching storage.
 */

export class UnsafePathError extends Error {
  constructor(path: string) {
    super(`Unsafe vault path: ${JSON.stringify(path)}`)
    this.name = 'UnsafePathError'
  }
}

/** Collapses duplicate slashes and strips leading/trailing slashes and "./" segments. */
export function normalizePath(path: string): string {
  return path
    .split('/')
    .filter((part) => part !== '' && part !== '.')
    .join('/')
}

export function isSafePath(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0 || path.length > 1024) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\\]/.test(path)) return false
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false
  return normalizePath(path)
    .split('/')
    .every((part) => part !== '..' && part.length > 0)
}

export function assertSafePath(path: string): string {
  if (!isSafePath(path)) throw new UnsafePathError(path)
  return normalizePath(path)
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.filter(Boolean).join('/'))
}

export function dirname(path: string): string {
  const normalized = normalizePath(path)
  const index = normalized.lastIndexOf('/')
  return index === -1 ? '' : normalized.slice(0, index)
}

export function basename(path: string, ext?: string): string {
  const normalized = normalizePath(path)
  const name = normalized.slice(normalized.lastIndexOf('/') + 1)
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name
}

export function extname(path: string): string {
  const name = basename(path)
  const index = name.lastIndexOf('.')
  return index <= 0 ? '' : name.slice(index)
}

/** True if `path` equals `folder` or lies inside it. */
export function isInside(path: string, folder: string): boolean {
  const p = normalizePath(path)
  const f = normalizePath(folder)
  return f === '' || p === f || p.startsWith(`${f}/`)
}

const RESERVED_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** Turns a page title into a file name that is valid on macOS, Windows, Linux, iOS and Android. */
export function toFileName(title: string): string {
  const cleaned = title
    .normalize('NFC')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*#^[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    // Leading dots would hide the file, trailing dots/spaces break Windows; trim them together.
    .replace(/^[. ]+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 120)
  if (cleaned === '' || RESERVED_NAMES.test(cleaned)) return cleaned === '' ? 'Unbenannt' : `${cleaned}_`
  return cleaned
}

/** Returns `candidate` or the first free variant "Name 2", "Name 3", … according to `exists`. */
export function uniquePath(candidate: string, exists: (path: string) => boolean): string {
  if (!exists(candidate)) return candidate
  const ext = extname(candidate)
  const dir = dirname(candidate)
  const stem = basename(candidate, ext)
  for (let i = 2; ; i++) {
    const next = joinPath(dir, `${stem} ${i}${ext}`)
    if (!exists(next)) return next
  }
}
