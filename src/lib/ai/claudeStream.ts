/**
 * Claude Code (`claude -p --output-format stream-json`) prints one JSON event per line. These
 * functions turn them into the assistant's message parts, so CLI and API chats look the same.
 */
import type { Message, Part } from './agent'
import { findTool } from './tools'

const PREFIX = 'mcp__notiva__'

export interface StreamUpdate {
  message?: Message
  session?: { id: string; model?: string }
  result?: { isError: boolean; text: string; costUsd?: number }
}

const text = (content: unknown): string =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content
          .map((c) =>
            typeof c === 'object' && c && (c as { type?: unknown }).type === 'text'
              ? String((c as { text?: unknown }).text ?? '')
              : '',
          )
          .join('')
      : ''

/** Paths a write tool reported back (`{"path": …}`), for links in the chat. */
function touched(name: string, output: string): string[] {
  if (findTool(name)?.readOnly !== false) return []
  try {
    const path = (JSON.parse(output) as { path?: unknown }).path
    return typeof path === 'string' ? [path] : []
  } catch {
    return []
  }
}

/**
 * Parses one line of stream-json output. `names` remembers tool names per call id (results only
 * carry the id). Unknown or malformed lines are ignored.
 */
export function parseClaudeLine(line: string, names: Map<string, string>): StreamUpdate {
  let event: Record<string, unknown>
  try {
    event = JSON.parse(line) as Record<string, unknown>
  } catch {
    return {}
  }
  if (typeof event !== 'object' || event === null) return {}

  if (event.type === 'system' && event.subtype === 'init' && typeof event.session_id === 'string')
    return {
      session: { id: event.session_id, ...(typeof event.model === 'string' ? { model: event.model } : {}) },
    }

  const message = event.message as { content?: unknown; model?: unknown } | undefined
  const blocks = Array.isArray(message?.content) ? (message.content as Array<Record<string, unknown>>) : []

  if (event.type === 'assistant') {
    const parts: Part[] = []
    for (const block of blocks) {
      if (block.type === 'text' && typeof block.text === 'string' && block.text.trim())
        parts.push({ type: 'text', text: block.text })
      if (block.type === 'tool_use' && typeof block.name === 'string' && typeof block.id === 'string') {
        const name = block.name.startsWith(PREFIX) ? block.name.slice(PREFIX.length) : block.name
        names.set(block.id, name)
        parts.push({ type: 'tool_call', id: block.id, name, input: block.input ?? {} })
      }
    }
    const update: StreamUpdate = parts.length ? { message: { role: 'assistant', parts } } : {}
    if (typeof message?.model === 'string' && typeof event.session_id === 'string')
      update.session = { id: event.session_id, model: message.model }
    return update
  }

  if (event.type === 'user') {
    const parts: Part[] = []
    for (const block of blocks) {
      if (block.type !== 'tool_result' || typeof block.tool_use_id !== 'string') continue
      const name = names.get(block.tool_use_id) ?? 'unbekannt'
      const output = text(block.content)
      const paths = block.is_error === true ? [] : touched(name, output)
      parts.push({
        type: 'tool_result',
        id: block.tool_use_id,
        name,
        output,
        ...(block.is_error === true ? { isError: true } : {}),
        ...(paths.length ? { touched: paths } : {}),
      })
    }
    return parts.length ? { message: { role: 'user', parts } } : {}
  }

  if (event.type === 'result') {
    return {
      result: {
        isError: event.is_error === true,
        text: typeof event.result === 'string' ? event.result : '',
        ...(typeof event.total_cost_usd === 'number' ? { costUsd: event.total_cost_usd } : {}),
      },
      ...(typeof event.session_id === 'string' ? { session: { id: event.session_id } } : {}),
    }
  }
  return {}
}
