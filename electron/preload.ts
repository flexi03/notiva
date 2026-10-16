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
  openInWindow: (url: string) => invoke<void>('app:openInWindow', url),
  openWithSystem: (path: string) => invoke<void>('vault:openWithSystem', path),
  microphone: () => invoke<boolean>('app:microphone'),
  update: {
    status: () => invoke('update:status'),
    check: () => invoke('update:check'),
    install: () => invoke<void>('update:install'),
    onStatus(callback: (status: unknown) => void) {
      const listener = (_e: unknown, s: unknown) => callback(s)
      ipcRenderer.on('update:status', listener)
      return () => ipcRenderer.removeListener('update:status', listener)
    },
  },
  examPlan: {
    fetch: (url: string) => invoke('examplan:fetch', url),
    onDue: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on('examplan:due', listener)
      return () => ipcRenderer.removeListener('examplan:due', listener)
    },
  },
  ecampus: {
    status: () => invoke('ecampus:status'),
    connect: (config: object) => invoke('ecampus:connect', config),
    fetch: () => invoke('ecampus:fetch'),
    snapshot: () => invoke('ecampus:snapshot'),
    disconnect: () => invoke<void>('ecampus:disconnect'),
    onProgress(callback: (text: string) => void) {
      const listener = (_e: unknown, text: string) => callback(text)
      ipcRenderer.on('ecampus:progress', listener)
      return () => ipcRenderer.removeListener('ecampus:progress', listener)
    },
    onPolled(callback: () => void) {
      const listener = () => callback()
      ipcRenderer.on('ecampus:polled', listener)
      return () => ipcRenderer.removeListener('ecampus:polled', listener)
    },
  },
  localModel: {
    status: () => invoke('localModel:status'),
    install: () => invoke<'installed' | 'started'>('localModel:install'),
    download: (id: string) => invoke<void>('localModel:download', id),
    remove: (id: string) => invoke<void>('localModel:remove', id),
    complete: (
      id: string,
      system: string,
      prompt: string,
      maxTokens?: number,
      examples?: Array<[string, string]>,
    ) => invoke<string>('localModel:complete', id, system, prompt, maxTokens, examples),
    onProgress(callback: (event: { kind: string; text?: string; done?: number; total?: number }) => void) {
      const listener = (_e: unknown, event: { kind: string; text?: string; done?: number; total?: number }) =>
        callback(event)
      ipcRenderer.on('localModel:progress', listener)
      return () => ipcRenderer.removeListener('localModel:progress', listener)
    },
  },
  whisper: {
    status: () => invoke('whisper:status'),
    install: () => invoke<void>('whisper:install'),
    download: (id: string) => invoke<void>('whisper:download', id),
    remove: (id: string) => invoke<void>('whisper:remove', id),
    transcribe: (request: {
      model: string
      language: string
      fields: Record<string, string>
      audio: Uint8Array
    }) => invoke<{ status: number; body: string }>('whisper:transcribe', request),
    onProgress(callback: (event: { kind: string; text?: string; done?: number; total?: number }) => void) {
      const listener = (_e: unknown, event: { kind: string; text?: string; done?: number; total?: number }) =>
        callback(event)
      ipcRenderer.on('whisper:progress', listener)
      return () => ipcRenderer.removeListener('whisper:progress', listener)
    },
  },
  transcribe: (request: {
    url: string
    headers: Record<string, string>
    fields: Record<string, string>
    audio: Uint8Array
  }) => invoke<{ status: number; body: string }>('transcribe', request),
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
  moodle: {
    status: () => invoke('moodle:status'),
    connect: (request: object) => invoke('moodle:connect', request),
    disconnect: () => invoke('moodle:disconnect'),
    fetch: () => invoke('moodle:fetch'),
    snapshot: () => invoke('moodle:snapshot'),
    open: (url: string, external: boolean) => invoke<void>('moodle:open', url, external),
    download: (id: string, folder: string, as?: string) =>
      invoke<{ path: string }>('moodle:download', id, folder, as),
    onProgress(callback: (event: { done: number; total: number; text: string }) => void) {
      const listener = (_e: unknown, event: { done: number; total: number; text: string }) => callback(event)
      ipcRenderer.on('moodle:progress', listener)
      return () => ipcRenderer.removeListener('moodle:progress', listener)
    },
    onPolled(callback: () => void) {
      const listener = () => callback()
      ipcRenderer.on('moodle:polled', listener)
      return () => ipcRenderer.removeListener('moodle:polled', listener)
    },
  },
  syncSchedule: () => invoke<Record<string, number | null>>('sync:schedule'),
  onMenu: (callback: (id: string) => void) => {
    const listener = (_e: unknown, id: string) => callback(id)
    ipcRenderer.on('menu:command', listener)
    return () => ipcRenderer.removeListener('menu:command', listener)
  },
  code: {
    init: (folder: string) => invoke<void>('code:init', folder),
    open: (folder: string, how: 'editor' | 'finder' | 'terminal') => invoke<void>('code:open', folder, how),
    clone: (url: string, target: string) => invoke<void>('code:clone', url, target),
    cloneInTerminal: (url: string, target: string) => invoke<void>('code:cloneInTerminal', url, target),
    hasToken: (host: string) => invoke<boolean>('code:hasToken', host),
    setToken: (host: string, token: string | null) => invoke<boolean>('code:setToken', host, token),
    onCloneProgress: (callback: (percent: number) => void) => {
      const listener = (_e: unknown, percent: number) => callback(percent)
      ipcRenderer.on('code:cloneProgress', listener)
      return () => ipcRenderer.removeListener('code:cloneProgress', listener)
    },
  },
  terminal: {
    start: (key: string, folder: string, cols: number, rows: number) =>
      invoke<{ id: number; replay: string }>('term:start', key, folder, cols, rows),
    clear: (key: string) => invoke<void>('term:clear', key),
    write: (id: number, data: string) => invoke<void>('term:write', id, data),
    resize: (id: number, cols: number, rows: number) => invoke<void>('term:resize', id, cols, rows),
    stop: (id: number) => invoke<void>('term:stop', id),
    onData: (callback: (id: number, data: string) => void) => {
      const listener = (_e: unknown, id: number, data: string) => callback(id, data)
      ipcRenderer.on('term:data', listener)
      return () => ipcRenderer.removeListener('term:data', listener)
    },
    onExit: (callback: (id: number, code: number) => void) => {
      const listener = (_e: unknown, id: number, code: number) => callback(id, code)
      ipcRenderer.on('term:exit', listener)
      return () => ipcRenderer.removeListener('term:exit', listener)
    },
  },
  notifications: {
    test: () => invoke<string>('notifications:test'),
    openSystemSettings: () => invoke<void>('notifications:openSystemSettings'),
    onAdded: (callback: (counts: Record<string, number>) => void) => {
      const listener = (_e: unknown, counts: Record<string, number>) => callback(counts)
      ipcRenderer.on('notifications:added', listener)
      return () => ipcRenderer.removeListener('notifications:added', listener)
    },
    list: () => invoke('notifications:list'),
    add: (items: object[]) => invoke<void>('notifications:add', items),
    markRead: (ids: string[] | 'all') => invoke<void>('notifications:markRead', ids),
    clear: () => invoke<void>('notifications:clear'),
    settings: () => invoke('notifications:settings'),
    setSettings: (settings: object) => invoke('notifications:setSettings', settings),
    onChange(callback: () => void) {
      const listener = () => callback()
      ipcRenderer.on('notifications:changed', listener)
      return () => ipcRenderer.removeListener('notifications:changed', listener)
    },
    onOpen(callback: (id: string | null) => void) {
      const listener = (_e: unknown, id: string | null) => callback(id)
      ipcRenderer.on('notifications:open', listener)
      return () => ipcRenderer.removeListener('notifications:open', listener)
    },
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
    install: () => invoke<'installing' | 'opened'>('git:install'),
    onProgress(callback: (event: { done: number; total: number; file?: string }) => void) {
      const listener = (_e: unknown, event: { done: number; total: number; file?: string }) => callback(event)
      ipcRenderer.on('git:progress', listener)
      return () => ipcRenderer.removeListener('git:progress', listener)
    },
    setIdentity: (name: string, email: string) => invoke<void>('git:setIdentity', name, email),
  },
  restart: () => invoke<void>('app:restart'),
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
