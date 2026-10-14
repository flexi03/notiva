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
  aiCli: {
    detect: () => invoke('ai:cli:detect'),
    start: (request: object) => invoke<{ runId: number; command: string[] }>('ai:cli:start', request),
    cancel: (runId: number) => invoke<void>('ai:cli:cancel', runId),
    onEvent: (callback: (runId: number, payload: unknown) => void) => {
      const listener = (_e: unknown, runId: number, payload: unknown) => callback(runId, payload)
      ipcRenderer.on('ai:cli:event', listener)
      return () => ipcRenderer.removeListener('ai:cli:event', listener)
    },
  },
  aiRequest: (request: { url: string; method: string; headers: Record<string, string>; body?: string }) =>
    invoke<{ status: number; body: string }>('ai:request', request),
  onVaultChange: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on('vault:changed', listener)
    return () => ipcRenderer.removeListener('vault:changed', listener)
  },
  git: {
    state: () => invoke('git:state'),
    show: (rev: string, path: string) => invoke<string | null>('git:show', rev, path),
    commit: (message: string, paths: string[]) => invoke<string>('git:commit', message, paths),
    discard: (paths: string[]) => invoke<void>('git:discard', paths),
    log: (limit: number, path: string | null) => invoke('git:log', limit, path),
    commitFiles: (hash: string) => invoke('git:commitFiles', hash),
    init: () => invoke('git:init'),
    push: () => invoke<string>('git:push'),
    pull: () => invoke<string>('git:pull'),
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
