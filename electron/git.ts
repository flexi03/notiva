/**
 * Git for the open vault (main process only). Runs the git CLI with a fixed set of commands –
 * no shell, every path checked by FsVault and passed as a literal pathspec – so the renderer can
 * show changes, diffs and history and commit like in a code editor.
 */
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FsVault } from './vaultFs'

export type GitStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'

export interface GitChange {
  /** Vault-relative path. */
  path: string
  status: GitStatus
  /** For renames: the previous vault-relative path. */
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

const HASH = /^[0-9a-f]{4,40}$/i

export class GitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GitError'
  }
}

/** add/commit of many large files may take minutes. */
const WRITE_TIMEOUT = 15 * 60_000
/** Running write operation per repository (Notiva opens a new GitRepo per request). */
const queues = new Map<string, Promise<unknown>>()

function run(cwd: string, args: string[], options: { allowFail?: boolean; timeout?: number } = {}) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    execFile(
      // E2E tests: a missing git (NOTIVA_E2E_GIT) shows the "install Git" fix.
      process.env.NOTIVA_E2E_GIT ?? 'git',
      args,
      {
        cwd,
        timeout: options.timeout ?? 30_000,
        maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0', LC_ALL: 'C' },
      },
      (error, stdout, stderr) => {
        const code = error ? (typeof error.code === 'number' ? error.code : 1) : 0
        if (error && (error as NodeJS.ErrnoException).code === 'ENOENT')
          return reject(new GitError('Git ist nicht installiert.'))
        if (code !== 0 && !options.allowFail)
          return reject(
            new GitError(
              String(stderr || error?.message)
                .trim()
                .slice(0, 800),
            ),
          )
        resolve({ code, stdout: String(stdout), stderr: String(stderr) })
      },
    )
  })
}

/** ":(literal)./path" – never interpreted as glob or magic pathspec. */
const spec = (relative: string) => `:(literal)./${relative}`

export class GitRepo {
  private constructor(
    private readonly vault: FsVault,
    /** The vault folder's path inside the repository ("" when the vault is the repo root). */
    private readonly prefix: string,
  ) {}

  /** null when the vault folder is not inside a git repository. */
  static async open(vault: FsVault): Promise<GitRepo | null> {
    const result = await run(vault.root, ['rev-parse', '--show-prefix'], { allowFail: true })
    if (result.code !== 0) return null
    return new GitRepo(vault, result.stdout.trim())
  }

  static async init(vault: FsVault): Promise<GitRepo> {
    await run(vault.root, ['init'])
    try {
      await vault.read('.gitignore')
    } catch {
      await vault.write('.gitignore', '.notiva/trash/\n.DS_Store\n')
    }
    const repo = await GitRepo.open(vault)
    if (!repo) throw new GitError('git init fehlgeschlagen')
    return repo
  }

  /** Repo-relative path → vault-relative path (null if outside the vault folder). */
  private toVault(repoPath: string): string | null {
    if (!this.prefix) return repoPath
    return repoPath.startsWith(this.prefix) ? repoPath.slice(this.prefix.length) : null
  }

