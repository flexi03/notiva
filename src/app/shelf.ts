import { freeShelfPath, textItemName } from '@/lib/shelf'
import type { Workspace } from '@/lib/workspace'

/** Puts a text into the shelf ("Ablage/<Datum> <erste Worte>.md"); returns its path. */
export async function addShelfText(ws: Workspace, text: string, now = new Date()): Promise<string | null> {
  const body = text.trim()
  if (!body) return null
  const path = freeShelfPath(`${textItemName(body, now)}.md`, (p) => ws.has(p))
  await ws.writeFile(path, `${body}\n`)
  return path
}

/** Puts a file (photo, PDF …) into the shelf under its own name; returns its path. */
export async function addShelfFile(ws: Workspace, name: string, bytes: Uint8Array): Promise<string> {
  const path = freeShelfPath(name, (p) => ws.has(p))
  await ws.writeFile(path, bytes)
  return path
}
