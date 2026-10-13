import { isIgnoredSegment, VaultError, type VaultAdapter, type VaultFile, type VaultKind } from './types'

/**
 * Vault backed by a FileSystemDirectoryHandle. Works for
 * - a real folder picked with `showDirectoryPicker()` (Chromium desktop), and
 * - the Origin Private File System (`navigator.storage.getDirectory()`), available in all modern
 *   browsers including Safari on iOS.
 */
export class DirectoryVault implements VaultAdapter {
  constructor(
    private readonly root: FileSystemDirectoryHandle,
    readonly kind: Extract<VaultKind, 'directory' | 'opfs'> = 'directory',
    readonly name = root.name || 'Notiva',
  ) {}

  private async dir(segments: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let handle = this.root
    for (const segment of segments) {
      try {
        handle = await handle.getDirectoryHandle(segment, { create })
      } catch (error) {
        throw toVaultError(error, segments.join('/'))
      }
    }
    return handle
  }

  private async file(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const segments = path.split('/')
    const name = segments.pop()!
    const parent = await this.dir(segments, create)
    try {
      return await parent.getFileHandle(name, { create })
    } catch (error) {
      throw toVaultError(error, path)
    }
  }

  async list(): Promise<VaultFile[]> {
    const out: VaultFile[] = []
    const walk = async (handle: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      for await (const [name, child] of entries(handle)) {
        const path = prefix ? `${prefix}/${name}` : name
        if (child.kind === 'directory') {
          if (!isIgnoredSegment(name)) await walk(child as FileSystemDirectoryHandle, path)
        } else if (!name.startsWith('.')) {
          const file = await (child as FileSystemFileHandle).getFile()
          out.push({ path, mtime: file.lastModified, size: file.size })
        }
      }
    }
    await walk(this.root, '')
    return out
  }

  async read(path: string): Promise<string> {
    return (await (await this.file(path, false)).getFile()).text()
  }

  async readBinary(path: string): Promise<Uint8Array> {
    return new Uint8Array(await (await (await this.file(path, false)).getFile()).arrayBuffer())
  }

  async write(path: string, content: string | Uint8Array): Promise<void> {
    const handle = await this.file(path, true)
    const writable = await handle.createWritable()
    await writable.write(typeof content === 'string' ? content : new Blob([content as BlobPart]))
    await writable.close()
  }

  async remove(path: string): Promise<void> {
    const segments = path.split('/')
    const name = segments.pop()!
    const parent = await this.dir(segments, false)
    try {
      await parent.removeEntry(name)
    } catch (error) {
      throw toVaultError(error, path)
    }
  }

  async rename(from: string, to: string): Promise<void> {
    if (from === to) return
    const exists = await this.file(to, false).then(
      () => true,
      () => false,
    )
    if (exists) throw new VaultError(`Exists: ${to}`, 'exists')
    await this.write(to, await this.readBinary(from))
    await this.remove(from)
  }
}

async function* entries(handle: FileSystemDirectoryHandle): AsyncGenerator<[string, FileSystemHandle]> {
  // `entries()` is part of the spec but missing from older TS DOM typings.
  yield* (handle as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()
}

function toVaultError(error: unknown, path: string): VaultError {
  const name = (error as DOMException)?.name
  if (name === 'NotFoundError' || name === 'TypeMismatchError')
    return new VaultError(`Not found: ${path}`, 'not-found')
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new VaultError(`Permission denied: ${path}`, 'permission')
  return new VaultError(`${name ?? 'Error'}: ${path}`, 'io')
}

export function supportsFolderPicker(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export function supportsOpfs(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
}

export async function openOpfsVault(): Promise<DirectoryVault> {
  const root = await navigator.storage.getDirectory()
  const handle = await root.getDirectoryHandle('notiva-vault', { create: true })
  return new DirectoryVault(handle, 'opfs', 'Notiva')
}