  private async checked(paths: unknown): Promise<string[]> {
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > 2000)
      throw new GitError('Keine Dateien')
    for (const p of paths) await this.vault.resolve(p as string)
    return paths as string[]
  }

  async state(): Promise<GitState> {
    const status = await run(this.vault.root, [
      'status',
      '--porcelain=v1',
      '-z',
      '-b',
      '--untracked-files=all',
      '--',
      '.',
    ])
    const head = await run(this.vault.root, ['rev-parse', '--verify', '-q', 'HEAD'], { allowFail: true })
    const entries = status.stdout.split('\0')
    const state: GitState = {
      isRepo: true,
      branch: null,
      head: head.code === 0 ? head.stdout.trim() : null,
      upstream: null,
      ahead: 0,
      behind: 0,
      changes: [],
    }
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]!
      if (!entry) continue
      if (entry.startsWith('## ')) {
        const branch = /^## (?:No commits yet on )?([^.\s]+)(?:\.\.\.(\S+))?(?: \[(.*)\])?/.exec(entry)
        state.branch = branch?.[1] ?? null
        state.upstream = branch?.[2] ?? null
        state.ahead = Number(/ahead (\d+)/.exec(branch?.[3] ?? '')?.[1] ?? 0)
        state.behind = Number(/behind (\d+)/.exec(branch?.[3] ?? '')?.[1] ?? 0)
        continue
      }
      const xy = entry.slice(0, 2)
      const repoPath = entry.slice(3)
      let from: string | undefined
      if (xy.includes('R') || xy.includes('C')) from = entries[++i]
      const path = this.toVault(repoPath)
      if (path === null || path.startsWith('.notiva/trash/')) continue
      const status: GitStatus =
        xy === '??'
          ? 'untracked'
          : xy.includes('D')
            ? 'deleted'
            : xy.includes('R')
              ? 'renamed'
              : xy.includes('A')
                ? 'added'
                : 'modified'
      const fromVault = from ? this.toVault(from) : null
      state.changes.push({ path, status, ...(fromVault ? { from: fromVault } : {}) })
    }
    state.changes.sort((a, b) => a.path.localeCompare(b.path))
    return state
  }

  /** File content at a revision ("HEAD", a hash, or "<hash>^"), null if it did not exist there. */
  async show(rev: string, relative: string): Promise<string | null> {
    const base = rev.endsWith('^') ? rev.slice(0, -1) : rev
    if (base !== 'HEAD' && !HASH.test(base)) throw new GitError('Ungültige Revision')
    await this.vault.resolve(relative)
    const result = await run(this.vault.root, ['show', `${rev}:./${relative}`], { allowFail: true })
    return result.code === 0 ? result.stdout : null
  }

  async commit(message: unknown, paths: unknown): Promise<string> {
    if (typeof message !== 'string' || !message.trim()) throw new GitError('Commit-Nachricht fehlt')
    if (message.length > 50_000) throw new GitError('Commit-Nachricht ist zu lang (max. 50.000 Zeichen)')
    const files = await this.checked(paths)
    return this.writing(async () => {
      // Many large files (e.g. lecture PDFs) take a while – never kill git halfway (stale lock).
      await run(this.vault.root, ['add', '-A', '--', ...files.map(spec)], { timeout: WRITE_TIMEOUT })
      await run(this.vault.root, ['commit', '-m', message.trim(), '--', ...files.map(spec)], {
        timeout: WRITE_TIMEOUT,
      })
      return (await run(this.vault.root, ['rev-parse', 'HEAD'])).stdout.trim()
    })
  }

  /**
   * Write operations one after another; if the index is locked, wait a little – and remove a lock
   * that is clearly left over (older than 10 minutes, e.g. after a crash).
   */
  private writing<T>(work: () => Promise<T>): Promise<T> {
    const root = this.vault.root
    const next = (queues.get(root) ?? Promise.resolve()).then(async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await work()
        } catch (error) {
          if (!(error instanceof GitError) || !/index\.lock/.test(error.message) || attempt >= 4) throw error
          const gitDir = (await run(root, ['rev-parse', '--absolute-git-dir'])).stdout.trim()
          const lock = path.join(gitDir, 'index.lock')
          const stat = await fs.stat(lock).catch(() => null)
          if (stat && Date.now() - stat.mtimeMs > 10 * 60_000) await fs.rm(lock, { force: true })
          await new Promise((r) => setTimeout(r, 1500))
        }
      }
    })
    queues.set(
      root,
      next.catch(() => undefined),
    )
    return next
  }

  /** Throws away local changes: tracked files go back to HEAD, new files are deleted. */
  async discard(paths: unknown): Promise<void> {
    const files = await this.checked(paths)
    const state = await this.state()
    for (const file of files) {
      const change = state.changes.find((c) => c.path === file)
      if (!change) continue
      if (change.status === 'untracked' || change.status === 'added') {
        await run(this.vault.root, ['rm', '--cached', '-q', '--ignore-unmatch', '--', spec(file)])
        await this.vault.remove(file)
      } else {
        await run(this.vault.root, ['restore', '--source=HEAD', '--staged', '--worktree', '--', spec(file)])
        if (change.from)
          await run(this.vault.root, [
            'restore',
            '--source=HEAD',
            '--staged',
            '--worktree',
            '--',
            spec(change.from),
          ])
      }
    }
  }

  async log(limit = 50, relative?: unknown): Promise<GitCommit[]> {
    if (relative !== undefined) await this.vault.resolve(relative as string)
    const result = await run(
      this.vault.root,
      [
        'log',
        `-n${Math.min(200, Math.max(1, Number(limit) || 50))}`,
        '--format=%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e',
        '--',
        typeof relative === 'string' ? spec(relative) : '.',
      ],
      { allowFail: true },
    )
    if (result.code !== 0) return []
    return result.stdout
      .split('\x1e')
      .map((r) => r.trim())
      .filter(Boolean)
      .map((r) => {
        const [hash, short, author, date, subject] = r.split('\x1f')
        return { hash: hash!, short: short!, author: author!, date: date!, subject: subject ?? '' }
      })
  }

  async commitFiles(hash: unknown): Promise<GitChange[]> {
    if (typeof hash !== 'string' || !HASH.test(hash)) throw new GitError('Ungültiger Commit')
    const result = await run(this.vault.root, [
      'show',
      '--name-status',
      '--format=',
      '-z',
      '--no-renames',
      hash,
      '--',
      '.',
    ])
    const parts = result.stdout.split('\0').filter(Boolean)
    const out: GitChange[] = []
    for (let i = 0; i + 1 < parts.length; i += 2) {
      const code = parts[i]!.trim()
      const path = this.toVault(parts[i + 1]!)
      if (!path) continue
      out.push({ path, status: code === 'A' ? 'added' : code === 'D' ? 'deleted' : 'modified' })
    }
    return out
  }

  async push(): Promise<string> {
    const r = await run(this.vault.root, ['push'], { timeout: 120_000 })
    return (r.stderr || r.stdout).trim()
  }

  async pull(): Promise<string> {
    const r = await run(this.vault.root, ['pull', '--ff-only'], { timeout: 120_000 })
    return (r.stdout || r.stderr).trim()
  }
}

