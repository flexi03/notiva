/**
 * The only bridge between the sandboxed renderer and the main process.
 * Exposes a fixed set of functions – never ipcRenderer itself.
 */
import { contextBridge, ipcRenderer } from 'electron'

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>

contextBridge.exposeInMainWorld('notiva', {
  platform: process.platform,
  pickFolder: () => invoke<string | null>('app:pickFolder'),
  lastFolder: () => invoke<string | null>('app:lastFolder'),
  openExternal: (url: string) => invoke<void>('app:openExternal', url),
  mcpInfo: () => invoke<{ command: string; args: string[]; env: Record<string, string> }>('app:mcpInfo'),
  aiRequest: (request: { url: string; method: string; headers: Record<string, string>; body?: string }) =>
    invoke<{ status: number; body: string }>('ai:request', request),
  onVaultChange: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  },
  vault: {
    open: (folder: string) => invoke<{ name: string }>('vault:open', folder),
    list: () => invoke('vault:list'),
    read: (path: string) => invoke<string>('vault:read', path),
    readBinary: (path: string) => invoke<Uint8Array>('vault:readBinary', path),
    write: (path: string, content: string | Uint8Array) => invoke<void>('vault:write', path, content),
    remove: (path: string) => invoke<void>('vault:remove', path),
    rename: (from: string, to: string) => invoke<void>('vault:rename', from, to),
  },
})
