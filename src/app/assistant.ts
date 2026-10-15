import { create } from 'zustand'
import { buildAiContext } from '@/app/aiContext'
import { t } from '@/i18n'
import {
  createProvider,
  DEFAULT_AI_SETTINGS,
  parseAiSettings,
  runAgent,
  systemPrompt,
  type AiSettings,
  type HttpClient,
  type Message,
} from '@/lib/ai'
import { electronBridge, type CliInfo } from '@/lib/vault'
import { parseClaudeLine } from '@/lib/ai/claudeStream'
import { useApp } from './store'

const STORAGE_KEY = 'notiva.ai'

/** AI settings live on this device only (they may contain an API key) – never in the vault. */
function loadSettings(): { settings: AiSettings; configured: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { settings: parseAiSettings(JSON.parse(raw)), configured: true }
  } catch {
    /* unavailable or broken storage: fall back to defaults */
  }
  return { settings: DEFAULT_AI_SETTINGS, configured: false }
}

/** Browser: fetch (CSP allows local servers and the known AI APIs). Electron: the main process. */
export const httpClient: HttpClient = async (request) => {
  const bridge = electronBridge()
  if (bridge?.aiRequest) {
    const { signal, ...rest } = request
    const pending = bridge.aiRequest(rest)
    if (!signal) return pending
    return Promise.race([
      pending,
      new Promise<never>((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      ),
    ])
  }
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    ...(request.body !== undefined ? { body: request.body } : {}),
    ...(request.signal ? { signal: request.signal } : {}),
  })
  return { status: response.status, body: await response.text() }
}

/** Explains failed requests in terms of what to do next. */
export function describeError(error: unknown, settings: AiSettings): string {
  if (error instanceof DOMException && error.name === 'AbortError') return t('ai.stopped')
  const message = error instanceof Error ? error.message : String(error)
  if (error instanceof TypeError || /fetch|network|ECONNREFUSED/i.test(message)) {
    const local = /localhost|127\.0\.0\.1/.test(settings.baseUrl)
    return t(local ? 'ai.error.local' : 'ai.error.network', { url: settings.baseUrl })
  }
  if (/^40[13]/.test(message)) return t('ai.error.key', { message })
  if (/^404/.test(message)) return t('ai.error.model', { model: settings.model, message })
  return t('ai.error.generic', { message })
}

/** What was actually sent for one user message (shown under "Prompt" in the chat). */
export interface SentPrompt {
  system: string
  user: string
  /** CLI backend: the full command line. */
  command?: string[]
  /** CLI backend: the model that answered (e.g. claude-opus-5-5). */
  model?: string
}

interface AssistantState {
  settings: AiSettings
  /** True once the user saved settings on this device. */
  configured: boolean
  messages: Message[]
  /** Sent prompts by index of the user message in `messages`. */
  sent: Record<number, SentPrompt>
  busy: boolean
  error: string | null
  controller: AbortController | null
  /** CLI backend: conversation to continue (Claude Code session id). */
  sessionId: string | null
  /** Text in the input box (also filled by "/ki" in the editor). */
  draft: string
  /** Installed AI programs (desktop app), loaded once. */
  clis: CliInfo[] | null
  setDraft(draft: string): void
  saveSettings(settings: AiSettings): void
  loadClis(): Promise<CliInfo[]>
  /** The system prompt for the current page and settings. */
  currentPrompt(settings?: AiSettings): string
  send(text: string): Promise<void>
  stop(): void
  reset(): void
}

/** CLI mode cannot ask before deleting – the model is told so in the rights line. */
const CLI_RIGHTS =
  'Löschen oder komplettes Überschreiben ist hier nicht freigegeben – bitte den Nutzer, das selbst in Notiva zu tun.'

function currentPage() {
  const { ws, route, peek } = useApp.getState()
  if (!ws) return null
  const page = (peek ? ws.get(peek) : undefined) ?? (route.name === 'page' ? ws.get(route.path) : undefined)
  return page ? { path: page.path, title: page.title } : null
}

