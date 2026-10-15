/**
 * ⌘Z / ⇧⌘Z: in text (fields, editors) the browser's own undo; elsewhere the last registered
 * handler – e.g. the PDF view undoes highlights, ink and notes.
 */
interface UndoHandler {
  undo(): void
  redo(): void
}

const handlers: UndoHandler[] = []

export function registerUndo(handler: UndoHandler): () => void {
  handlers.push(handler)
  return () => {
    const i = handlers.lastIndexOf(handler)
    if (i >= 0) handlers.splice(i, 1)
  }
}

const inText = () => {
  const el = document.activeElement as HTMLElement | null
  return !!el && (el.matches('input, textarea, [contenteditable="true"]') || !!el.closest('.cm-editor'))
}

export function runUndo(redo: boolean): void {
  if (inText()) {
    document.execCommand(redo ? 'redo' : 'undo')
    return
  }
  const handler = handlers[handlers.length - 1]
  if (handler) (redo ? handler.redo : handler.undo)()
}
