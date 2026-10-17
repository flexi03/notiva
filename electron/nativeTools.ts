/**
 * The local engines (llama.cpp for the mini model, whisper.cpp for speech to text) per system:
 * where they are, how to install them and a verified download. Installing only ever happens when
 * the user clicks "Installieren"; its output shows up as progress.
 *
 * - llama.cpp: Homebrew on macOS (when there), otherwise the official installer of llama.app
 *   (`install.sh` / `install.ps1`, into the user's folders, no admin rights). That one installs a
 *   single `llama` program whose `llama serve` is llama-server.
 * - whisper.cpp: Homebrew on macOS; on Linux and Windows the official prebuilt release (pinned,
 *   checked by SHA-256) unpacked into the app profile.
 */
import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { which } from './shellPath'

export type Progress = (event: {
  kind: 'install' | 'download'
  text?: string
  done?: number
  total?: number
}) => void
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

/** How the engine gets installed on this system (null: by hand). */
export type InstallVia = 'brew' | 'script' | 'download' | null

const exe = (name: string) => (process.platform === 'win32' ? `${name}.exe` : name)

async function executable(file: string): Promise<boolean> {
  return fs.access(file, process.platform === 'win32' ? fs.constants.F_OK : fs.constants.X_OK).then(
    () => true,
    () => false,
  )
}

/** Runs an installer and forwards its output lines as progress; rejects on a non-zero exit. */
export function runInstaller(
  command: string,
  args: string[],
  onProgress: Progress,
  env: Record<string, string> = {},
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { env: { ...process.env, ...env }, windowsHide: true })
    let last = ''
    const forward = (chunk: Buffer) =>
      chunk
        .toString()
        // eslint-disable-next-line no-control-regex
        .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
        .split(/\r?\n|\r/)
        .filter((l) => l.trim())
        .forEach((line) => {
          last = line.slice(0, 300)
          onProgress({ kind: 'install', text: last })
        })
    child.stdout.on('data', forward)
    child.stderr.on('data', forward)
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Installation fehlgeschlagen (Code ${code})${last ? `: ${last}` : ''}`)),
    )
  })
}

/** Downloads a file with progress; kept only when size and SHA-256 match. */
export async function downloadVerified(
  fetchFn: Fetch,
  url: string,
  target: string,
  expected: { size: number; sha256: string },
  onProgress: Progress,
): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true })
  const part = `${target}.part`
  const response = await fetchFn(url, { redirect: 'follow' })
  if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen (${response.status})`)
  const hash = createHash('sha256')
  const out = createWriteStream(part)
  let done = 0
  let last = 0
  const reader = response.body.getReader()
  try {
    for (;;) {
      const { value, done: finished } = await reader.read()
      if (finished) break
      hash.update(value)
      done += value.length
      if (done > expected.size) throw new Error('Datei größer als erwartet')
      if (!out.write(value)) await new Promise((r) => out.once('drain', r))
      if (Date.now() - last > 250) {
        last = Date.now()
        onProgress({ kind: 'download', done, total: expected.size })
      }
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
    if (done !== expected.size || hash.digest('hex') !== expected.sha256)
      throw new Error('Datei beschädigt (Prüfsumme stimmt nicht)')
    await fs.rename(part, target)
    onProgress({ kind: 'download', done, total: expected.size })
  } catch (error) {
    out.destroy()
    await fs.rm(part, { force: true })
    throw error
  }
}

// ---------------------------------------------------------------------------------------------
// llama.cpp

export interface LlamaServer {
  /** the program */
  command: string
  /** before the server options: [] for llama-server, ['serve'] for llama.app's `llama` */
  args: string[]
}

/** Where installers put the programs, also when Notiva's PATH predates the install. */
function llamaPlaces(): string[] {
  const home = os.homedir()
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local')
    return [path.join(local, 'Microsoft', 'WindowsApps'), path.join(local, 'Microsoft', 'WinGet', 'Links')]
  }
  return [path.join(home, '.local', 'bin'), path.join(home, '.llama-app')]
}

/** llama.app's program answers `llama version` with its build ("b6543-…" or "build 6543"). */
function isLlamaApp(file: string): Promise<boolean> {
  return new Promise((resolve) =>
    execFile(file, ['version'], { timeout: 8000, windowsHide: true }, (_error, stdout, stderr) =>
      resolve(/(^|\s)b\d+-|build \d+/m.test(`${stdout}\n${stderr}`)),
    ),
  )
}

/** llama-server (Homebrew, winget, own build) or llama.app's `llama serve`; null if neither. */
export async function findLlamaServer(): Promise<LlamaServer | null> {
  const places = llamaPlaces()
  const server =
    (await which(exe('llama-server'))) ??
    (await firstExisting(places.map((dir) => path.join(dir, exe('llama-server')))))
  if (server) return { command: server, args: [] }
  const candidates = [...places.map((dir) => path.join(dir, exe('llama'))), await which(exe('llama'))]
  for (const file of new Set(candidates)) {
    // Another program may be called "llama" too (e.g. Meta's llama-stack) – only llama.app's counts.
    if (file && (await executable(file)) && (await isLlamaApp(file)))
      return { command: file, args: ['serve'] }
  }
  return null
}

