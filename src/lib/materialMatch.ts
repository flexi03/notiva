/**
 * Moodle files that are already in the folder, but not in Notiva's list (saved by hand, by an older
 * version, or moved outside Notiva): found by file name. Same size → the same file; another size →
 * probably a newer version of it. Pure logic – the app shows the pairs and asks before using them.
 */

export interface LocalFile {
  path: string
  size: number
}

export interface MaterialLike {
  id: string
  filename?: string
  size?: number
}

export interface MaterialMatch {
  id: string
  /** the user's file */
  path: string
  /** "same": name and size match; "version": same name, other size */
  kind: 'same' | 'version'
}

/** File name without folders, Unicode-normalised (macOS stores "ü" decomposed) and lower case. */
export const fileKey = (name: string) =>
  name
    .slice(name.lastIndexOf('/') + 1)
    .normalize('NFC')
    .toLowerCase()

/** "Skript (neu 2026-10-16).pdf" – a downloaded newer version waiting for a decision. */
const isPendingVersion = (path: string) => /\(neu \d{4}-\d{2}-\d{2}\)\.[^.]+$/.test(path)

/**
 * For each material, the user's file of the same name (preferring `near` – e.g. the module's
 * material folder – then the shortest path). Newer versions waiting for a decision never count.
 */
export function matchExisting<M extends MaterialLike>(
  materials: M[],
  files: LocalFile[],
  near: (material: M) => string = () => '',
): MaterialMatch[] {
  const byName = new Map<string, LocalFile[]>()
  for (const f of files) {
    if (isPendingVersion(f.path)) continue
    const key = fileKey(f.path)
    byName.set(key, [...(byName.get(key) ?? []), f])
  }
  const out: MaterialMatch[] = []
  for (const m of materials) {
    if (!m.filename) continue
    const candidates = byName.get(fileKey(m.filename))
    if (!candidates?.length) continue
    const prefix = near(m)
    const ranked = [...candidates].sort(
      (a, b) =>
        Number(!!prefix && b.path.startsWith(prefix)) - Number(!!prefix && a.path.startsWith(prefix)) ||
        a.path.length - b.path.length ||
        a.path.localeCompare(b.path),
    )
    const same = m.size === undefined ? undefined : ranked.find((f) => f.size === m.size)
    if (same) out.push({ id: m.id, path: same.path, kind: 'same' })
    // Another size: only when there is exactly one file of that name – otherwise it is a guess.
    else if (ranked.length === 1) out.push({ id: m.id, path: ranked[0]!.path, kind: 'version' })
  }
  return out
}
