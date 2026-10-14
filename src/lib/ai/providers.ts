/**
 * Model APIs behind {@link ModelProvider}: Anthropic and every OpenAI-compatible server (Ollama,
 * LM Studio, OpenRouter, OpenAI …). HTTP is injected, so the browser uses fetch, Electron its main
 * process, and tests a fake.
 */
import type { Message, ModelProvider, Part, ToolSpec } from './agent'

export interface HttpRequest {
  url: string
  method: 'POST' | 'GET'
  headers: Record<string, string>
  body?: string
  signal?: AbortSignal
}
export interface HttpResponse {
  status: number
  body: string
}
export type HttpClient = (request: HttpRequest) => Promise<HttpResponse>

export type ProviderKind = 'openai' | 'anthropic'

/** Device-local AI settings – never stored in the vault, because they may contain an API key. */
export type AiBackend = 'cli' | 'api'
export type CliId = 'claude' | 'codex' | 'antigravity'

export interface AiSettings {
  /** 'cli': an installed AI program (Claude Code …, desktop app); 'api': an HTTP model API. */
  backend: AiBackend
  cli: CliId
  /** Model for the CLI ('' = the program's own default; 'opus' = latest Opus for Claude Code). */
  cliModel: string
  /** Own prompt template ('' = the built-in one). */
  prompt: string
  provider: ProviderKind
  baseUrl: string
  model: string
  apiKey: string
  /** May the assistant change pages? Off = read-only tools only. */
  allowWrites: boolean
}

export interface AiPreset {
  id: string
  label: string
  hint: string
  provider: ProviderKind
  baseUrl: string
  model: string
  needsKey: boolean
}

export const AI_PRESETS: AiPreset[] = [
  {
    id: 'ollama',
    label: 'Ollama',
    hint: 'Kostenlos und lokal auf deinem Rechner – nichts verlässt das Gerät.',
    provider: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    model: 'qwen2.5',
    needsKey: false,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    hint: 'Kostenlos und lokal, mit grafischer Modellverwaltung.',
    provider: 'openai',
    baseUrl: 'http://localhost:1234/v1',
    model: '',
    needsKey: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    hint: 'Viele Modelle über einen Schlüssel, einige kostenlos.',
    provider: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
    needsKey: true,
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    hint: 'Mit eigenem API-Schlüssel.',
    provider: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-sonnet-5-5',
    needsKey: true,
  },
  {
    id: 'openai',
    label: 'OpenAI-kompatibel',
    hint: 'Jeder Server mit OpenAI-Schnittstelle (/v1/chat/completions).',
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    needsKey: true,
  },
]

export const DEFAULT_AI_SETTINGS: AiSettings = {
  backend: 'api',
  cli: 'claude',
  cliModel: 'opus',
  prompt: '',
  provider: 'openai',
  baseUrl: AI_PRESETS[0]!.baseUrl,
  model: AI_PRESETS[0]!.model,
  apiKey: '',
  allowWrites: true,
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') && !url.username && !url.password
  } catch {
    return false
  }
}

export function parseAiSettings(raw: unknown): AiSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const d = DEFAULT_AI_SETTINGS
  const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)
  const baseUrl = text(r.baseUrl)
  return {
    backend: r.backend === 'cli' ? 'cli' : 'api',
    cli: r.cli === 'codex' || r.cli === 'antigravity' ? r.cli : r.cli === 'gemini' ? 'antigravity' : 'claude',
    cliModel:
      typeof r.cliModel === 'string' && /^[\w.:@/-]{0,100}$/.test(r.cliModel.trim())
        ? r.cliModel.trim()
        : d.cliModel,
    prompt: typeof r.prompt === 'string' ? r.prompt.slice(0, 20_000) : '',
    provider: r.provider === 'anthropic' ? 'anthropic' : 'openai',
    baseUrl: baseUrl && isHttpUrl(baseUrl) ? baseUrl.replace(/\/+$/, '') : d.baseUrl,
    model: text(r.model, 200) ?? d.model,
    apiKey: text(r.apiKey, 500) ?? '',
    allowWrites: typeof r.allowWrites === 'boolean' ? r.allowWrites : d.allowWrites,
  }
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ProviderError'
  }
}

function parseJson(response: HttpResponse): Record<string, unknown> {
  let data: unknown
  try {
    data = JSON.parse(response.body)
  } catch {
    data = null
  }
  if (response.status < 200 || response.status >= 300) {
    const error = (data as { error?: { message?: unknown } | string } | null)?.error
    const message =
      typeof error === 'string' ? error : typeof error?.message === 'string' ? error.message : response.body
    throw new ProviderError(`${response.status}: ${String(message).slice(0, 300)}`, response.status)
  }
  if (typeof data !== 'object' || data === null) throw new ProviderError('Ungültige Antwort des Modells')
  return data as Record<string, unknown>
}

