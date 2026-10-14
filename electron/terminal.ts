/**
 * Terminals inside Notiva (main process): the user's login shell in a folder of the vault, with a
 * real pseudo terminal (node-pty, as in VS Code). Started only when the user opens a terminal; all
 * end with the app.
 */
import type { IPty } from '@lydell/node-pty'

export class Terminals {
  private next = 1
  private readonly running = new Map<number, IPty>()

  constructor(private readonly send: (channel: string, ...args: unknown[]) => void) {}

  async start(cwd: string, cols: number, rows: number): Promise<number> {
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
    term.onData((data) => this.send('term:data', id, data))
    term.onExit(({ exitCode }) => {
      this.running.delete(id)
      this.send('term:exit', id, exitCode)
    })
    this.running.set(id, term)
    return id
  }

  write(id: number, data: string): void {
    this.running.get(id)?.write(data)
  }

  resize(id: number, cols: number, rows: number): void {
    this.running.get(id)?.resize(clamp(cols, 20, 500), clamp(rows, 5, 200))
  }

  stop(id: number): void {
    const term = this.running.get(id)
    if (!term) return
    this.running.delete(id)
    term.kill()
  }

  stopAll(): void {
    for (const id of [...this.running.keys()]) this.stop(id)
  }
}

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.round(n) || min))
