/**
 * Daily backups of the folder, outside of it – like Time Machine: every snapshot is a complete,
 * normal folder you can open in the Finder; files unchanged since the last snapshot are hard links
 * to it (no extra space). Links point at the previous *snapshot*, never at the vault, so editing a
 * file later can never change a backup. A snapshot is written to "<name>.partial" and renamed when
 * complete – there are no half backups.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

export interface BackupSettings {
  enabled: boolean
  /** Parent folder; snapshots go to "<folder>/<vault name>/<YYYY-MM-DD HHmm>" */
  folder: string
  /** Also the folder's own Git history (.git) – off by default, it can be large. */
  withGit: boolean
}

export interface Snapshot {
  name: string
  path: string
  /** ISO time it was made */
  date: string
  files: number
  bytes: number
}

const META = '.notiva-backup.json'
/** Never backed up: caches and things that can be rebuilt. */
const SKIP = /(^|\/)(\.DS_Store|node_modules|\.venv|__pycache__)$|^\.notiva\/(cache|trash)$/

const pad = (n: number) => String(n).padStart(2, '0')
export const snapshotName = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`

/** Where the snapshots of one vault go. */
export const backupRoot = (settings: BackupSettings, vaultRoot: string) =>
  path.join(settings.folder, path.basename(vaultRoot))

/** Complete snapshots, newest first. */
export async function listSnapshots(root: string): Promise<Snapshot[]> {
  const names = await fs.readdir(root).catch(() => [] as string[])
  const out: Snapshot[] = []
  for (const name of names) {
    if (!/^\d{4}-\d\d-\d\d \d{4}$/.test(name)) continue
    try {
      const meta = JSON.parse(await fs.readFile(path.join(root, name, META), 'utf8')) as Partial<Snapshot>
      out.push({
        name,
        path: path.join(root, name),
        date: String(meta.date ?? ''),
        files: Number(meta.files ?? 0),
        bytes: Number(meta.bytes ?? 0),
      })
    } catch {
      // Without its note it is not a complete snapshot.
    }
  }
  return out.sort((a, b) => b.name.localeCompare(a.name))
}

/**
 * What to delete: the newest snapshot of each of the last `days` days stays, older ones only the
 * first of each month (pure – names "YYYY-MM-DD HHmm", newest first or in any order).
 */
export function snapshotsToDelete(names: string[], now: Date, days = 14): string[] {
  const sorted = [...names].sort().reverse()
  const cutoff = new Date(now.getTime() - days * 86_400_000)
  const cut = snapshotName(cutoff).slice(0, 10)
  const keep = new Set<string>()
  const seenDay = new Set<string>()
  const seenMonth = new Map<string, string>()
  for (const name of sorted) {
    const day = name.slice(0, 10)
    if (day >= cut) {
      if (!seenDay.has(day)) keep.add(name)
      seenDay.add(day)
    } else {
      // The month's first snapshot (sorted newest first: keep overwriting).
      seenMonth.set(day.slice(0, 7), name)
    }
  }
  for (const name of seenMonth.values()) keep.add(name)
  if (sorted[0]) keep.add(sorted[0])
  return sorted.filter((n) => !keep.has(n))
}

/** Makes a snapshot of `vaultRoot` below `root`; `onProgress(done, total, file)`. */
export async function createSnapshot(
  vaultRoot: string,
  root: string,
  {
    withGit = false,
    now = new Date(),
    onProgress = () => undefined,
  }: {
    withGit?: boolean
    now?: Date
    onProgress?: (done: number, total: number, file: string) => void
  } = {},
): Promise<Snapshot> {
  const files: string[] = []
  const walk = async (rel: string) => {
    for (const entry of await fs.readdir(path.join(vaultRoot, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${entry.name}` : entry.name
      if (SKIP.test(child) || (child === '.git' && !withGit)) continue
      if (entry.isDirectory()) await walk(child)
      else if (entry.isFile()) files.push(child)
      // Symbolic links and the like are left out.
    }
  }
  await walk('')
  await fs.mkdir(root, { recursive: true })
  const previous = (await listSnapshots(root))[0]
  let name = snapshotName(now)
  for (let i = 2; await exists(path.join(root, name)); i++) name = `${snapshotName(now).slice(0, 15)}${i}`
  const partial = path.join(root, `${name}.partial`)
  await fs.rm(partial, { recursive: true, force: true })
  let bytes = 0
  for (const [i, rel] of files.entries()) {
    onProgress(i, files.length, rel)
    const from = path.join(vaultRoot, rel)
    const to = path.join(partial, rel)
    await fs.mkdir(path.dirname(to), { recursive: true })
    const stat = await fs.stat(from)
    bytes += stat.size
    const before = previous ? path.join(previous.path, rel) : null
    const old = before ? await fs.stat(before).catch(() => null) : null
    // Unchanged since the last snapshot: a hard link to it (same file, no extra space).
    if (old && old.size === stat.size && Math.abs(old.mtimeMs - stat.mtimeMs) < 1) {
      try {
        await fs.link(before!, to)
        continue
      } catch {
        // Other volume or file system without links: copy.
      }
    }
    await fs.copyFile(from, to)
    await fs.utimes(to, stat.atime, stat.mtime)
  }
  onProgress(files.length, files.length, '')
  const snapshot: Snapshot = {
    name,
    path: path.join(root, name),
    date: now.toISOString(),
    files: files.length,
    bytes,
  }
  await fs.writeFile(
    path.join(partial, META),
    JSON.stringify({ date: snapshot.date, files: snapshot.files, bytes }),
  )
  await fs.rename(partial, snapshot.path)
  for (const old of snapshotsToDelete(
    (await listSnapshots(root)).map((s) => s.name),
    now,
  ))
    await fs.rm(path.join(root, old), { recursive: true, force: true })
  return snapshot
}

/** A snapshot back as a new folder next to the vault (nothing is overwritten); returns its path. */
export async function restoreSnapshot(snapshotPath: string, vaultRoot: string): Promise<string> {
  const base = `${vaultRoot} (Sicherung ${path.basename(snapshotPath)})`
  let target = base
  for (let i = 2; await exists(target); i++) target = `${base} ${i}`
  await fs.cp(snapshotPath, target, { recursive: true, preserveTimestamps: true })
  await fs.rm(path.join(target, META), { force: true })
  return target
}

const exists = (p: string) =>
  fs.access(p).then(
    () => true,
    () => false,
  )