export const useAssistant = create<AssistantState>((set, get) => ({
  ...loadSettings(),
  messages: [],
  sent: {},
  busy: false,
  error: null,
  controller: null,
  sessionId: null,
  draft: '',
  clis: null,

  setDraft: (draft) => set({ draft }),
  saveSettings(settings) {
    const clean = parseAiSettings(settings)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    } catch {
      /* private mode: settings last for this session */
    }
    // A different backend or model cannot continue the old CLI session.
    const old = get().settings
    const sameSession =
      old.backend === clean.backend && old.cli === clean.cli && old.cliModel === clean.cliModel
    set({ settings: clean, configured: true, ...(sameSession ? {} : { sessionId: null }) })
  },
  async loadClis() {
    const cached = get().clis
    if (cached) return cached
    const bridge = electronBridge()?.aiCli
    const clis = bridge ? await bridge.detect().catch(() => []) : []
    set({ clis })
    return clis
  },
  currentPrompt(settings = get().settings) {
    const cli = settings.backend === 'cli'
    return systemPrompt({
      template: settings.prompt,
      language: useApp.getState().settings.language,
      now: new Date(),
      currentPage: currentPage(),
      readOnly: !settings.allowWrites,
      ...(cli ? { rightsNote: CLI_RIGHTS } : {}),
    })
  },
  async send(text) {
    const { ws } = useApp.getState()
    const { settings, busy } = get()
    if (!ws || busy || !text.trim()) return
    const controller = new AbortController()
    const userIndex = get().messages.length
    // What is open goes along (visible above the input and in the message).
    const context = await buildAiContext().catch(() => ({ text: '', labels: [] as string[] }))
    const messages: Message[] = [
      ...get().messages,
      {
        role: 'user',
        parts: [
          ...(context.text ? [{ type: 'text' as const, text: context.text }] : []),
          { type: 'text', text: text.trim() },
        ],
      },
    ]
    const system = get().currentPrompt()
    set({
      messages,
      busy: true,
      error: null,
      controller,
      draft: '',
      sent: {
        ...get().sent,
        [userIndex]: { system, user: context.text ? `${context.text}\n\n${text.trim()}` : text.trim() },
      },
    })
    const alive = () => get().controller === controller
    try {
      if (settings.backend === 'cli')
        await runCli(
          context.text ? `${context.text}\n\n${text.trim()}` : text.trim(),
          system,
          controller,
          userIndex,
          alive,
        )
      else
        await runAgent({
          provider: createProvider(settings, httpClient),
          ws,
          system,
          messages,
          readOnly: !settings.allowWrites,
          signal: controller.signal,
          ...(electronBridge()?.moodle ? { moodle: () => electronBridge()!.moodle!.fetch() } : {}),
          ...(electronBridge()?.ecampus ? { exams: () => electronBridge()!.ecampus!.snapshot() } : {}),
          onUpdate: (next) => {
            if (alive()) set({ messages: next })
          },
          confirm: async (tool, input) => {
            const target = (input as { page?: unknown } | null)?.page
            const answer = await useApp.getState().ask({
              title: t(`ai.confirm.${tool.name}` as 'ai.confirm.trash_page', {
                page: typeof target === 'string' ? target : '',
              }),
              label: t('ai.confirm.hint'),
              confirm: true,
              danger: true,
              confirmLabel: t('ai.confirm.allow'),
            })
            return answer !== null
          },
        })
    } catch (error) {
      if (alive()) set({ error: describeError(error, settings) })
    } finally {
      if (alive()) set({ busy: false, controller: null })
    }
  },
  stop() {
    get().controller?.abort()
    set({ busy: false, controller: null })
  },
  reset() {
    get().controller?.abort()
    set({ messages: [], sent: {}, error: null, busy: false, controller: null, sessionId: null })
  },
}))

/**
 * Runs one turn with an AI program (desktop app). Claude Code streams JSON events that become chat
 * messages as they arrive; other programs stream plain text into one answer.
 */
