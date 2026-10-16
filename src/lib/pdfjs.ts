/**
 * pdf.js in the app (viewer): a real worker thread and the font/CMap files served next to the app
 * (see vite.config.ts) – same origin, so nothing is loaded from the internet.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url'

type Lib = typeof import('pdfjs-dist/legacy/build/pdf.mjs')
let ready: Promise<Lib> | null = null
/**
 * One worker for every document, owned here: a document passed its own worker never tears it down
 * on `destroy()`. With pdf.js' shared port, closing one PDF while another opens failed with
 * "PDFWorker.create – the worker is being destroyed".
 */
let shared: InstanceType<Lib['PDFWorker']> | null = null

export function pdfjs() {
  ready ??= import('pdfjs-dist/legacy/build/pdf.mjs').then((lib) => {
    if (!shared && typeof Worker !== 'undefined')
      // (The typings say `port?: null`, the code takes a Worker.)
      shared = new lib.PDFWorker({ port: new Worker(workerUrl, { type: 'module' }) as unknown as null })
    return lib
  })
  return ready
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const lib = await pdfjs()
  const base = typeof document !== 'undefined' ? document.baseURI : 'http://localhost/'
  return lib.getDocument({
    data: bytes.slice(),
    ...(shared ? { worker: shared } : {}),
    cMapUrl: new URL('pdfjs/cmaps/', base).href,
    cMapPacked: true,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', base).href,
    enableXfa: false,
    verbosity: 0,
  }).promise
}

export type { PDFDocumentProxy }