/**
 * One-click fix "Git fehlt": Windows installs it with winget (the system asks for permission),
 * macOS opens Apple's installer for the command line tools; elsewhere (or without winget) the
 * download page. Returns what happened so the app can explain the next step.
 */
export async function installGit(openUrl: (url: string) => Promise<void>): Promise<'installing' | 'opened'> {
  const { spawn } = await import('node:child_process')
  const started = (cmd: string, args: string[]) =>
    new Promise<boolean>((resolve) => {
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: false })
      child.once('error', () => resolve(false))
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    })
  if (process.platform === 'win32') {
    // A visible window so the user sees the progress (and the permission prompt).
    const ok = await started('cmd.exe', [
      '/c',
      'start',
      '"Git installieren"',
      'cmd',
      '/k',
      'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements',
    ])
    if (ok) return 'installing'
    await openUrl('https://git-scm.com/download/win')
    return 'opened'
  }
  if (process.platform === 'darwin' && (await started('xcode-select', ['--install']))) return 'installing'
  await openUrl('https://git-scm.com/downloads')
  return 'opened'
}

/** One-click fix "Git weiß nicht, wer du bist": name and email for commits (global). */
export async function setGitIdentity(cwd: string, name: string, email: string): Promise<void> {
  await run(cwd, ['config', '--global', 'user.name', name])
  await run(cwd, ['config', '--global', 'user.email', email])
}
