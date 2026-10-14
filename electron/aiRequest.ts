/** Validates AI HTTP requests from the renderer before the main process sends them. */

export interface AiRequest {
  url: string
  method: 'GET' | 'POST'
  headers: Record<string, string>
  body?: string
}

const MAX_BODY = 4_000_000

export function parseAiRequest(raw: unknown): AiRequest {
  if (typeof raw !== 'object' || raw === null) throw new Error('Invalid request')
  const r = raw as Record<string, unknown>
  if (typeof r.url !== 'string') throw new Error('Invalid URL')
  const url = new URL(r.url)
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password)
    throw new Error('Only http(s) URLs are allowed')
  const method = r.method === 'GET' ? 'GET' : r.method === 'POST' ? 'POST' : null
  if (!method) throw new Error('Invalid method')
  const headers: Record<string, string> = {}
  if (typeof r.headers === 'object' && r.headers !== null) {
    const entries = Object.entries(r.headers as Record<string, unknown>)
    if (entries.length > 20) throw new Error('Too many headers')
    for (const [key, value] of entries) {
      if (
        !/^[a-z0-9-]{1,64}$/i.test(key) ||
        typeof value !== 'string' ||
        value.length > 4000 ||
        /[\r\n]/.test(value)
      )
        throw new Error('Invalid header')
      headers[key] = value
    }
  }
  if (r.body !== undefined && (typeof r.body !== 'string' || r.body.length > MAX_BODY))
    throw new Error('Invalid body')
  return { url: url.toString(), method, headers, ...(typeof r.body === 'string' ? { body: r.body } : {}) }
}
