import type { MoodleSnapshot } from '../moodle'
import type { VaultAdapter, VaultFile } from './types'

export type GitStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
export interface GitChange {
  path: string
  status: GitStatus
  from?: string
}
export interface GitState {
  isRepo: boolean
  branch: string | null
  head: string | null
  upstream: string | null
  ahead: number
  behind: number
  changes: GitChange[]
}
export interface GitCommit {
  hash: string
  short: string
  author: string
  date: string
  subject: string
}
export interface GitBridge {
  state(): Promise<GitState>
  show(rev: string, path: string): Promise<string | null>
  commit(message: string, paths: string[]): Promise<string>
  discard(paths: string[]): Promise<void>
  log(limit: number, path: string | null): Promise<GitCommit[]>
  commitFiles(hash: string): Promise<GitChange[]>
  init(): Promise<GitState>
  push(): Promise<string>
  pull(): Promise<string>
}

export type CliId = 'claude' | 'codex' | 'gemini'
export interface CliInfo {
  id: CliId
  path: string
  version: string
}
export interface CliBridge {
  detect(): Promise<CliInfo[]>
  start(request: {
    cli: CliId
    prompt: string
    system: string
    model: string
    sessionId: string | null
    allowWrites: boolean
  }): Promise<{ runId: number; command: string[] }>
  cancel(runId: number): Promise<void>
  /** stdout lines (`line`) and the end of a run (`exit`, `stderr`). */
  onEvent(
    callback: (runId: number, payload: { line?: string; exit?: number | null; stderr?: string }) => void,
  ): () => void
}

export interface McpLaunch {
  command: string
  args: string[]
  env: Record<string, string>
}

export interface MoodleStatus {
  connected: boolean
  mode?: 'webservice' | 'calendar'
  site?: string
  user?: string
  /** false: no keychain – the access is kept only until the app closes. */
  remembered?: boolean
}

export interface MoodleBridge {
  status(): Promise<MoodleStatus>
  connect(
    request:
      | { mode: 'browser'; site: string }
      | { mode: 'login'; site: string; username: string; password: string }
      | { mode: 'token'; site: string; token: string }
      | { mode: 'calendar'; url: string },
  ): Promise<MoodleStatus>
  disconnect(): Promise<MoodleStatus>
  fetch(): Promise<MoodleSnapshot>
  /** The last fetched data (null if never fetched or not connected). */
  snapshot(): Promise<MoodleSnapshot | null>
  /** Opens a page of the connected Moodle in an app window (with the login) or the browser. */
  open(url: string, external: boolean): Promise<void>
}

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
  /** AI command line tools (Claude Code, Codex, Gemini) – desktop app only. */
  aiCli?: CliBridge
  /** Git for the open folder (desktop app only). */
  git?: GitBridge
  /** Moodle courses and deadlines (desktop app only). */
  moodle?: MoodleBridge
  /** Command line for AI apps to start the MCP server on the open folder. */
  mcpInfo?(): Promise<McpLaunch>
  /** HTTP for the AI assistant (the renderer itself has no network access). */
  aiRequest?(request: {
    url: string
    method: string
    headers: Record<string, string>
    body?: string
  }): Promise<{ status: number; body: string }>
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
