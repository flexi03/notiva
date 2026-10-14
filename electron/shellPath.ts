/**
 * Apps started from the Finder/Dock get a minimal PATH, so tools installed via Homebrew, npm or
 * installers (git, claude, codex, …) would not be found. Reads the PATH of the user's login shell
 * once and merges it into process.env.PATH.
 */
import { execFile } from 'node:child_process'
import { access, constants } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

let loaded: Promise<void> | null = null

export function loadShellPath(): Promise<void> {
  if (loaded) return loaded
  loaded = new Promise<void>((resolve) => {
    if (process.platform === 'win32') return resolve()
    const shell = process.env.SHELL || '/bin/zsh'
    execFile(shell, ['-ilc', 'printf "__PATH__%s" "$PATH"'], { timeout: 5000 }, (error, stdout) => {
      const match = /__PATH__(.*)$/s.exec(String(stdout))
      const extra = [
        ...(match?.[1]?.split(':') ?? []),
        path.join(os.homedir(), '.local', 'bin'),
        '/opt/homebrew/bin',
        '/usr/local/bin',
      ]
      const parts = new Set([...(process.env.PATH ?? '').split(path.delimiter), ...extra].filter(Boolean))
      process.env.PATH = [...parts].join(path.delimiter)
      void error
      resolve()
    })
  })
  return loaded
}

/** Absolute path of an executable on PATH, or null. */
export async function which(command: string): Promise<string | null> {
  await loadShellPath()
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    const candidate = path.join(dir, command)
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      /* next */
    }
  }
  return null
}
