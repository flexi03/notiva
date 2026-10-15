import { create } from 'zustand'
import { useApp } from '@/app/store'
import { getLanguage } from '@/i18n'
import { toIsoDate } from '@/lib/dates'
import type { Chunk } from '@/lib/lecture/audio'
import { encodeWav, normalize } from '@/lib/lecture/audio'
import { buildSlideIndex, followSlide, type FollowState, type SlideIndex } from '@/lib/lecture/slideMatch'
import {
  DEFAULT_TRANSCRIBE,
  describeTranscribeError,
  parseTranscribeSettings,
  parseTranscription,
  transcriptionRequest,
  type TranscribeSettings,
} from '@/lib/lecture/transcribe'
import {
  lecturePage,
  lecturePagePath,
  renderTranscript,
  setTranscriptSection,
  type LectureEntry,
} from '@/lib/lecture/transcript'
import { basename, dirname } from '@/lib/path'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'
import { LiveRecorder } from './recorder'

const SETTINGS_KEY = 'notiva.transcribe'

export function loadTranscribeSettings(): TranscribeSettings {
  try {
    return parseTranscribeSettings(
      JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null') ?? DEFAULT_TRANSCRIBE,
    )
  } catch {
    return DEFAULT_TRANSCRIBE
  }
}

export function saveTranscribeSettings(settings: TranscribeSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Not remembered in private mode.
  }
}

/** Sends one WAV chunk (desktop: through the main process; browser: directly). */
export async function sendChunk(
  settings: TranscribeSettings,
  wav: Uint8Array,
  prompt: string,
): Promise<{ status: number; body: string }> {
  const request = transcriptionRequest(settings, prompt)
  const bridge = electronBridge()
  if (settings.preset === 'local') {
    if (!bridge?.whisper) return { status: 0, body: 'Lokales Whisper gibt es nur in der Desktop-App.' }
    return bridge.whisper.transcribe({
      model: settings.model,
      language: settings.language,
      fields: request.fields,
      audio: wav,
    })
  }
  if (bridge?.transcribe)
    return bridge.transcribe({
      url: request.url,
      headers: request.headers,
      fields: request.fields,
      audio: wav,
    })
  const form = new FormData()
  for (const [k, v] of Object.entries(request.fields)) form.append(k, v)
  form.append('file', new Blob([wav.slice()], { type: 'audio/wav' }), request.filename)
  try {
    const response = await fetch(request.url, { method: 'POST', body: form, headers: request.headers })
    return { status: response.status, body: await response.text() }
  } catch (e) {
    return { status: 0, body: e instanceof Error ? e.message : String(e) }
  }
}

type Status = 'idle' | 'starting' | 'recording' | 'paused' | 'finishing' | 'done'

interface LectureState {
  status: Status
  pdfPath: string | null
  /** The transcript page. */
  pagePath: string | null
  entries: LectureEntry[]
  /** Slide the lecturer is on (detected). */
  slide: number
  follow: boolean
  level: number
  /** Chunks waiting for / in transcription. */
  pending: number
  startedAt: number
  /** Seconds recorded (pauses excluded). */
  elapsed: number
  error: string | null
  start(
    ws: Workspace,
    pdfPath: string,
    slideTexts: string[],
    startPage: number,
    keepAudio: boolean,
  ): Promise<void>
  pause(): void
  resume(): void
  stop(): Promise<void>
  setFollow(follow: boolean): void
  /** The user moved to another slide by hand: matching continues from there. */
  setSlide(page: number): void
  reset(): void
}

let recorder: LiveRecorder | null = null
let index: SlideIndex | null = null
let follow: FollowState = { page: 1, candidate: null }
let queue: Promise<void> = Promise.resolve()
let workspace: Workspace | null = null
let slideTexts: string[] = []
let ticker: ReturnType<typeof setInterval> | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null

/**
 * One live lecture at a time: records, transcribes chunk by chunk (in order), follows the slides
 * and keeps the transcript page up to date.
 */
