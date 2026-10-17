import { create } from 'zustand'
import { isPdf } from '@/app/materials'
import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { pageTexts } from '@/lib/pdfText'
import { PdfSearch, type PdfTextEntry } from '@/lib/pdfSearch'
import { textHash } from '@/lib/textHash'

const MAX_PAGES = 500
import type { Workspace } from '@/lib/workspace'

/**
 * The text of every PDF in the folder, page by page, for the search (⌘K "In Skripten"). Read once
 * in the background and kept in `.notiva/cache/pdf/` (one small file per PDF, never in Git); only
 * new or changed PDFs are read again.
 */
export const usePdfSearch = create<{ search: PdfSearch; version: number; indexing: boolean }>(() => ({
  search: new PdfSearch(),
  version: 0,
  indexing: false,
}))

/** Opens a PDF of the folder in pdf.js' worker and reads the text of its pages (then closes it). */
export async function readPdfPages(
  ws: Workspace,
  path: string,
  max = MAX_PAGES,
  gap = '',
): Promise<string[]> {
  const { openPdf } = await import('@/lib/pdfjs')
  const doc = await openPdf(await ws.vault.readBinary(path))
  try {
    return await pageTexts(doc, max, gap)
  } finally {
    await doc.loadingTask.destroy()
  }
}

const cacheName = (path: string) => `cache/pdf/${textHash(path)}.json`
/** What is in the search right now: path → size and mtime it was read with. */
const known = new Map<string, { size: number; mtime: number }>()
let running: Promise<void> | null = null
/** Up to this many PDFs are read without a progress bar (a few new scripts). */
const QUIET = 10

function validEntry(raw: unknown, path: string): PdfTextEntry | null {
  const e = raw as Partial<PdfTextEntry> | null
  if (!e || e.path !== path || typeof e.size !== 'number' || typeof e.mtime !== 'number') return null
  if (!Array.isArray(e.pages) || !e.pages.every((p) => typeof p === 'string')) return null
  return e as PdfTextEntry
}

/** Brings the search up to date with the folder (call when searching; cheap when nothing changed). */
export function ensurePdfIndex(ws: Workspace): Promise<void> {
  running ??= (async () => {
    const { search } = usePdfSearch.getState()
    const pdfs = ws.assets().filter((f) => isPdf(f.path))
    const present = new Set(pdfs.map((f) => f.path))
    for (const path of [...known.keys()])
      if (!present.has(path)) {
        search.remove(path)
        known.delete(path)
      }
    const todo: typeof pdfs = []
    for (const f of pdfs) {
      const k = known.get(f.path)
      if (k && k.size === f.size && k.mtime === f.mtime) continue
      const cached = validEntry(await ws.readMeta<unknown>(cacheName(f.path)), f.path)
      if (cached && cached.size === f.size && cached.mtime === f.mtime) {
        search.add(cached)
        known.set(f.path, f)
      } else todo.push(f)
    }
    usePdfSearch.setState((s) => ({ version: s.version + 1 }))
    if (!todo.length) return
    usePdfSearch.setState({ indexing: true })
    const read = async (update: (done: number, detail: string) => void) => {
      for (const [i, f] of todo.entries()) {
        update(i, f.path.slice(f.path.lastIndexOf('/') + 1))
        let pages: string[] = []
        try {
          pages = await readPdfPages(ws, f.path)
        } catch {
          // Damaged or protected: remembered as empty, not tried again until it changes.
        }
        const entry: PdfTextEntry = { path: f.path, size: f.size, mtime: f.mtime, pages }
        await ws.writeMeta(cacheName(f.path), entry, { compact: true })
        search.add(entry)
        known.set(f.path, f)
        // Results appear while reading, every few files.
        if (i % 5 === 4) usePdfSearch.setState((s) => ({ version: s.version + 1 }))
      }
    }
    try {
      if (todo.length <= QUIET) await read(() => undefined)
      else
        await withProgress(
          t('pdfSearch.indexing'),
          (task) => read((done, detail) => task.update(done, todo.length, detail)),
          { success: () => t('pdfSearch.indexed', { count: todo.length }) },
        )
    } finally {
      usePdfSearch.setState((s) => ({ indexing: false, version: s.version + 1 }))
    }
  })().finally(() => (running = null))
  return running
}
