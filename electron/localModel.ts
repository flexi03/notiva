/**
 * A small local language model for quick summaries (e.g. Git commit messages): llama.cpp's
 * `llama-server` with a Qwen 2.5 model, both offline after the first download. Like the Whisper
 * engine: models live in the app profile (verified by size and SHA-256), the server starts on
 * demand on 127.0.0.1 and stops after 5 idle minutes. Nothing leaves the computer.
 */
import { type ChildProcess } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  downloadVerified,
  findLlamaServer,
  installLlama,
  llamaInstallVia,
  type InstallVia,
} from './nativeTools'
import { freePort, spawnTied } from './whisper'

export const LOCAL_MODELS = [
  {
    id: 'qwen2.5-0.5b',
    label: 'Klein & schnell (Qwen 2.5 · 0,5 B)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf',
    size: 491_400_032,
    sha256: '74a4da8c9fdbcd15bd1f6d01d621410d31c6fc00986f5eb687824e7b93d7a9db',
  },
  {
    id: 'qwen2.5-1.5b',
    label: 'Empfohlen (Qwen 2.5 · 1,5 B)',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
    size: 1_117_320_736,
    sha256: '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e',
  },
] as const

export type LocalModelId = (typeof LOCAL_MODELS)[number]['id']
export type Progress = (event: {
  kind: 'download' | 'install' | 'start'
  done?: number
  total?: number
  text?: string
}) => void
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export interface LocalModelStatus {
  server: string | null
  via: InstallVia
  models: Array<{ id: string; label: string; size: number; downloaded: boolean }>
  running: string | null
}

export class LocalModel {
  private process: ChildProcess | null = null
  private port = 0
  private running: string | null = null
  private starting: Promise<number> | null = null
  private idleTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly modelDir: string,
    private readonly fetchFn: Fetch,
  ) {}

  private modelPath(id: string): string {
    return path.join(this.modelDir, `${id}.gguf`)
  }

  async status(): Promise<LocalModelStatus> {
    const models = await Promise.all(
      LOCAL_MODELS.map(async (m) => ({
        id: m.id,
        label: m.label,
        size: m.size,
        downloaded: !!(await fs.stat(this.modelPath(m.id)).catch(() => null)),
      })),
    )
    return {
      server: (await findLlamaServer())?.command ?? null,
      via: await llamaInstallVia(),
      models,
      running: this.running,
    }
  }

  /** One-click install of llama.cpp (see nativeTools: Homebrew or llama.app's installer). */
  install(onProgress: Progress): Promise<void> {
    return installLlama(onProgress)
  }

  /** Downloads a model with progress; verified by size and SHA-256 before it is used. */
  async download(id: string, onProgress: Progress): Promise<void> {
    const model = LOCAL_MODELS.find((m) => m.id === id)
    if (!model) throw new Error('Unbekanntes Modell')
    await downloadVerified(this.fetchFn, model.url, this.modelPath(id), model, onProgress)
  }

  async remove(id: string): Promise<void> {
    if (!LOCAL_MODELS.some((m) => m.id === id)) throw new Error('Unbekanntes Modell')
    if (this.running === id) this.stop()
    await fs.rm(this.modelPath(id), { force: true })
  }

  private async ensure(id: string, onProgress?: Progress): Promise<number> {
    if (this.process && this.running === id) return this.port
    if (this.starting) return this.starting
    this.stop()
    this.starting = (async () => {
      const server = await findLlamaServer()
      if (!server)
        throw new Error('llama.cpp ist nicht installiert (Einstellungen → KI → Lokales Mini-Modell).')
      const file = this.modelPath(id)
      if (!(await fs.stat(file).catch(() => null)))
        throw new Error('Das lokale Modell ist noch nicht geladen (Einstellungen → KI).')
      onProgress?.({ kind: 'start', text: 'Lokales Modell startet …' })
      const port = await freePort()
      const threads = Math.max(2, Math.min(8, os.cpus().length - 2))
      const child = spawnTied(server.command, [
        ...server.args,
        '-m',
        file,
        '--host',
        '127.0.0.1',
        '--port',
        String(port),
        '-c',
        '4096',
        '-t',
        String(threads),
        '-ngl',
        '99',
      ])
      let log = ''
      child.stderr?.on('data', (c: Buffer) => (log = (log + c.toString()).slice(-2000)))
      child.on('exit', () => {
        if (this.process === child) {
          this.process = null
          this.running = null
        }
      })
      this.process = child
      this.running = id
      this.port = port
      for (let i = 0; i < 240; i++) {
        if (child.exitCode !== null) throw new Error(`llama-server ist abgestürzt: ${log.slice(-300)}`)
        const ok = await this.fetchFn(`http://127.0.0.1:${port}/health`, {
          signal: AbortSignal.timeout(1000),
        }).then(
          (r) => r.ok,
          () => false,
        )
        if (ok) return port
        await new Promise((r) => setTimeout(r, 500))
      }
      this.stop()
      throw new Error('llama-server startet nicht')
    })().finally(() => (this.starting = null))
    return this.starting
  }

  /**
   * A short answer (chat completion) – e.g. a commit message from a list of changes. `examples`
   * (question/answer pairs) go in as earlier turns: small models follow those far better.
   */
  async complete(
    id: string,
    system: string,
    prompt: string,
    maxTokens = 200,
    onProgress?: Progress,
    examples: Array<[string, string]> = [],
  ): Promise<string> {
    const port = await this.ensure(id, onProgress)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.stop(), 5 * 60_000)
    const response = await this.fetchFn(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          ...examples.flatMap(([q, a]) => [
            { role: 'user', content: q },
            { role: 'assistant', content: a },
          ]),
          { role: 'user', content: prompt },
        ],
        max_tokens: maxTokens,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!response.ok) throw new Error(`Lokales Modell: Fehler ${response.status}`)
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> }
    return (data.choices?.[0]?.message?.content ?? '').trim()
  }

  stop(): void {
    this.process?.stdin?.end()
    if (process.platform === 'win32') this.process?.kill()
    this.process = null
    this.running = null
  }
}