let callCounter = 0
const newCallId = () => `call_${Date.now().toString(36)}_${(callCounter++).toString(36)}`

/* ---------- Anthropic Messages API ---------- */

export function anthropicProvider(settings: AiSettings, http: HttpClient): ModelProvider {
  return {
    async chat({ system, messages, tools, signal }) {
      const body = {
        model: settings.model,
        max_tokens: 4096,
        system,
        ...(tools.length
          ? {
              tools: tools.map((t) => ({
                name: t.name,
                description: t.description,
                input_schema: t.inputSchema,
              })),
            }
          : {}),
        messages: messages.map((m) => ({
          role: m.role,
          content: m.parts.map((p) => {
            if (p.type === 'text') return { type: 'text', text: p.text }
            if (p.type === 'tool_call')
              return { type: 'tool_use', id: p.id, name: p.name, input: p.input ?? {} }
            return { type: 'tool_result', tool_use_id: p.id, content: p.output, is_error: p.isError === true }
          }),
        })),
      }
      const data = parseJson(
        await http({
          url: `${settings.baseUrl}/v1/messages`,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': settings.apiKey,
            'anthropic-version': '2023-06-01',
            // The key belongs to the user and stays on their device.
            'anthropic-dangerous-direct-browser-access': 'true',
          },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        }),
      )
      const content = Array.isArray(data.content) ? (data.content as Array<Record<string, unknown>>) : []
      const parts: Part[] = []
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string')
          parts.push({ type: 'text', text: block.text })
        if (block.type === 'tool_use' && typeof block.name === 'string')
          parts.push({
            type: 'tool_call',
            id: typeof block.id === 'string' ? block.id : newCallId(),
            name: block.name,
            input: block.input ?? {},
          })
      }
      return parts
    },
  }
}

/* ---------- OpenAI-compatible Chat Completions ---------- */

function toOpenAiMessages(system: string, messages: Message[]): unknown[] {
  const out: unknown[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    const text = m.parts
      .filter((p): p is Extract<Part, { type: 'text' }> => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
    if (m.role === 'assistant') {
      const calls = m.parts.filter((p): p is Extract<Part, { type: 'tool_call' }> => p.type === 'tool_call')
      out.push({
        role: 'assistant',
        content: text || null,
        ...(calls.length
          ? {
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: 'function',
                function: { name: c.name, arguments: JSON.stringify(c.input ?? {}) },
              })),
            }
          : {}),
      })
      continue
    }
    for (const p of m.parts)
      if (p.type === 'tool_result') out.push({ role: 'tool', tool_call_id: p.id, content: p.output })
    if (text) out.push({ role: 'user', content: text })
  }
  return out
}

export function openAiProvider(settings: AiSettings, http: HttpClient): ModelProvider {
  return {
    async chat({ system, messages, tools, signal }) {
      const body = {
        model: settings.model,
        messages: toOpenAiMessages(system, messages),
        // Some servers reject an empty tool list.
        ...(tools.length
          ? {
              tools: tools.map((t: ToolSpec) => ({
                type: 'function',
                function: { name: t.name, description: t.description, parameters: t.inputSchema },
              })),
            }
          : {}),
        stream: false,
      }
      const data = parseJson(
        await http({
          url: `${settings.baseUrl}/chat/completions`,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {}),
          },
          body: JSON.stringify(body),
          ...(signal ? { signal } : {}),
        }),
      )
      const choice = (Array.isArray(data.choices) ? data.choices[0] : undefined) as
        { message?: { content?: unknown; tool_calls?: unknown } } | undefined
      const message = choice?.message ?? {}
      const parts: Part[] = []
      if (typeof message.content === 'string' && message.content.trim())
        parts.push({ type: 'text', text: message.content })
      for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
        const fn = (call as { function?: { name?: unknown; arguments?: unknown } }).function
        if (typeof fn?.name !== 'string') continue
        let input: unknown = {}
        if (typeof fn.arguments === 'string') {
          try {
            input = JSON.parse(fn.arguments || '{}')
          } catch {
            input = { _invalidJson: fn.arguments }
          }
        } else if (typeof fn.arguments === 'object' && fn.arguments !== null) input = fn.arguments
        const id = (call as { id?: unknown }).id
        parts.push({
          type: 'tool_call',
          id: typeof id === 'string' && id ? id : newCallId(),
          name: fn.name,
          input,
        })
      }
      return parts
    },
  }
}

export function createProvider(settings: AiSettings, http: HttpClient): ModelProvider {
  return settings.provider === 'anthropic'
    ? anthropicProvider(settings, http)
    : openAiProvider(settings, http)
}
