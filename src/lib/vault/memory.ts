import { isIgnoredSegment, VaultError, type VaultAdapter, type VaultFile } from './types'

interface Entry {
  data: Uint8Array
  mtime: number
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** In-memory vault for tests, the demo and as a cache. */
export class MemoryVault implements VaultAdapter {
  readonly kind = 'memory' as const
  private files = new Map<string, Entry>()
  private clock = 0

  constructor(
    readonly name = 'Demo',
    initial: Record<string, string> = {},
  ) {
    for (const [path, content] of Object.entries(initial)) this.files.set(path, this.entry(content))
  }

  private entry(content: string | Uint8Array): Entry {
    this.clock = Math.max(this.clock + 1, Date.now())
    return {
      data: typeof content === 'string' ? encoder.encode(content) : content.slice(),
      mtime: this.clock,
    }
  }

  private get(path: string): Entry {
    const entry = this.files.get(path)
    if (!entry) throw new VaultError(`Not found: ${path}`, 'not-found')
    return entry
  }

  async list(): Promise<VaultFile[]> {
    return [...this.files]
      .filter(([path]) => !path.split('/').slice(0, -1).some(isIgnoredSegment))
      .map(([path, e]) => ({ path, mtime: e.mtime, size: e.data.byteLength }))
  }

  async read(path: string): Promise<string> {
    return decoder.decode(this.get(path).data)
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return this.get(path).data.slice()
  }

  async write(path: string, content: string | Uint8Array): Promise<void> {
    this.files.set(path, this.entry(content))
  }

  async remove(path: string): Promise<void> {
    this.get(path)
    this.files.delete(path)
  }

  async rename(from: string, to: string): Promise<void> {
    const entry = this.get(from)
    if (from === to) return
    if (this.files.has(to)) throw new VaultError(`Exists: ${to}`, 'exists')
    this.files.delete(from)
    this.files.set(to, entry)
  }

  /** Snapshot of all text files (useful for tests and export). */
  async snapshot(): Promise<Record<string, string>> {
    return Object.fromEntries([...this.files].map(([p, e]) => [p, decoder.decode(e.data)]))
  }
}
