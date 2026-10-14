export type VaultKind = 'memory' | 'directory' | 'opfs' | 'electron'

export interface VaultFile {
  /** Relative path with "/" separators, e.g. "Studium/Module/Analysis.md". */
  path: string
  /** Last modification time in ms since epoch (0 if unknown). */
  mtime: number
  size: number
}

/**
 * Storage backend for a vault (a folder of Markdown files).
 * Implementations only need to handle *valid* relative paths: {@link guardVault}
 * validates every path before it reaches the adapter.
 */
export interface VaultAdapter {
  readonly kind: VaultKind
  /** Human readable name (folder name). */
  readonly name: string
  /** Lists all files recursively. Hidden folders except `.notiva` are skipped. */
  list(): Promise<VaultFile[]>
  read(path: string): Promise<string>
  readBinary(path: string): Promise<Uint8Array>
  /** Creates parent folders as needed. */
  write(path: string, content: string | Uint8Array): Promise<void>
  remove(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
}

export class VaultError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'exists' | 'unsupported' | 'permission' | 'io',
  ) {
    super(message)
    this.name = 'VaultError'
  }
}

/** Folders that are never listed (other apps' metadata, VCS, dependencies). */
export function isIgnoredSegment(segment: string): boolean {
  return (
    (segment.startsWith('.') && segment !== '.notiva') ||
    segment === 'node_modules' ||
    segment === '__pycache__' ||
    segment === 'venv'
  )
}
