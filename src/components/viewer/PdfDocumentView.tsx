import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Eraser,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  NotebookPen,
  PanelRight,
  SquareTerminal,
  PenLine,
  Plus,
  ScanLine,
  Sparkles,
  StickyNote,
  Type,
} from 'lucide-react'
import { CommentMarkers } from './CommentMarkers'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { ResizeHandle, useStoredWidth } from '@/components/layout/ResizeHandle'
import { workFolderFor } from '@/lib/codeFolders'
import { electronBridge } from '@/lib/vault'
import { useAnnotations } from '@/app/annotations'
import { useAssistant } from '@/app/assistant'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import {
  ANNOTATION_COLORS,
  mergeRects,
  newAnnotationId,
  type AnnotationColor,
  type Rect,
} from '@/lib/annotations'
import type { PDFDocumentProxy } from '@/lib/pdfjs'
import { cx, IconButton } from '@/components/ui'
import { AnnotationLayer, COLOR_VALUES, type Tool } from './AnnotationLayer'
import { NotesPanel } from './NotesPanel'
import { PdfViewer, type PdfViewerHandle } from './PdfViewer'

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4]
const MIN_ZOOM = 0.4
const MAX_ZOOM = 4

export interface SideProps {
  page: number
  jump: (page: number) => void
  doc: PDFDocumentProxy
  path: string
}

interface Selection {
  page: number
  rects: Rect[]
  text: string
  /** Where the floating bar goes (viewport coordinates). */
  x: number
  y: number
}

