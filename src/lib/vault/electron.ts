import type { MoodleSnapshot } from '../moodle'
import type { AppNotification } from '../notifications'
import type { ExamSnapshot } from '../ecampus'
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
  /** Saves a material of the last fetch into the vault (below `folder`); returns its path. */
  download(id: string, folder: string): Promise<{ path: string }>
  /** Steps of a running fetch (courses, materials per course). */
  onProgress(callback: (event: { done: number; total: number; text: string }) => void): () => void
  /** A fetch finished (also the regular background check). */
  onPolled(callback: () => void): () => void
}

export type CheckKind = 'moodle' | 'materials' | 'courseInfo' | 'grades' | 'examPlan'

export interface NotifySettings {
  system: boolean
  intervalMinutes: number
  /** Minutes per background check; 0 = only by hand. */
  intervals: Record<CheckKind, number>
}

export interface NotificationBridge {
  /** New notifications were added (counts per kind) – for the "what is new" message. */
  onAdded?(callback: (counts: Record<string, number>) => void): () => void
  list(): Promise<AppNotification[]>
  add(items: AppNotification[]): Promise<void>
  markRead(ids: string[] | 'all'): Promise<void>
  clear(): Promise<void>
  settings(): Promise<NotifySettings>
  setSettings(settings: NotifySettings): Promise<NotifySettings>
  onChange(callback: () => void): () => void
  /** A system notification was clicked (null = the summary banner). */
  onOpen(callback: (id: string | null) => void): () => void
}

export interface EcampusStatus {
  connected: boolean
  startUrl?: string
  examsUrl?: string
  resultsUrl?: string
  fetchedAt?: string
  count?: number
}

export interface EcampusBridge {
  status(): Promise<EcampusStatus>
  /** Opens the sign-in window; resolves when the results list was found. */
  connect(config: { startUrl: string; examsUrl: string }): Promise<ExamSnapshot>
  fetch(): Promise<ExamSnapshot>
  snapshot(): Promise<ExamSnapshot | null>
  disconnect(): Promise<void>
  onProgress(callback: (text: string) => void): () => void
  onPolled(callback: () => void): () => void
}

export interface WhisperStatus {
  server: string | null
  brew: boolean
  models: Array<{ id: string; label: string; size: number; downloaded: boolean }>
  running: boolean
}

export interface WhisperBridge {
  status(): Promise<WhisperStatus>
  install(): Promise<void>
  download(id: string): Promise<void>
  remove(id: string): Promise<void>
  transcribe(request: {
    model: string
    language: string
    fields: Record<string, string>
    audio: Uint8Array
  }): Promise<{ status: number; body: string }>
  onProgress(
    callback: (event: { kind: string; text?: string; done?: number; total?: number }) => void,
  ): () => void
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
  /** eCampus exam results (desktop). */
  ecampus?: EcampusBridge
  /** Menu bar commands (see src/app/commands.ts). */
  onMenu?(callback: (id: string) => void): () => void
  examPlan?: {
    fetch(url: string): Promise<{
      url: string
      name: string
      bytes: Uint8Array
      links: Array<{ url: string; text: string; date?: string }>
    }>
    onDue(callback: () => void): () => void
  }
  /** Local speech to text with whisper.cpp (desktop). */
  whisper?: WhisperBridge
  /** Asks the OS for microphone access (macOS); true if granted. */
  microphone?(): Promise<boolean>
  /** Sends one audio chunk to a transcription API (main process). */
  transcribe?(request: {
    url: string
    headers: Record<string, string>
    fields: Record<string, string>
    audio: Uint8Array
  }): Promise<{ status: number; body: string }>
  /** Opens a vault file with the system's default app (desktop). */
  openWithSystem?(path: string): Promise<void>
  /** AI command line tools (Claude Code, Codex, Gemini) – desktop app only. */
  aiCli?: CliBridge
  /** Git for the open folder (desktop app only). */
  git?: GitBridge
  /** Notification center storage and system banners (desktop app only). */
  notifications?: NotificationBridge
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
