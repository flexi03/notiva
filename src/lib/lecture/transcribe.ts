/**
 * Speech to text over the OpenAI-style `/audio/transcriptions` endpoint – spoken by OpenAI, Groq
 * and local Whisper servers (whisper.cpp, faster-whisper-server, LocalAI …). Pure request building
 * and response parsing; the app sends the request (desktop: main process).
 */

export interface TranscribeSettings {
  preset: string
  baseUrl: string
  apiKey: string
  model: string
  /** ISO code or '' for automatic. */
  language: string
  /** Ask for speaker labels (only models that support it, e.g. gpt-4o-transcribe-diarize). */
  diarize: boolean
}

export interface TranscribePreset {
  id: string
  label: string
  baseUrl: string
  model: string
  diarize: boolean
  needsKey: boolean
  hint: string
}

export const TRANSCRIBE_PRESETS: TranscribePreset[] = [
  {
    id: 'local',
    label: 'Lokal mit Whisper – kostenlos, offline',
    baseUrl: '',
    model: 'large-v3-turbo-q5_0',
    diarize: false,
    needsKey: false,
    hint: 'Läuft komplett auf deinem Rechner (whisper.cpp). Notiva richtet es ein: Programm installieren, Modell laden – danach startet es von selbst.',
  },
  {
    id: 'local-server',
    label: 'Eigener Whisper-Server',
    baseUrl: 'http://127.0.0.1:8080/v1',
    model: 'whisper-1',
    diarize: false,
    needsKey: false,
    hint: 'Ein OpenAI-kompatibler Server, den du selbst betreibst (faster-whisper-server, LocalAI, whisper.cpp …).',
  },
  {
    id: 'openai-diarize',
    label: 'OpenAI mit Sprechererkennung',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-transcribe-diarize',
    diarize: true,
    needsKey: true,
    hint: 'Erkennt verschiedene Sprecher (Dozent, Fragen aus dem Publikum). Kostet pro Minute, API-Schlüssel von platform.openai.com.',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-transcribe',
    diarize: false,
    needsKey: true,
    hint: 'Sehr genau, ohne Sprecher. API-Schlüssel von platform.openai.com.',
  },
  {
    id: 'groq',
    label: 'Groq (Whisper)',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'whisper-large-v3-turbo',
    diarize: false,
    needsKey: true,
    hint: 'Schnell und günstig, ohne Sprecher. API-Schlüssel von console.groq.com.',
  },
]

export const DEFAULT_TRANSCRIBE: TranscribeSettings = {
  preset: 'local',
  baseUrl: 'http://127.0.0.1:8080/v1',
  apiKey: '',
  model: 'large-v3-turbo-q5_0',
  language: 'de',
  diarize: false,
}

export function parseTranscribeSettings(raw: unknown): TranscribeSettings {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const str = (v: unknown, fallback: string, max = 500) =>
    typeof v === 'string' && v.length <= max ? v : fallback
  const baseUrl = str(r.baseUrl, DEFAULT_TRANSCRIBE.baseUrl).trim().replace(/\/+$/, '')
  return {
    preset: str(r.preset, DEFAULT_TRANSCRIBE.preset, 40),
    baseUrl: /^https?:\/\//i.test(baseUrl) ? baseUrl : DEFAULT_TRANSCRIBE.baseUrl,
    apiKey: str(r.apiKey, ''),
    model: str(r.model, DEFAULT_TRANSCRIBE.model, 100).trim() || DEFAULT_TRANSCRIBE.model,
    language: /^([a-z]{2})?$/.test(str(r.language, 'de', 5)) ? str(r.language, 'de', 5) : 'de',
    diarize: r.diarize === true,
  }
}

export interface TranscriptionRequest {
  url: string
  headers: Record<string, string>
  /** Form fields besides the file. */
  fields: Record<string, string>
  filename: string
}

/**
 * The multipart request for one audio chunk. `prompt` (vocabulary: slide text, previous sentence)
 * helps with technical terms; diarizing models don't take one.
 */
