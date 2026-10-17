import { useCallback } from 'react'
import { useWorkspace } from '@/app/store'
import {
  notesPageData,
  notesPathFor,
  pageNote,
  parseAnnotations,
  serializeAnnotations,
  setPageNote,
  type Annotation,
} from '@/lib/annotations'
import { basename, dirname } from '@/lib/path'
import type { Workspace } from '@/lib/workspace'

/** Notes pages being created – two quick edits must not create the page twice. */
const creating = new Map<string, Promise<string>>()

/** The PDF's notes page – created on the first change ("<Name> (Notizen).md" next to it). */
export function ensureNotesPage(ws: Workspace, pdfPath: string): Promise<string> {
  const notesPath = notesPathFor(pdfPath)
  if (ws.get(notesPath)) return Promise.resolve(notesPath)
  let pending = creating.get(notesPath)
  if (!pending) {
    pending = ws
      .createPage({
        folder: dirname(pdfPath),
        title: basename(notesPath, '.md'),
        data: notesPageData(pdfPath),
        body: `Notizen zu [[${basename(pdfPath)}]].\n`,
      })
      .finally(() => creating.delete(notesPath))
    creating.set(notesPath, pending)
  }
  return pending
}

/** The PDF's annotations as stored (none without a notes page). */
export function readAnnotations(ws: Workspace, pdfPath: string): Annotation[] {
  return parseAnnotations(ws.get(notesPathFor(pdfPath))?.data.annotations)
}

export async function writeAnnotations(ws: Workspace, pdfPath: string, list: Annotation[]): Promise<void> {
  const path = await ensureNotesPage(ws, pdfPath)
  await ws.setProperty(path, 'annotations', serializeAnnotations(list))
}

export async function writePageNote(
  ws: Workspace,
  pdfPath: string,
  pageNumber: number,
  text: string,
): Promise<void> {
  const path = await ensureNotesPage(ws, pdfPath)
  await ws.save(path, { body: setPageNote(ws.get(path)?.body ?? '', pageNumber, text) })
}

/**
 * Annotations and page notes of a PDF, stored in its notes page (created on the first change).
 * All writes go through the Workspace, so search, links and Git see them like any page.
 */
const histories = new Map<string, { past: Annotation[][]; future: Annotation[][] }>()

export function useAnnotations(pdfPath: string) {
  const ws = useWorkspace()
  const notesPath = notesPathFor(pdfPath)
  const page = ws.get(notesPath)
  const annotations = parseAnnotations(page?.data.annotations)
  const body = page?.body ?? ''

  const write = useCallback((next: Annotation[]) => writeAnnotations(ws, pdfPath, next), [ws, pdfPath])
  // Undo/redo of highlights, ink, notes, moves (per PDF, this session).
  const history = histories.get(pdfPath) ?? { past: [], future: [] }
  histories.set(pdfPath, history)
  const save = (next: Annotation[]) => {
    history.past.push(annotations)
    if (history.past.length > 100) history.past.shift()
    history.future = []
    return write(next)
  }
  const undo = () => {
    const previous = history.past.pop()
    if (!previous) return
    history.future.push(annotations)
    void write(previous)
  }
  const redo = () => {
    const next = history.future.pop()
    if (!next) return
    history.past.push(annotations)
    void write(next)
  }

  const add = (a: Annotation) => save([...annotations, a])
  const update = (id: string, patch: Partial<Annotation>) =>
    save(annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)))
  const remove = (id: string) => save(annotations.filter((a) => a.id !== id))

  const setNote = useCallback(
    (pageNumber: number, text: string) => writePageNote(ws, pdfPath, pageNumber, text),
    [ws, pdfPath],
  )

  return {
    notesPath: page ? notesPath : null,
    annotations,
    note: (pageNumber: number) => pageNote(body, pageNumber),
    add,
    update,
    remove,
    setNote,
    undo,
    redo,
  }
}
