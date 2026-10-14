/**
 * pdf.js in the app (viewer): a real worker thread and the font/CMap files served next to the app
 * (see vite.config.ts) – same origin, so nothing is loaded from the internet.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

let ready: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs')> | null = null

export function pdfjs() {
  ready ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
    if (!lib.GlobalWorkerOptions.workerPort && typeof Worker !== 'undefined')
      lib.GlobalWorkerOptions.workerPort = new Worker(workerUrl, { type: 'module' })
    return lib
  })
  return ready
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs()
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
  return lib.getDocument({
    data: bytes.slice(),
    cMapUrl: new URL('pdfjs/cmaps/', base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', base).href,
    enableXfa: false,
    verbosity: 0,
  }).promise
}

export type { PDFDocumentProxy }
