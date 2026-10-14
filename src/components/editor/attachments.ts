import { dirname, joinPath, toFileName, uniquePath } from '@/lib/path'
import type { Workspace } from '@/lib/workspace'

const ALLOWED = /^image\/(png|jpe?g|gif|webp|svg\+xml|avif)$/

/** Stores an image next to the page ("<folder>/attachments/…") and returns Markdown for it. */
export async function saveAttachment(ws: Workspace, pagePath: string, file: File): Promise<string> {
  if (!ALLOWED.test(file.type)) throw new Error(`Dateityp nicht erlaubt: ${file.type}`)
  if (file.size > 20 * 1024 * 1024) throw new Error('Bild ist größer als 20 MB')
  const ext = file.type === 'image/svg+xml' ? 'svg' : file.type.split('/')[1]!.replace('jpeg', 'jpg')
  const base = toFileName(file.name.replace(/\.[^.]+$/, '') || `bild-${Date.now()}`)
  const folder = joinPath(dirname(pagePath), 'attachments')
  const path = uniquePath(joinPath(folder, `${base}.${ext}`), (p) => ws.has(p))
  await ws.writeFile(path, new Uint8Array(await file.arrayBuffer()))
  const relative = path.slice(dirname(pagePath) ? dirname(pagePath).length + 1 : 0)
  return `![${base}](${encodeURI(relative)})`
}

export function pickImageFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = () => resolve(input.files?.[0] ?? null)
    input.oncancel = () => resolve(null)
    input.click()
  })
}