export const useLecture = create<LectureState>((set, get) => {
  const writePage = (now = false) => {
    if (writeTimer) clearTimeout(writeTimer)
    const run = () => {
      const { pagePath, entries } = get()
      const page = pagePath ? workspace?.get(pagePath) : undefined
      if (!workspace || !page) return
      void workspace.save(page.path, { body: setTranscriptSection(page.body, renderTranscript(entries)) })
    }
    if (now) run()
    else writeTimer = setTimeout(run, 1500)
  }

  const transcribe = (chunk: Chunk) => {
    if (chunk.silent) return
    set((s) => ({ pending: s.pending + 1 }))
    queue = queue.then(async () => {
      const settings = loadTranscribeSettings()
      const last = get().entries.at(-1)?.text ?? ''
      const slideText = (slideTexts[follow.page - 1] ?? '').slice(0, 400)
      try {
        const response = await sendChunk(
          settings,
          encodeWav(normalize(chunk.samples)),
          `${slideText}\n${last}`,
        )
        if (response.status !== 200)
          throw new Error(describeTranscribeError(response.status, response.body, settings))
        const segments = parseTranscription(JSON.parse(response.body), chunk.start, chunk.end)
        // Each segment gets its own slide: the text of this and the previous segment decides.
        const placed: LectureEntry[] = []
        let previous = get().entries.at(-1)?.text ?? ''
        for (const seg of segments) {
          if (index) follow = followSlide(index, `${previous} ${seg.text}`, follow)
          placed.push({ ...seg, page: follow.page })
          previous = seg.text
        }
        set((s) => ({ entries: [...s.entries, ...placed], slide: follow.page, error: null }))
        writePage()
      } catch (e) {
        set({ error: e instanceof Error ? e.message : String(e) })
      } finally {
        set((s) => ({ pending: s.pending - 1 }))
      }
    })
  }

  return {
    status: 'idle',
    pdfPath: null,
    pagePath: null,
    entries: [],
    slide: 1,
    follow: true,
    level: 0,
    pending: 0,
    startedAt: 0,
    elapsed: 0,
    error: null,

    async start(ws, pdfPath, texts, startPage, keepAudio) {
      if (get().status === 'recording' || get().status === 'paused') return
      set({ status: 'starting', error: null, entries: [], pdfPath, slide: startPage, elapsed: 0, pending: 0 })
      workspace = ws
      slideTexts = texts
      index = buildSlideIndex(texts)
      follow = { page: startPage, candidate: null }
      try {
        recorder = new LiveRecorder(transcribe, (level) => set({ level }))
        await recorder.start(keepAudio)
      } catch (e) {
        recorder = null
        set({ status: 'idle', error: e instanceof Error ? e.message : String(e) })
        return
      }
      const date = toIsoDate(new Date())
      const target = lecturePagePath(pdfPath, date)
      let pagePath = ws.get(target)?.path ?? null
      if (!pagePath) {
        const { data, body } = lecturePage(
          pdfPath,
          date,
          new Date().toLocaleDateString(getLanguage() === 'de' ? 'de-DE' : 'en-US'),
        )
        pagePath = await ws.createPage({
          folder: dirname(pdfPath),
          title: basename(target, '.md'),
          data,
          body,
        })
      }
      set({ status: 'recording', pagePath, startedAt: Date.now() })
      ticker = setInterval(() => {
        if (get().status === 'recording') set((s) => ({ elapsed: s.elapsed + 1 }))
      }, 1000)
    },

    pause() {
      if (get().status !== 'recording') return
      recorder?.pause()
      set({ status: 'paused' })
    },

    resume() {
      if (get().status !== 'paused') return
      recorder?.resume()
      set({ status: 'recording' })
    },

    async stop() {
      if (get().status !== 'recording' && get().status !== 'paused') return
      set({ status: 'finishing' })
      if (ticker) clearInterval(ticker)
      const audio = await recorder?.stop()
      recorder = null
      await queue
      writePage(true)
      const { pagePath } = get()
      if (audio && workspace && pagePath) {
        const audioPath = pagePath.replace(/\.md$/, '.webm')
        await workspace.writeFile(audioPath, new Uint8Array(await audio.arrayBuffer()))
        const page = workspace.get(pagePath)
        if (page) await workspace.save(pagePath, { data: { ...page.data, audio: basename(audioPath) } })
      }
      set({ status: 'done', level: 0 })
    },

    setFollow: (value) => set({ follow: value }),
    setSlide(page) {
      follow = { page, candidate: null }
      set({ slide: page })
    },
    reset() {
      if (get().status === 'recording' || get().status === 'paused') return
      set({ status: 'idle', entries: [], pagePath: null, pdfPath: null, error: null, elapsed: 0 })
    },
  }
})

/** Lets the assistant summarize the transcript – the prompt is visible in the chat. */
export function summarizeLecture(pagePath: string, pdfPath: string): void {
  const prompt = [
    `Lies die Mitschrift [[${basename(pagePath, '.md')}]] (Vorlesung zu [[${basename(pdfPath)}]]) und schreib eine Zusammenfassung`,
    'in den Abschnitt „## Zusammenfassung“ dieser Seite (ersetze den Platzhalter, ändere das Transkript nicht). Enthalten soll sie:',
    '- die Kernaussagen je Folie bzw. Thema,',
    '- Definitionen, Formeln und Beispiele,',
    '- alles, was als prüfungs-/klausurrelevant genannt wurde,',
    '- Termine, Aufgaben und organisatorische Hinweise,',
    '- Fragen aus dem Publikum mit den Antworten (Sprecher-Labels können zwischen Abschnitten wechseln – erkenne Dozent und Fragende am Inhalt),',
    '- offene Punkte zum Nacharbeiten.',
    'Nutze die Folien (read_file) für die richtigen Fachbegriffe.',
  ].join('\n')
  void import('@/app/assistant').then(({ useAssistant }) => {
    useApp.getState().openView('assistant')
    void useAssistant.getState().send(prompt)
  })
}