async function firstExisting(files: string[]): Promise<string | null> {
  for (const file of files) if (await executable(file)) return file
  return null
}

export async function llamaInstallVia(): Promise<InstallVia> {
  if (process.platform === 'darwin' && (await which('brew'))) return 'brew'
  return 'script'
}

/** Installs llama.cpp the way llamaInstallVia() says. */
export async function installLlama(onProgress: Progress): Promise<void> {
  if ((await llamaInstallVia()) === 'brew') {
    await runInstaller((await which('brew'))!, ['install', 'llama.cpp'], onProgress, {
      HOMEBREW_NO_AUTO_UPDATE: '1',
    })
    return
  }
  if (process.platform === 'win32') {
    await runInstaller(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'irm https://llama.app/install.ps1 | iex'],
      onProgress,
    )
    return
  }
  // The installer itself needs curl; fetching it works with wget too.
  await runInstaller(
    '/bin/sh',
    [
      '-c',
      'if command -v curl >/dev/null; then curl -LsSf https://llama.app/install.sh | sh; ' +
        'else echo "curl fehlt – bitte zuerst curl installieren (z. B. sudo apt install curl)." >&2; exit 1; fi',
    ],
    onProgress,
  )
}

// ---------------------------------------------------------------------------------------------
// whisper.cpp

/** Official prebuilt whisper.cpp (github.com/ggml-org/whisper.cpp, release b5454). */
export const WHISPER_BUILDS: Record<string, { file: string; folder: string; size: number; sha256: string }> =
  {
    'linux-x64': {
      file: 'whisper-bin-ubuntu-x64.tar.gz',
      folder: 'whisper-bin-ubuntu-x64',
      size: 10_364_195,
      sha256: 'a72becf15d7917f990f6313867a52638b82b7f9ef237fb0c980dac56a135781c',
    },
    'linux-arm64': {
      file: 'whisper-bin-ubuntu-arm64.tar.gz',
      folder: 'whisper-bin-ubuntu-arm64',
      size: 4_608_377,
      sha256: '6b95ebfc60447df48e70ef00a73bdc3f41679ed2d01ef465827206a2ff325149',
    },
    'win32-x64': {
      file: 'whisper-bin-x64.zip',
      folder: 'Release',
      size: 8_928_640,
      sha256: '6ba69e3482d7826214f90a6a9c84ca07782aec1e1d0c6a7c30c994fd5d816ccb',
    },
    'win32-arm64': {
      file: 'whisper-bin-win-cpu-arm64.zip',
      folder: 'Release',
      size: 4_371_193,
      sha256: '28c37e7b598c3d9bbfef94f3bd67f2ee6f12b7c86f3da5edcf5e4308d615ff6d',
    },
  }
const WHISPER_RELEASE = 'https://github.com/ggml-org/whisper.cpp/releases/download/b5454/'

const whisperBuild = () => WHISPER_BUILDS[`${process.platform}-${process.arch}`]

/** whisper-server: on PATH (Homebrew, own build) or the build Notiva unpacked into `binDir`. */
export async function findWhisperServer(binDir: string): Promise<string | null> {
  const build = whisperBuild()
  const own = build ? path.join(binDir, build.folder, exe('whisper-server')) : null
  return (await which(exe('whisper-server'))) ?? (own && (await executable(own)) ? own : null)
}

export async function whisperInstallVia(): Promise<InstallVia> {
  if (process.platform === 'darwin') return (await which('brew')) ? 'brew' : null
  return whisperBuild() ? 'download' : null
}

export async function installWhisper(binDir: string, fetchFn: Fetch, onProgress: Progress): Promise<void> {
  const via = await whisperInstallVia()
  if (via === 'brew') {
    await runInstaller((await which('brew'))!, ['install', 'whisper-cpp'], onProgress, {
      HOMEBREW_NO_AUTO_UPDATE: '1',
    })
    return
  }
  const build = whisperBuild()
  if (via !== 'download' || !build) throw new Error('Für dieses System gibt es kein fertiges whisper.cpp.')
  const archive = path.join(binDir, build.file)
  await downloadVerified(fetchFn, WHISPER_RELEASE + build.file, archive, build, onProgress)
  try {
    await fs.rm(path.join(binDir, build.folder), { recursive: true, force: true })
    onProgress({ kind: 'install', text: 'Entpacke …' })
    // tar reads .tar.gz on Linux and .zip on Windows 10+ (its own bsdtar – Git's GNU tar can't).
    const tar =
      process.platform === 'win32'
        ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe')
        : 'tar'
    await runInstaller(tar, ['-xf', archive, '-C', binDir], onProgress)
  } finally {
    await fs.rm(archive, { force: true })
  }
}