export function transcriptionRequest(settings: TranscribeSettings, prompt = ''): TranscriptionRequest {
  const diarize = settings.diarize
  const fields: Record<string, string> = { model: settings.model }
  if (settings.language) fields.language = settings.language
  if (diarize) {
    fields.response_format = 'diarized_json'
    fields.chunking_strategy = 'auto'
  } else {
    // whisper-style models give timestamps; gpt-4o-transcribe only knows json/text.
    fields.response_format = /^gpt-4o/.test(settings.model) ? 'json' : 'verbose_json'
    if (prompt.trim()) fields.prompt = prompt.trim().slice(-800)
  }
  return {
    url: `${settings.baseUrl}/audio/transcriptions`,
    headers: settings.apiKey ? { authorization: `Bearer ${settings.apiKey}` } : {},
    fields,
    filename: 'chunk.wav',
  }
}

export interface Segment {
  /** Seconds since the recording started. */
  start: number
  end: number
  text: string
  speaker?: string
}

/**
 * Segments of one chunk's answer (json, verbose_json or diarized_json), with times shifted to the
 * whole recording. Whisper "hallucinations" on silence are dropped.
 */
export function parseTranscription(raw: unknown, chunkStart: number, chunkEnd: number): Segment[] {
  if (typeof raw !== 'object' || raw === null) return []
  const r = raw as { text?: unknown; segments?: unknown }
  const clean = (s: unknown) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '')
  const segments: Segment[] = []
  if (Array.isArray(r.segments)) {
    for (const s of r.segments) {
      if (typeof s !== 'object' || s === null) continue
      const seg = s as Record<string, unknown>
      const raw = typeof seg.text === 'string' ? seg.text : ''
      const start = typeof seg.start === 'number' ? seg.start : 0
      const end = typeof seg.end === 'number' ? seg.end : start
      const speaker = clean(seg.speaker)
      const previous = segments[segments.length - 1]
      // whisper.cpp may cut a segment inside a word ("Die L" | "aufzeit"): no leading space = same word.
      if (previous && raw && !/^\s/.test(raw) && previous.speaker === (speaker || undefined)) {
        previous.text = clean(previous.text + raw)
        previous.end = Math.min(chunkEnd, chunkStart + end)
        continue
      }
      segments.push({
        start: chunkStart + start,
        end: Math.min(chunkEnd, chunkStart + end),
        text: clean(raw),
        ...(speaker ? { speaker } : {}),
      })
    }
  } else if (clean(r.text)) segments.push({ start: chunkStart, end: chunkEnd, text: clean(r.text) })
  return segments.filter((s) => s.text && !isHallucination(s.text))
}

const HALLUCINATIONS = [
  /^untertitel (im auftrag|der amara|von)/i,
  /^vielen dank( fürs zuschauen| für ihre aufmerksamkeit)?[.!]?$/i,
  /^thank you( for watching)?[.!]?$/i,
  /^\[?(musik|music|applaus|stille|silence)\]?\.?$/i,
  /^\.+$/,
]

function isHallucination(text: string): boolean {
  return HALLUCINATIONS.some((re) => re.test(text.trim()))
}

/** Readable error for failed requests (wrong key, server not running …). */
export function describeTranscribeError(status: number, body: string, settings: TranscribeSettings): string {
  if (status === 0)
    return settings.preset === 'local-server'
      ? `Der Whisper-Server unter ${settings.baseUrl} antwortet nicht – läuft er?`
      : settings.preset === 'local'
        ? body || 'Der lokale Whisper läuft nicht.'
        : `Keine Verbindung zu ${settings.baseUrl}.`
  if (status === 401 || status === 403)
    return 'Der API-Schlüssel wurde abgelehnt – in den Einstellungen unter Transkription prüfen.'
  if (status === 404)
    return `Unter ${settings.baseUrl}/audio/transcriptions gibt es keine Transkription (Adresse oder Modell prüfen).`
  if (status === 429) return 'Zu viele Anfragen oder Guthaben aufgebraucht (429).'
  const message = (() => {
    try {
      return (JSON.parse(body) as { error?: { message?: string } }).error?.message ?? ''
    } catch {
      return body.slice(0, 200)
    }
  })()
  return `Transkription fehlgeschlagen (${status})${message ? `: ${message}` : ''}`
}