/** A PDF with tools: highlight, notes, pen, eraser, zoom – annotations saved in the notes page. */
export function PdfDocumentView({
  doc,
  path,
  name,
  initialPage,
  Side,
}: {
  doc: PDFDocumentProxy
  path: string
  name: string
  initialPage?: number | undefined
  /** Extra content at the top of the side panel (e.g. the lecture mode). */
  Side?: React.ComponentType<SideProps> | undefined
}) {
  const viewer = useRef<PdfViewerHandle>(null)
  const notes = useAnnotations(path)
  const [zoom, setZoom] = useState(1)
  const [current, setCurrent] = useState(initialPage ?? 1)
  const [jump, setJump] = useState('')
  const [tool, setTool] = useState<Tool>('select')
  const [color, setColor] = useState<AnnotationColor>('yellow')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [panel, setPanel] = useState(() => typeof window === 'undefined' || window.innerWidth >= 1100)
  // Terminal below the PDF – in the module's code folder (lab PDFs), else next to the file.
  const [terminal, setTerminal] = useState(false)
  const [terminalHeight, setTerminalHeight] = useStoredWidth('pdf-terminal', 260, 120, 900)
  const ws = useWorkspace()
  const work = workFolderFor(ws, path)
  const showToast = useApp((s) => s.showToast)

  useEffect(() => {
    if (!initialPage) return
    const timer = setTimeout(() => viewer.current?.scrollToPage(initialPage), 250)
    return () => clearTimeout(timer)
  }, [initialPage, doc])

  const goTo = useCallback((page: number) => viewer.current?.scrollToPage(page, true), [])

  const step = (dir: 1 | -1) => {
    setZoom((z) =>
      dir > 0
        ? (ZOOMS.find((x) => x > z + 0.001) ?? MAX_ZOOM)
        : ([...ZOOMS].reverse().find((x) => x < z - 0.001) ?? MIN_ZOOM),
    )
  }

  // Pinch (trackpad), ⌘/Strg + Mausrad and ⌘/Strg + Plus/Minus/0 zoom the PDF, not the app.
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = area.current
    if (!el) return
    let pending = 1
    let frame = 0
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      pending *= Math.exp(-e.deltaY * 0.01)
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const factor = pending
        pending = 1
        setZoom((z) => Math.round(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor)) * 20) / 20)
      })
    }
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      if (e.key === '+' || e.key === '=') setZoom((z) => ZOOMS.find((x) => x > z + 0.001) ?? MAX_ZOOM)
      else if (e.key === '-') setZoom((z) => [...ZOOMS].reverse().find((x) => x < z - 0.001) ?? MIN_ZOOM)
      else if (e.key === '0') setZoom(1)
      else return
      e.preventDefault()
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  /** Text selected in a page → floating bar for highlighting. */
  const onMouseUp = () => {
    if (tool !== 'select') return
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return setSelection(null)
    const range = sel.getRangeAt(0)
    const start =
      range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement
    const pageEl = start?.closest<HTMLElement>('[data-page]')
    if (!pageEl) return setSelection(null)
    const scale = Number(pageEl.dataset.scale) || 1
    const box = pageEl.getBoundingClientRect()
    const rects = [...range.getClientRects()]
      .filter((r) => r.top >= box.top - 2 && r.bottom <= box.bottom + 2)
      .map((r): Rect => [
        (r.left - box.left) / scale,
        (r.top - box.top) / scale,
        r.width / scale,
        r.height / scale,
      ])
    const merged = mergeRects(rects)
    const last = range.getBoundingClientRect()
    if (!merged.length) return setSelection(null)
    setSelection({
      page: Number(pageEl.dataset.page),
      rects: merged,
      text: sel.toString().replace(/\s+/g, ' ').trim().slice(0, 2000),
      x: last.left + last.width / 2,
      y: last.bottom + 8,
    })
  }

  const highlight = (c: AnnotationColor, withComment = false) => {
    if (!selection) return
    const id = newAnnotationId()
    void notes.add({
      id,
      type: 'highlight',
      page: selection.page,
      rects: selection.rects,
      color: c,
      text: selection.text,
    })
    window.getSelection()?.removeAllRanges()
    setSelection(null)
    if (withComment) {
      setPanel(true)
      setActiveId(id)
    }
  }

  const explain = () => {
    if (!selection) return
    useAssistant
      .getState()
      .setDraft(t('viewer.explainPrompt', { name, page: selection.page, text: selection.text }))
    useApp.getState().openView('assistant')
    setSelection(null)
  }

  const tools: Array<[Tool, string, React.ReactNode]> = [
    ['select', t('viewer.tool.select'), <MousePointer2 key="s" size={15} />],
    ['text', t('viewer.tool.text'), <Type key="t" size={15} />],
    ['pen', t('viewer.tool.pen'), <PenLine key="p" size={15} />],
    ['note', t('viewer.tool.note'), <StickyNote key="n" size={15} />],
    ['erase', t('viewer.tool.erase'), <Eraser key="e" size={15} />],
  ]

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div
          role="toolbar"
          aria-label={t('file.toolbar')}
          className="flex flex-wrap items-center gap-1 border-b border-line bg-surface px-3 py-1.5 text-sm"
        >
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              const n = Number(jump)
              if (n >= 1 && n <= doc.numPages) viewer.current?.scrollToPage(n)
              setJump('')
            }}
          >
            <label className="sr-only" htmlFor="pdf-page">
              {t('file.page')}
            </label>
            <input
              id="pdf-page"
              inputMode="numeric"
              value={jump}
              placeholder={String(current)}
              onChange={(e) => setJump(e.target.value.replace(/\D/g, ''))}
              className="w-10 rounded-control border border-line bg-surface px-1.5 py-0.5 text-center tabular-nums"
            />
            <span className="text-ink-3 tabular-nums" data-testid="pdf-pages">
              / {doc.numPages}
            </span>
          </form>
          <span className="mx-1 h-5 w-px bg-line" aria-hidden />
          <div role="radiogroup" aria-label={t('viewer.tools')} className="flex items-center gap-0.5">
            {tools.map(([id, label, icon]) => (
              <IconButton
                key={id}
                role="radio"
                aria-checked={tool === id}
                label={label}
                active={tool === id}
                onClick={() => {
                  setTool(id)
                  setSelection(null)
                }}
              >
                {icon}
              </IconButton>
            ))}
          </div>
          <div role="radiogroup" aria-label={t('viewer.color')} className="ml-1 flex items-center gap-1">
            {ANNOTATION_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={t(`viewer.colors.${c}`)}
                onClick={() => setColor(c)}
                className={cx(
                  'size-4 rounded-full ring-offset-1 ring-offset-surface',
                  color === c && 'ring-2 ring-ink',
                )}
                style={{ background: COLOR_VALUES[c] }}
              />
            ))}
          </div>
          <span className="flex-1" />
          <IconButton label={t('file.zoomOut')} onClick={() => step(-1)} disabled={zoom <= MIN_ZOOM}>
            <Minus size={15} />
          </IconButton>
          <span className="w-12 text-center text-[12.5px] text-ink-2 tabular-nums">
            {Math.round(zoom * 100)} %
          </span>
          <IconButton label={t('file.zoomIn')} onClick={() => step(1)} disabled={zoom >= MAX_ZOOM}>
            <Plus size={15} />
          </IconButton>
          <IconButton label={t('file.fitWidth')} onClick={() => setZoom(1)} active={zoom === 1}>
            <ScanLine size={15} />
          </IconButton>
          <IconButton
            label={t('viewer.togglePanel')}
            onClick={() => setPanel((p) => !p)}
            active={panel}
            className="max-[899px]:hidden"
          >
            <PanelRight size={15} />
          </IconButton>
          {electronBridge()?.terminal && (
            <IconButton
              label={t('terminal.toggle')}
              title={`${t('terminal.toggle')} – ${work.folder || t('terminal.vaultRoot')}`}
              onClick={() => setTerminal((v) => !v)}
              active={terminal}
            >
              <SquareTerminal size={15} />
            </IconButton>
          )}
        </div>
        <div ref={area} className="relative min-h-0 flex-1" onMouseUp={onMouseUp}>
          <PdfViewer
            ref={viewer}
            doc={doc}
            zoom={zoom}
            onPage={setCurrent}
            label={name}
            className={cx(
              'h-full overflow-auto bg-sunken',
              tool !== 'select' && '[&_.textLayer]:pointer-events-none',
            )}
            overlay={(page, size, scale) => (
              <>
                <CommentMarkers
                  page={page}
                  size={size}
                  scale={scale}
                  annotations={notes.annotations}
                  activeId={activeId}
                  onOpen={(id) => {
                    setPanel(true)
                    setActiveId(activeId === id ? null : id)
                  }}
                />
                <AnnotationLayer
                  page={page}
                  size={size}
                  scale={scale}
                  annotations={notes.annotations}
                  tool={tool}
                  color={color}
                  activeId={activeId}
                  onAdd={(a) => void notes.add(a)}
                  onRemove={(id) => void notes.remove(id)}
                  onOpen={(id) => {
                    setPanel(true)
                    setActiveId(id)
                  }}
                  onUpdate={(id, patch) => void notes.update(id, patch)}
                />
              </>
            )}
          />
          {selection && (
            <div
              role="toolbar"
              aria-label={t('viewer.selectionBar')}
              className="fixed z-40 flex -translate-x-1/2 items-center gap-1 rounded-panel border border-line bg-surface p-1 shadow-[var(--shadow-pop)]"
              style={{ left: selection.x, top: selection.y }}
              onMouseUp={(e) => e.stopPropagation()}
            >
              {ANNOTATION_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={t('viewer.highlightIn', { color: t(`viewer.colors.${c}`) })}
                  onClick={() => highlight(c)}
                  className="size-5 rounded-full hover:scale-110"
                  style={{ background: COLOR_VALUES[c] }}
                />
              ))}
              <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />
              <IconButton
                size="sm"
                label={t('viewer.highlightComment')}
                onClick={() => highlight(color, true)}
              >
                <MessageSquarePlus size={14} />
              </IconButton>
              <IconButton size="sm" label={t('viewer.explain')} onClick={explain}>
                <Sparkles size={14} />
              </IconButton>
            </div>
          )}
        </div>
        {terminal && (
          <div className="relative shrink-0 border-t border-line" style={{ height: terminalHeight }}>
            <ResizeHandle
              side="top"
              width={terminalHeight}
              onResize={setTerminalHeight}
              label={t('terminal.title')}
              reset={260}
            />
            <TerminalPanel
              folder={work.folder}
              onClose={() => setTerminal(false)}
              onSave={(text) => {
                const before = notes.note(current)
                void notes
                  .setNote(current, `${before ? `${before}\n\n` : ''}\`\`\`text\n${text}\n\`\`\``)
                  .then(() => showToast(t('terminal.saved', { page: current })))
              }}
            />
          </div>
        )}
      </div>
      {panel && (
        <NotesPanel
          page={current}
          pageNote={notes.note(current)}
          onPageNote={(text) => void notes.setNote(current, text)}
          annotations={notes.annotations}
          activeId={activeId}
          onActivate={setActiveId}
          onUpdate={(id, patch) => void notes.update(id, patch)}
          onRemove={(id) => void notes.remove(id)}
          onJump={goTo}
          notesPath={notes.notesPath}
        >
          {Side ? (
            <Side page={current} jump={goTo} doc={doc} path={path} />
          ) : (
            <p className="flex items-start gap-1.5 border-b border-line px-3 py-2 text-[12.5px] text-ink-3">
              <NotebookPen size={14} aria-hidden className="mt-0.5 shrink-0" /> {t('viewer.storedHint')}
            </p>
          )}
        </NotesPanel>
      )}
    </div>
  )
}
