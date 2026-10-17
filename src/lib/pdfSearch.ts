/**
 * Full-text search in the PDFs of the folder (scripts, sheets …): one entry per page, so a hit
 * opens the right page. The texts come from a cache (app/pdfIndex); this is pure logic.
 */
import MiniSearch from 'minisearch'
import { snippet } from './plainText'

/** What is remembered per PDF (size and mtime tell whether it must be read again). */
export interface PdfTextEntry {
  path: string
  size: number
  mtime: number
  pages: string[]
}

export interface PdfHit {
  path: string
  /** 1-based */
  page: number
  snippet: string
  score: number
}

export class PdfSearch {
  private index = new MiniSearch<{ id: string; name: string; text: string }>({
    fields: ['name', 'text'],
    storeFields: [],
    searchOptions: { boost: { name: 2 }, prefix: true, fuzzy: 0.2, combineWith: 'AND' },
  })
  private texts = new Map<string, string>()

  constructor(entries: PdfTextEntry[] = []) {
    for (const e of entries) this.add(e)
  }

  /** Adds (or replaces) a PDF. */
  add(entry: PdfTextEntry): void {
    this.remove(entry.path)
    const name = entry.path.slice(entry.path.lastIndexOf('/') + 1).replace(/\.pdf$/i, '')
    entry.pages.forEach((text, i) => {
      if (!text.trim()) return
      const id = `${entry.path}#${i + 1}`
      this.texts.set(id, text.replace(/\s+/g, ' '))
      this.index.add({ id, name, text })
    })
  }

  remove(path: string): void {
    for (const id of [...this.texts.keys()])
      if (id.startsWith(`${path}#`)) {
        this.index.discard(id)
        this.texts.delete(id)
      }
  }

  get size(): number {
    return this.texts.size
  }

  search(query: string, limit = 20): PdfHit[] {
    const q = query.trim()
    if (!q) return []
    return this.index
      .search(q)
      .slice(0, limit)
      .map((hit) => {
        const id = String(hit.id)
        const cut = id.lastIndexOf('#')
        return {
          path: id.slice(0, cut),
          page: Number(id.slice(cut + 1)),
          snippet: snippet(this.texts.get(id) ?? '', hit.terms),
          score: hit.score,
        }
      })
  }
}
