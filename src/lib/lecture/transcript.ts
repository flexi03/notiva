/**
 * The lecture transcript as a Markdown page next to the slides:
 *
 *   # Mitschrift 14.10.2026
 *   ## Zusammenfassung        ← written by the assistant after the lecture
 *   ## Transkript
 *   ### Folie 3
 *   **[12:04] Sprecher A:** Heute geht es um …
 *
 * Live updates only rewrite the "## Transkript" section; everything else stays as the user (or the
 * AI) wrote it.
 */
import type { FrontmatterData } from '../frontmatter'
import { basename, dirname, joinPath } from '../path'
import type { Segment } from './transcribe'

export interface LectureEntry extends Segment {
  /** Slide (PDF page) the lecturer was on. */
  page: number
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`
}

/** Transcript grouped by slide; consecutive sentences of the same speaker become one paragraph. */
export function renderTranscript(entries: LectureEntry[], slideWord = 'Folie'): string {
  const out: string[] = []
  let page: number | null = null
  let paragraph: { speaker?: string | undefined; start: number; text: string[] } | null = null
  const flush = () => {
    if (!paragraph) return
    const who = paragraph.speaker ? ` ${speakerName(paragraph.speaker)}:` : ''
    out.push(`**[${clock(paragraph.start)}]${who}** ${paragraph.text.join(' ')}`, '')
    paragraph = null
  }
  for (const e of entries) {
    if (e.page !== page) {
      flush()
      page = e.page
      out.push(`### ${slideWord} ${page}`, '')
    }
    if (paragraph && paragraph.speaker === e.speaker && e.start - paragraph.start < 120)
      paragraph.text.push(e.text)
    else {
      flush()
      paragraph = { speaker: e.speaker, start: e.start, text: [e.text] }
    }
  }
  flush()
  return out.join('\n').trim()
}

function speakerName(label: string): string {
  return /^[A-Z]$/.test(label) ? `Sprecher ${label}` : label
}

const SECTION = /^## Transkript\s*$/m

/** Replaces the transcript section (or appends it). */
export function setTranscriptSection(body: string, transcript: string): string {
  const section = `## Transkript\n\n${transcript || '_Noch nichts aufgenommen._'}\n`
  const match = SECTION.exec(body)
  if (!match) return `${body.trimEnd()}${body.trim() ? '\n\n' : ''}${section}`
  const after = body.slice(match.index + match[0].length)
  const next = /^## /m.exec(after.replace(/^\n+/, ''))
  const rest = next ? after.replace(/^\n+/, '').slice(next.index) : ''
  return `${body.slice(0, match.index)}${section}${rest ? `\n${rest}` : ''}`
}

export function lecturePagePath(pdfPath: string, date: string): string {
  return joinPath(dirname(pdfPath), `${basename(pdfPath).replace(/\.pdf$/i, '')} – Mitschrift ${date}.md`)
}

export function lecturePage(
  pdfPath: string,
  date: string,
  dateLabel: string,
): { data: FrontmatterData; body: string } {
  return {
    data: { type: 'lecture', icon: '🎙️', pdf: basename(pdfPath), date },
    body: `Mitschrift vom ${dateLabel} zu [[${basename(pdfPath)}]].\n\n## Zusammenfassung\n\n_Wird nach der Vorlesung vom Assistenten erstellt._\n\n## Transkript\n\n_Noch nichts aufgenommen._\n`,
  }
}
