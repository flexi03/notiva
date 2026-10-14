// The worker module is imported only to run pdf.js on the main thread (see pdfText.ts).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}
