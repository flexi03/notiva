/**
 * Text of a PDF (Modulhandbuch, Notenspiegel, Stundenplan …) for the AI tools. pdf.js is loaded
 * only when needed and runs without a worker thread, so it works in the app and in the MCP server.
 * Only text is read: no scripting, no XFA forms, no font loading.
 */
export async function pdfText(bytes: Uint8Array, maxPages = 60): Promise<{ text: string; pages: number }> {
  const g = globalThis as { pdfjsWorker?: unknown }
  if (!g.pdfjsWorker) g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: false,
    // Only the text is needed – no font warnings in the console.
    verbosity: 0,
  })
  const doc = await task.promise
  try {
    const parts: string[] = []
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let line = ''
      const lines: string[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue
        line += item.str
        if (item.hasEOL) {
          lines.push(line)
          line = ''
        }
      }
      if (line) lines.push(line)
      parts.push(`--- Seite ${n} ---\n${lines.map((l) => l.trimEnd()).join('\n')}`)
    }
    return { text: parts.join('\n\n'), pages: doc.numPages }
  } finally {
    await task.destroy()
  }
}

export interface PdfTextItem {
  /** Position on the page as shown (rotation applied): x to the right, y downwards. */
  x: number
  y: number
  /** Width as shown. */
  w: number
  str: string
}

/** Text pieces with their positions per page – for tables (e.g. exam plans in landscape). */
export async function pdfTextItems(bytes: Uint8Array, maxPages = 40): Promise<PdfTextItem[][]> {
  const g = globalThis as { pdfjsWorker?: unknown }
  if (!g.pdfjsWorker) g.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const task = pdfjs.getDocument({
    data: bytes.slice(),
    enableXfa: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: false,
    verbosity: 0,
  })
  const doc = await task.promise
  try {
    const pages: PdfTextItem[][] = []
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: PdfTextItem[] = []
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue
        const [, , , , x, y] = pdfjs.Util.transform(viewport.transform, item.transform) as number[]
        items.push({ x: x!, y: y!, w: item.width * viewport.scale, str: item.str })
      }
      pages.push(items)
    }
    return pages
  } finally {
    await task.destroy()
  }
}
