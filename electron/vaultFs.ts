/**
 * File system access for one vault folder (main process only).
 * Every path is validated twice: syntactically (no "..", absolute paths, control chars) and
 * physically (the real path, after resolving symlinks, must stay inside the vault root).
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { isSafePath, normalizePath } from '../src/lib/path'
import { isIgnoredSegment, type VaultFile } from '../src/lib/vault/types'

export class VaultAccessError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VaultAccessError'
  }
}

export class FsVault {
  private constructor(readonly root: string) {}

  static async open(folder: string): Promise<FsVault> {
    const root = await fs.realpath(path.resolve(folder))
    const stat = await fs.stat(root)
    if (!stat.isDirectory()) throw new VaultAccessError('Not a folder')
    return new FsVault(root)
  }

  get name(): string {
    return path.basename(this.root)
  }

  private inside(absolute: string): boolean {
    return absolute === this.root || absolute.startsWith(this.root + path.sep)
  }

  /** Validates a vault path and returns the absolute path (symlinks of existing parents resolved). */
  async resolve(relative: string): Promise<string> {
    if (typeof relative !== 'string' || !isSafePath(relative))
      throw new VaultAccessError(`Unsafe path: ${String(relative)}`)
    const absolute = path.resolve(this.root, ...normalizePath(relative).split('/'))
    if (!this.inside(absolute)) throw new VaultAccessError(`Outside vault: ${relative}`)
    // Resolve the deepest existing ancestor: a symlink must not lead outside the vault.
    let probe = absolute
    for (;;) {
      try {
        const real = await fs.realpath(probe)
        if (!this.inside(real)) throw new VaultAccessError(`Symlink leaves vault: ${relative}`)
        break
      } catch (error) {
        if (error instanceof VaultAccessError) throw error
        const parent = path.dirname(probe)
        if (parent === probe) break
        probe = parent
      }
    }
    return absolute
  }

  async list(): Promise<VaultFile[]> {
    const out: VaultFile[] = []
    const walk = async (dir: string, prefix: string): Promise<void> => {
      let entries: import('node:fs').Dirent[]
      try {
        entries = await fs.readdir(dir, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name
        const absolute = path.join(dir, entry.name)
        if (entry.isSymbolicLink()) {
          // Follow symlinks only if they stay inside the vault.
          const real = await fs.realpath(absolute).catch(() => null)
          if (!real || !this.inside(real)) continue
          const stat = await fs.stat(real)
          if (stat.isDirectory()) {
            if (!isIgnoredSegment(entry.name)) await walk(real, rel)
          } else if (!entry.name.startsWith('.'))
            out.push({ path: rel, mtime: stat.mtimeMs, size: stat.size })
        } else if (entry.isDirectory()) {
          if (!isIgnoredSegment(entry.name)) await walk(absolute, rel)
        } else if (entry.isFile() && !entry.name.startsWith('.')) {
          const stat = await fs.stat(absolute)
          out.push({ path: rel, mtime: stat.mtimeMs, size: stat.size })
        }
      }
    }
    await walk(this.root, '')
    return out
  }

  async read(relative: string): Promise<string> {
    return fs.readFile(await this.resolve(relative), 'utf8')
  }

  async readBinary(relative: string): Promise<Uint8Array> {
    return new Uint8Array(await fs.readFile(await this.resolve(relative)))
  }

  /** Atomic write: temp file + rename, so a crash never leaves a half-written note. */
  async write(relative: string, content: string | Uint8Array): Promise<void> {
    if (typeof content !== 'string' && !(content instanceof Uint8Array))
      throw new VaultAccessError('Invalid content')
    const target = await this.resolve(relative)
    await fs.mkdir(path.dirname(target), { recursive: true })
    const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`)
    await fs.writeFile(temp, content)
    await fs.rename(temp, target)
  }

  async remove(relative: string): Promise<void> {
    const target = await this.resolve(relative)
    await fs.rm(target)
    await this.pruneEmptyDirs(path.dirname(target))
  }

  async rename(from: string, to: string): Promise<void> {
    const source = await this.resolve(from)
    const target = await this.resolve(to)
    if (source === target) return
    const exists = await fs.stat(target).then(
      () => true,
      () => false,
    )
    if (exists) throw new VaultAccessError(`Exists: ${to}`)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.rename(source, target)
    await this.pruneEmptyDirs(path.dirname(source))
  }

  /** Removes folders left empty by moves/deletes (never the root). */
  private async pruneEmptyDirs(dir: string): Promise<void> {
    let current = dir
    while (current !== this.root && this.inside(current)) {
      const entries = await fs.readdir(current).catch(() => null)
      if (!entries || entries.length > 0) return
      await fs.rmdir(current).catch(() => undefined)
      current = path.dirname(current)
    }
  }
}
