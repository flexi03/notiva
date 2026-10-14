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

/** Notes pages being created – two quick edits must not create the page twice. */
const creating = new Map<string, Promise<string>>()

/**
 * Annotations and page notes of a PDF, stored in its notes page (created on the first change).
 * All writes go through the Workspace, so search, links and Git see them like any page.
 */
export function useAnnotations(pdfPath: string) {
  const ws = useWorkspace()
  const notesPath = notesPathFor(pdfPath)
  const page = ws.get(notesPath)
  const annotations = parseAnnotations(page?.data.annotations)
  const body = page?.body ?? ''

  const ensurePage = useCallback(async () => {
    if (ws.get(notesPath)) return notesPath
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
  }, [ws, notesPath, pdfPath])

  const save = useCallback(
    async (next: Annotation[]) => {
      const path = await ensurePage()
      await ws.setProperty(path, 'annotations', serializeAnnotations(next))
    },
    [ws, ensurePage],
  )

  const add = (a: Annotation) => save([...annotations, a])
  const update = (id: string, patch: Partial<Annotation>) =>
    save(annotations.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)))
  const remove = (id: string) => save(annotations.filter((a) => a.id !== id))

  const setNote = useCallback(
    async (pageNumber: number, text: string) => {
      const path = await ensurePage()
      const current = ws.get(path)?.body ?? ''
      await ws.save(path, { body: setPageNote(current, pageNumber, text) })
    },
    [ws, ensurePage],
  )

  return {
    notesPath: page ? notesPath : null,
    annotations,
    note: (pageNumber: number) => pageNote(body, pageNumber),
    add,
    update,
    remove,
    setNote,
  }
}
