import { create } from 'zustand'
import { useApp } from '@/app/store'
import { notesPathFor, parseAnnotations } from '@/lib/annotations'
import { pdfText } from '@/lib/pdfText'

/**
 * What goes along with a question to the assistant: the open page or file – for PDFs the current
 * page, the whole PDF and/or the own highlights and comments. Shown above the input, each part can
 * be switched off; the message shows what was sent.
 */
export interface AiContextState {
  /** Open file (PDF …) and its current page – set by the viewer. */
  file: { path: string; page: number } | null
  include: { page: boolean; pdfPage: boolean; pdfAll: boolean; marks: boolean }
  setFile(file: { path: string; page: number } | null): void
  toggle(key: keyof AiContextState['include']): void
}

export const useAiContext = create<AiContextState>((set, get) => ({
  file: null,
  include: { page: true, pdfPage: true, pdfAll: false, marks: true },
  setFile: (file) => {
    const cur = get().file
    if (cur?.path === file?.path && cur?.page === file?.page) return
    set({ file })
  },
  toggle: (key) => set({ include: { ...get().include, [key]: !get().include[key] } }),
}))

const PAGE_MAX = 12_000
const PDF_MAX = 120_000
const texts = new Map<string, Promise<string>>()

/** Builds the context block and a short label per part ("Graphen.pdf · Seite 3"). */
export async function buildAiContext(): Promise<{ text: string; labels: string[] }> {
  const { ws, route, peek } = useApp.getState()
  const { file, include } = useAiContext.getState()
  if (!ws) return { text: '', labels: [] }
  const parts: string[] = []
  const labels: string[] = []
  const pagePath = peek ?? (route.name === 'page' ? route.path : null)
  if (include.page && pagePath && ws.get(pagePath)) {
    const page = ws.get(pagePath)!
    parts.push(`### Seite „${page.title}“ (${page.path})\n${page.body.slice(0, PAGE_MAX)}`)
    labels.push(page.title)
  }
  if (route.name === 'file' && file && file.path === route.path && /\.pdf$/i.test(file.path)) {
    const name = file.path.split('/').pop()!
    if (include.pdfPage || include.pdfAll) {
      let pending = texts.get(file.path)
      if (!pending) {
        pending = ws.vault.readBinary(file.path).then((bytes) => pdfText(bytes, 300).then((r) => r.text))
        texts.set(file.path, pending)
      }
      const all = await pending.catch(() => '')
      if (include.pdfAll) {
        parts.push(`### PDF „${name}“ (ganz)\n${all.slice(0, PDF_MAX)}`)
        labels.push(`${name} (ganz)`)
      } else {
        const section = all.split(/--- Seite \d+ ---/)[file.page] ?? ''
        parts.push(`### PDF „${name}“, Seite ${file.page}\n${section.trim().slice(0, PAGE_MAX)}`)
        labels.push(`${name} · S. ${file.page}`)
      }
    }
    if (include.marks) {
      const notes = ws.get(notesPathFor(file.path))
      const marks = parseAnnotations(notes?.data.annotations)
        .filter((a) => a.type === 'highlight' || a.type === 'note' || a.type === 'text')
        .map((a) => {
          const text = 'text' in a ? a.text : ''
          const comment = a.type === 'highlight' && a.comment ? ` – Kommentar: ${a.comment}` : ''
          return `- S. ${a.page}: ${a.type === 'highlight' ? `„${text}“` : text}${comment}`
        })
      if (marks.length) {
        parts.push(`### Markierungen und Notizen in „${name}“\n${marks.join('\n').slice(0, PAGE_MAX)}`)
        labels.push(`${marks.length} Markierungen`)
      }
    }
  }
  return parts.length
    ? {
        text: `<kontext>\nDer Nutzer hat Folgendes geöffnet (nur als Kontext):\n\n${parts.join('\n\n')}\n</kontext>`,
        labels,
      }
    : { text: '', labels: [] }
}
