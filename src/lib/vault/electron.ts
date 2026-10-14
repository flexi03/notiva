import type { VaultAdapter, VaultFile } from './types'

/** API exposed by electron/preload.ts via contextBridge. Paths are validated again in the main process. */
export interface NotivaBridge {
  platform: string
  pickFolder(): Promise<string | null>
  lastFolder(): Promise<string | null>
  vault: {
    open(folder: string): Promise<{ name: string }>
    list(): Promise<VaultFile[]>
    read(path: string): Promise<string>
    readBinary(path: string): Promise<Uint8Array>
    write(path: string, content: string | Uint8Array): Promise<void>
    remove(path: string): Promise<void>
    rename(from: string, to: string): Promise<void>
  }
  openExternal(url: string): Promise<void>
  /** Subscribes to file changes in the vault (other apps, sync). Returns an unsubscribe function. */
  onVaultChange(callback: () => void): () => void
}

declare global {
  interface Window {
    notiva?: NotivaBridge
  }
}

export function electronBridge(): NotivaBridge | null {
  return typeof window !== 'undefined' && window.notiva ? window.notiva : null
}

export class ElectronVault implements VaultAdapter {
  readonly kind = 'electron' as const
  constructor(
    private readonly bridge: NotivaBridge,
    readonly name: string,
  ) {}

  list = () => this.bridge.vault.list()
  read = (path: string) => this.bridge.vault.read(path)
  readBinary = (path: string) => this.bridge.vault.readBinary(path)
  write = (path: string, content: string | Uint8Array) => this.bridge.vault.write(path, content)
  remove = (path: string) => this.bridge.vault.remove(path)
  rename = (from: string, to: string) => this.bridge.vault.rename(from, to)
}
