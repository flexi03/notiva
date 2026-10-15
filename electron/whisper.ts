/**
 * Local, free speech to text with whisper.cpp (main process). Notiva finds `whisper-server`
 * (Homebrew: `whisper-cpp`), downloads a model into the app profile (checked by SHA-256) and runs the
 * server on 127.0.0.1 only while it is needed. Nothing leaves the computer.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createWriteStream, promises as fs } from 'node:fs'
import { createServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { which } from './shellPath'

export interface WhisperModel {
  id: string
  label: string
  size: number
  sha256: string
}

/** From huggingface.co/ggerganov/whisper.cpp (sizes and LFS hashes). */
export const WHISPER_MODELS: WhisperModel[] = [
  {
    id: 'large-v3-turbo-q5_0',
    label: 'Groß – beste Qualität (574 MB)',
    size: 574041195,
    sha256: '394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2',
  },
  {
    id: 'small',
    label: 'Mittel (488 MB)',
    size: 487601967,
    sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b',
  },
  {
    id: 'base',
    label: 'Klein – schnell, ungenauer (148 MB)',
    size: 147951465,
    sha256: '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe',
  },
]

export interface WhisperStatus {
  /** Path of whisper-server, null if not installed. */
  server: string | null
  /** Homebrew is available for a one-click install. */
  brew: boolean
  models: Array<{ id: string; label: string; size: number; downloaded: boolean }>
  running: boolean
}

type Progress = (event: {
  kind: 'install' | 'download'
  text?: string
  done?: number
  total?: number
}) => void

