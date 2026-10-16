/**
 * What a commit contains, in groups a person would name: files moved into a folder ("17 Dateien
 * nach „Praktikum & Übung“ einsortiert"), new or deleted files per folder, Notiva's own data – and
 * the text changes the local model summarises one by one (it reads their changed lines).
 */
export interface ChangeLike {
  path: string
  /** git status ("added", "modified", "deleted", "renamed", "untracked") or a letter (A, M, D, R, ?) */
  status: string
  /** renames: the previous path */
  from?: string
  added?: number
  removed?: number
  excerpt?: string[]
}

export type ChangeKind = 'new' | 'deleted' | 'renamed' | 'modified'

export function changeKind(status: string): ChangeKind {
  if (/^(a|u|\?)/i.test(status)) return 'new'
  if (/^d/i.test(status)) return 'deleted'
  if (/^r/i.test(status)) return 'renamed'
  return 'modified'
}

export interface CommitGroups<T extends ChangeLike> {
  /** finished bullet points (moves, files per folder, Notiva data last) */
  bullets: string[]
  /** text changes with changed lines – for the model, biggest first */
  texts: T[]
}

const dirOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
const nameOf = (path: string) => path.slice(path.lastIndexOf('/') + 1)
/** "Studium/Unterlagen/Datenbanksysteme 2/Vorlesung" → "Datenbanksysteme 2 / Vorlesung" */
const place = (dir: string) => dir.split('/').slice(-2).join(' / ') || '/'

export function groupChanges<T extends ChangeLike>(changes: T[], de = true): CommitGroups<T> {
  const q = (s: string) => (de ? `„${s}“` : `“${s}”`)
  const meta = changes.filter((c) => c.path.startsWith('.notiva/'))
  const rest = changes.filter((c) => !c.path.startsWith('.notiva/'))

  // Moves: renames, or a deleted and a new file with the same name.
  const moves: Array<{ from: string; to: string }> = []
  const used = new Set<T>()
  for (const c of rest)
    if (changeKind(c.status) === 'renamed' && c.from) {
      moves.push({ from: c.from, to: c.path })
      used.add(c)
    }
  const deleted = rest.filter((c) => !used.has(c) && changeKind(c.status) === 'deleted')
  for (const c of rest) {
    if (used.has(c) || changeKind(c.status) !== 'new') continue
    const twin = deleted.find((d) => !used.has(d) && nameOf(d.path) === nameOf(c.path))
    if (!twin) continue
    moves.push({ from: twin.path, to: c.path })
    used.add(c)
    used.add(twin)
  }

  const bullets: string[] = []
  const byRoute = new Map<string, number>()
  for (const m of moves) {
    const key = `${dirOf(m.from)}\u0000${dirOf(m.to)}`
    byRoute.set(key, (byRoute.get(key) ?? 0) + 1)
  }
  for (const [key, count] of [...byRoute].sort((a, b) => b[1] - a[1])) {
    const [from, to] = key.split('\u0000') as [string, string]
    // Into a sub folder of where they were: "einsortiert"; elsewhere: "verschoben".
    const into = to.startsWith(`${from}/`)
    const target = into ? to.slice(from.length + 1) : place(to)
    if (de)
      bullets.push(
        `${count === 1 ? '1 Datei' : `${count} Dateien`} in ${q(place(from))} nach ${q(target)} ${into ? 'einsortiert' : 'verschoben'}`,
      )
    else
      bullets.push(
        `${count === 1 ? '1 file' : `${count} files`} in ${q(place(from))} ${into ? 'sorted into' : 'moved to'} ${q(target)}`,
      )
  }

  // Text changes with their lines go to the model; everything else is counted per folder.
  const texts: T[] = []
  const counted = new Map<string, string[]>()
  for (const c of rest) {
    if (used.has(c)) continue
    const kind = changeKind(c.status)
    if (c.excerpt?.length && kind !== 'deleted') {
      texts.push(c)
      continue
    }
    const key = `${kind}\u0000${dirOf(c.path)}`
    counted.set(key, [...(counted.get(key) ?? []), c.path])
  }
  for (const [key, paths] of [...counted].sort((a, b) => b[1].length - a[1].length)) {
    const [kind, dir] = key.split('\u0000') as [ChangeKind, string]
    const where = q(place(dir))
    const what =
      paths.length === 1
        ? q(nameOf(paths[0]!).replace(/\.md$/, ''))
        : de
          ? `${paths.length} Dateien`
          : `${paths.length} files`
    const one = paths.length === 1
    bullets.push(
      de
        ? kind === 'new'
          ? one
            ? `Neue Datei ${what} in ${where}`
            : `${paths.length} neue Dateien in ${where}`
          : kind === 'deleted'
            ? `${what} in ${where} gelöscht`
            : `${what} in ${where} geändert`
        : kind === 'new'
          ? `Added ${what} in ${where}`
          : kind === 'deleted'
            ? `Deleted ${what} in ${where}`
            : `Changed ${what} in ${where}`,
    )
  }
  if (meta.length)
    bullets.push(
      de ? 'Notiva-Daten aktualisiert (Unterlagen-Zuordnung, Einstellungen)' : 'Updated Notiva data',
    )
  texts.sort((a, b) => (b.added ?? 0) + (b.removed ?? 0) - ((a.added ?? 0) + (a.removed ?? 0)))
  return { bullets, texts }
}