async function runCli(
  prompt: string,
  system: string,
  controller: AbortController,
  userIndex: number,
  alive: () => boolean,
): Promise<void> {
  const bridge = electronBridge()?.aiCli
  if (!bridge) throw new Error(t('ai.cli.desktopOnly'))
  const { settings, sessionId } = useAssistant.getState()
  const set = useAssistant.setState
  const get = useAssistant.getState
  const names = new Map<string, string>()
  let plain = ''
  let runId: number | null = null
  const early: Array<{ runId: number; payload: { line?: string; exit?: number | null; stderr?: string } }> =
    []

  await new Promise<void>((resolve, reject) => {
    const handle = (payload: { line?: string; exit?: number | null; stderr?: string }) => {
      if (!alive()) return
      if (payload.line !== undefined) {
        if (settings.cli === 'claude') {
          const update = parseClaudeLine(payload.line, names)
          if (update.session)
            set({
              sessionId: update.session.id,
              ...(update.session.model
                ? {
                    sent: {
                      ...get().sent,
                      [userIndex]: { ...get().sent[userIndex]!, model: update.session.model },
                    },
                  }
                : {}),
            })
          if (update.message) set({ messages: [...get().messages, update.message] })
          if (update.result?.isError && update.result.text)
            set({ error: t('ai.error.generic', { message: update.result.text }) })
        } else {
          plain += `${payload.line}\n`
          const messages = get().messages.slice()
          const last = messages[messages.length - 1]
          const answer: Message = { role: 'assistant', parts: [{ type: 'text', text: plain.trim() }] }
          if (last?.role === 'assistant') messages[messages.length - 1] = answer
          else messages.push(answer)
          set({ messages })
        }
      }
      if (payload.exit !== undefined) {
        unsubscribe()
        void useApp.getState().ws?.reload()
        if (payload.exit === 0) resolve()
        else reject(new Error(payload.stderr?.trim() || `Exit ${payload.exit}`))
      }
    }
    const unsubscribe = bridge.onEvent((id, payload) => {
      if (runId === null) early.push({ runId: id, payload })
      else if (id === runId) handle(payload)
    })
    controller.signal.addEventListener('abort', () => {
      if (runId !== null) void bridge.cancel(runId)
      unsubscribe()
      reject(new DOMException('aborted', 'AbortError'))
    })
    bridge
      .start({
        cli: settings.cli,
        prompt,
        system,
        model: settings.cliModel,
        sessionId,
        allowWrites: settings.allowWrites,
      })
      .then(({ runId: id, command }) => {
        runId = id
        set({ sent: { ...get().sent, [userIndex]: { ...get().sent[userIndex]!, command } } })
        for (const e of early.splice(0)) if (e.runId === id) handle(e.payload)
      }, reject)
  })
}

/** Connection test for an AI program: one short turn without tools. Resolves with the answer. */
export async function testCli(settings: AiSettings): Promise<string> {
  const bridge = electronBridge()?.aiCli
  if (!bridge) throw new Error(t('ai.cli.desktopOnly'))
  const names = new Map<string, string>()
  let answer = ''
  let runId: number | null = null
  return new Promise<string>((resolve, reject) => {
    const unsubscribe = bridge.onEvent((id, payload) => {
      if (runId !== null && id !== runId) return
      if (payload.line !== undefined) {
        if (settings.cli === 'claude') {
          const update = parseClaudeLine(payload.line, names)
          if (update.result) answer = update.result.text
        } else answer += `${payload.line}\n`
      }
      if (payload.exit !== undefined) {
        unsubscribe()
        if (payload.exit === 0) resolve(answer.trim() || '–')
        else reject(new Error(payload.stderr?.trim() || `Exit ${payload.exit}`))
      }
    })
    bridge
      .start({
        cli: settings.cli,
        prompt: 'Antworte nur mit: OK',
        system: '',
        model: settings.cliModel,
        sessionId: null,
        allowWrites: false,
      })
      .then(({ runId: id }) => (runId = id), reject)
  })
}