export class WhisperEngine {
  private process: ChildProcess | null = null
  private port = 0
  private running: { model: string; language: string } | null = null
  private starting: Promise<number> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly modelDir: string,
    private readonly fetchFn: (url: string, init?: RequestInit) => Promise<Response>,
  ) {}

  modelPath(id: string): string {
    return path.join(this.modelDir, `ggml-${id}.bin`)
  }

  async status(): Promise<WhisperStatus> {
    const models = await Promise.all(
      WHISPER_MODELS.map(async (m) => ({
        id: m.id,
        label: m.label,
        size: m.size,
        downloaded: (await fs.stat(this.modelPath(m.id)).catch(() => null))?.size === m.size,
      })),
    )
    return {
      server: await which('whisper-server'),
      brew: !!(await which('brew')),
      models,
      running: !!this.process,
    }
  }

  /** `brew install whisper-cpp` – only when the user clicks "Installieren". */
  async install(onProgress: Progress): Promise<void> {
    const brew = await which('brew')
    if (!brew) throw new Error('Homebrew fehlt – siehe brew.sh, oder whisper.cpp selbst installieren.')
    await new Promise<void>((resolve, reject) => {
      const child = spawn(brew, ['install', 'whisper-cpp'], {
        env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
      })
      const forward = (chunk: Buffer) =>
        chunk
          .toString()
          .split('\n')
          .filter((l) => l.trim())
          .forEach((text) => onProgress({ kind: 'install', text: text.slice(0, 300) }))
      child.stdout.on('data', forward)
      child.stderr.on('data', forward)
      child.on('error', reject)
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error(`Installation fehlgeschlagen (Code ${code})`)),
      )
    })
  }

  /** Downloads a model with progress; verified by size and SHA-256 before it is used. */
  async download(id: string, onProgress: Progress): Promise<void> {
    const model = WHISPER_MODELS.find((m) => m.id === id)
    if (!model) throw new Error('Unbekanntes Modell')
    await fs.mkdir(this.modelDir, { recursive: true })
    const target = this.modelPath(id)
    const part = `${target}.part`
    const response = await this.fetchFn(
      `https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-${id}.bin`,
      {
        redirect: 'follow',
      },
    )
    if (!response.ok || !response.body) throw new Error(`Download fehlgeschlagen (${response.status})`)
    const hash = createHash('sha256')
    const out = createWriteStream(part)
    let done = 0
    let lastReport = 0
    const reader = response.body.getReader()
    try {
      for (;;) {
        const { value, done: finished } = await reader.read()
        if (finished) break
        hash.update(value)
        done += value.length
        if (done > model.size) throw new Error('Datei größer als erwartet')
        if (!out.write(value)) await new Promise((r) => out.once('drain', r))
        if (Date.now() - lastReport > 250) {
          lastReport = Date.now()
          onProgress({ kind: 'download', done, total: model.size })
        }
      }
      await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())))
      if (done !== model.size || hash.digest('hex') !== model.sha256)
        throw new Error('Modell beschädigt (Prüfsumme stimmt nicht)')
      await fs.rename(part, target)
      onProgress({ kind: 'download', done, total: model.size })
    } catch (error) {
      out.destroy()
      await fs.rm(part, { force: true })
      throw error
    }
  }

  async removeModel(id: string): Promise<void> {
    if (!WHISPER_MODELS.some((m) => m.id === id)) throw new Error('Unbekanntes Modell')
    if (this.running?.model === id) this.stop()
    await fs.rm(this.modelPath(id), { force: true })
  }

  /** Starts (or reuses) whisper-server for a model; stops again after 10 idle minutes. */
  private async ensure(model: string, language: string): Promise<number> {
    if (this.process && this.running?.model === model && this.running.language === language) return this.port
    if (this.starting) return this.starting
    this.stop()
    this.starting = (async () => {
      const server = await which('whisper-server')
      if (!server) throw new Error('whisper.cpp ist nicht installiert (Einstellungen → Transkription).')
      const file = this.modelPath(model)
      if (!(await fs.stat(file).catch(() => null)))
        throw new Error('Das Whisper-Modell ist noch nicht geladen (Einstellungen → Transkription).')
      const port = await freePort()
      const threads = Math.max(2, Math.min(8, os.cpus().length - 2))
      const args = [
        '-m',
        file,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '--inference-path',
        '/v1/audio/transcriptions',
        '-l',
        language || 'auto',
        '-t',
        String(threads),
      ]
      const child = spawnTied(server, args)
      let log = ''
      child.stderr?.on('data', (c: Buffer) => (log = (log + c.toString()).slice(-2000)))
      child.on('exit', () => {
        if (this.process === child) {
          this.process = null
          this.running = null
        }
      })
      this.process = child
      this.running = { model, language }
      this.port = port
      // Loading the model takes a few seconds: wait until the server answers.
      for (let i = 0; i < 120; i++) {
        if (child.exitCode !== null) throw new Error(`whisper-server ist abgestürzt: ${log.slice(-300)}`)
        const ok = await this.fetchFn(`http://127.0.0.1:${port}/`, {
          signal: AbortSignal.timeout(1000),
        }).then(
          () => true,
          () => false,
        )
        if (ok) return port
        await new Promise((r) => setTimeout(r, 500))
      }
      this.stop()
      throw new Error('whisper-server startet nicht')
    })().finally(() => (this.starting = null))
    return this.starting
  }

  async transcribe(model: string, language: string, fields: Record<string, string>, audio: Uint8Array) {
    const port = await this.ensure(model, language)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(), 10 * 60_000)
    const form = new FormData()
    for (const [k, v] of Object.entries(fields)) if (k !== 'model') form.append(k, v)
    form.append('file', new Blob([audio.slice()], { type: 'audio/wav' }), 'chunk.wav')
    const response = await this.fetchFn(`http://127.0.0.1:${port}/v1/audio/transcriptions`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(180_000),
    })
    return { status: response.status, body: await response.text() }
  }

  stop(): void {
    // Closing stdin ends the server (see spawnTied); kill() as fallback.
    this.process?.stdin?.end()
    if (process.platform === 'win32') this.process?.kill()
    this.process = null
    this.running = null
  }
}

/**
 * Starts the server so it can never outlive Notiva: a tiny shell waits for our stdin to close –
 * which also happens when Notiva crashes or is killed – and then stops the server. The shell
 * itself exits with the server.
 */
export function spawnTied(command: string, args: string[]): ChildProcess {
  if (process.platform === 'win32')
    return spawn(command, args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true })
  // Background jobs get /dev/null as stdin – so stdin is kept on fd 3 for the watcher.
  const script = 'exec 3<&0; "$0" "$@" </dev/null & p=$!; (cat <&3 >/dev/null; kill $p 2>/dev/null) & wait $p'
  return spawn('/bin/sh', ['-c', script, command, ...args], { stdio: ['pipe', 'ignore', 'pipe'] })
}

export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number }
      server.close(() => resolve(port))
    })
  })
}
