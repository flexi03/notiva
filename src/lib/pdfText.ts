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
