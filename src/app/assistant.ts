import { create } from 'zustand'
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
import { electronBridge } from '@/lib/vault'
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

interface AssistantState {
  settings: AiSettings
  /** True once the user saved settings on this device. */
  configured: boolean
  messages: Message[]
  busy: boolean
  error: string | null
  controller: AbortController | null
  saveSettings(settings: AiSettings): void
  send(text: string): Promise<void>
  stop(): void
  reset(): void
}

export const useAssistant = create<AssistantState>((set, get) => ({
  ...loadSettings(),
  messages: [],
  busy: false,
  error: null,
  controller: null,

  saveSettings(settings) {
    const clean = parseAiSettings(settings)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean))
    } catch {
      /* private mode: settings last for this session */
    }
    set({ settings: clean, configured: true })
  },
  async send(text) {
    const { ws, route, settings: appSettings, ask } = useApp.getState()
    const { settings, busy } = get()
    if (!ws || busy || !text.trim()) return
    const controller = new AbortController()
    const messages: Message[] = [
      ...get().messages,
      { role: 'user', parts: [{ type: 'text', text: text.trim() }] },
    ]
    set({ messages, busy: true, error: null, controller })
    const page = route.name === 'page' ? ws.get(route.path) : undefined
    const peek = useApp.getState().peek
    const current = (peek ? ws.get(peek) : undefined) ?? page
    try {
      await runAgent({
        provider: createProvider(settings, httpClient),
        ws,
        system: systemPrompt({
          language: appSettings.language,
          now: new Date(),
          currentPage: current ? { path: current.path, title: current.title } : null,
          readOnly: !settings.allowWrites,
        }),
        messages,
        readOnly: !settings.allowWrites,
        signal: controller.signal,
        onUpdate: (next) => {
          if (get().controller === controller) set({ messages: next })
        },
        confirm: async (tool, input) => {
          const target = (input as { page?: unknown } | null)?.page
          const answer = await ask({
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
      if (get().controller === controller) set({ error: describeError(error, settings) })
    } finally {
      if (get().controller === controller) set({ busy: false, controller: null })
    }
  },
  stop() {
    get().controller?.abort()
    set({ busy: false, controller: null })
  },
  reset() {
    get().controller?.abort()
    set({ messages: [], error: null, busy: false, controller: null })
  },
}))
