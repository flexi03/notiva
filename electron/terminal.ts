/**
 * Terminals inside Notiva (main process): the user's login shell in a folder of the vault, with a
 * real pseudo terminal (node-pty, as in VS Code). Sessions have a key (folder + pane) and keep
 * running while the view changes; their output is kept (also across restarts, in the app profile)
 * until the user clears it. All shells end with the app.
 */
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { IPty } from '@lydell/node-pty'

const MAX_BUFFER = 300_000

interface Session {
  id: number
  key: string
  pty: IPty
  buffer: string
  alive: boolean
}

export class Terminals {
  private next = 1
  private readonly sessions = new Map<number, Session>()
  private readonly saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly send: (channel: string, ...args: unknown[]) => void,
    private readonly dir: string,
  ) {}

  private file(key: string) {
    return path.join(this.dir, `${createHash('sha256').update(key).digest('hex').slice(0, 24)}.log`)
  }

  private persist(session: Session): void {
    clearTimeout(this.saveTimers.get(session.key))
    this.saveTimers.set(
      session.key,
      setTimeout(() => {
        void fs
          .mkdir(this.dir, { recursive: true })
          .then(() => fs.writeFile(this.file(session.key), session.buffer, { mode: 0o600 }))
          .catch(() => undefined)
      }, 1000),
    )
  }

  /**
   * Opens the session `key`: a running one is re-attached (its output comes back), otherwise a new
   * shell starts – with the saved output of earlier sessions in front.
   */
  async start(key: string, cwd: string, cols: number, rows: number): Promise<{ id: number; replay: string }> {
    const running = [...this.sessions.values()].find((s) => s.key === key && s.alive)
    if (running) {
      running.pty.resize(clamp(cols, 20, 500), clamp(rows, 5, 200))
      return { id: running.id, replay: running.buffer }
    }
    const saved = await fs.readFile(this.file(key), 'utf8').catch(() => '')
    const pty = await import('@lydell/node-pty')
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/zsh'
    const id = this.next++
    const term = pty.spawn(shell, process.platform === 'win32' ? [] : ['-l'], {
      name: 'xterm-256color',
      cols: clamp(cols, 20, 500),
      rows: clamp(rows, 5, 200),
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        TERM_PROGRAM: 'Notiva',
      } as Record<string, string>,
    })
    const divider = saved
      ? `${saved}\r\n\x1b[2m── neue Sitzung ${new Date().toLocaleString('de-DE')} ──\x1b[0m\r\n`
      : ''
    const session: Session = { id, key, pty: term, buffer: divider, alive: true }
    term.onData((data) => {
      session.buffer = (session.buffer + data).slice(-MAX_BUFFER)
      this.persist(session)
      this.send('term:data', id, data)
    })
    term.onExit(({ exitCode }) => {
      session.alive = false
      this.sessions.delete(id)
      this.send('term:exit', id, exitCode)
    })
    this.sessions.set(id, session)
    return { id, replay: divider }
  }

  write(id: number, data: string): void {
    this.sessions.get(id)?.pty.write(data)
  }

  resize(id: number, cols: number, rows: number): void {
    this.sessions.get(id)?.pty.resize(clamp(cols, 20, 500), clamp(rows, 5, 200))
  }

  /** Ends the shell (the saved output stays). */
  stop(id: number): void {
    const session = this.sessions.get(id)
    if (!session) return
    this.sessions.delete(id)
    session.alive = false
    session.pty.kill()
  }

  /** Forgets the output of a session (running one and saved). */
  async clear(key: string): Promise<void> {
    for (const s of this.sessions.values()) if (s.key === key) s.buffer = ''
    clearTimeout(this.saveTimers.get(key))
    await fs.rm(this.file(key), { force: true })
  }

  stopAll(): void {
    for (const id of [...this.sessions.keys()]) this.stop(id)
  }
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n) || min))
