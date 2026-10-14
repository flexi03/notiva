import { useEffect, useRef, useState } from 'react'
import { ExternalLink, Minus, Plus, ScanLine } from 'lucide-react'
import { isImage, isPdf } from '@/app/materials'
import { useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { basename } from '@/lib/path'
import { openPdf, type PDFDocumentProxy } from '@/lib/pdfjs'
import { electronBridge } from '@/lib/vault'
import { Button, EmptyState, IconButton, Spinner } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { PdfViewer, type PdfViewerHandle } from '@/components/viewer/PdfViewer'

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3]

/** A non-Markdown file of the vault: PDFs in Notiva's viewer, images inline, others via the system. */
export function FileScreen({ path, page }: { path: string; page?: number }) {
  const ws = useWorkspace()
  const [state, setState] = useState<{
    doc?: PDFDocumentProxy
    url?: string
    text?: string
    error?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    void (async () => {
      try {
        if (isPdf(path)) {
          const doc = await openPdf(await ws.vault.readBinary(path))
          if (!cancelled) setState({ doc })
          else void doc.loadingTask.destroy()
        } else if (isImage(path)) {
          const bytes = await ws.vault.readBinary(path)
          objectUrl = URL.createObjectURL(
            new Blob([bytes.slice()], { type: path.endsWith('.svg') ? 'image/svg+xml' : '' }),
          )
          if (!cancelled) setState({ url: objectUrl })
        } else if (/\.(txt|csv|md|json)$/i.test(path)) {
          const text = await ws.vault.read(path)
          if (!cancelled) setState({ text })
        } else if (!cancelled) setState({})
      } catch (e) {
        if (!cancelled) setState({ error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [path, ws])

  useEffect(() => () => void state?.doc?.loadingTask.destroy(), [state?.doc])

  const name = basename(path)
  const system = electronBridge()?.openWithSystem
  const actions = system && (
    <IconButton label={t('file.openWithSystem')} onClick={() => void system(path)}>
      <ExternalLink size={16} />
    </IconButton>
  )

  return (
    <div className="flex h-full flex-col">
      <Topbar title={name} actions={actions} />
      <div className="min-h-0 flex-1">
        {!state ? (
          <Spinner label={t('common.loading')} />
        ) : state.error ? (
          <p role="alert" className="p-6 text-sm text-danger">
            {state.error}
          </p>
        ) : state.doc ? (
          <PdfFile doc={state.doc} name={name} initialPage={page} />
        ) : state.url ? (
          <div className="flex h-full items-start justify-center overflow-auto bg-sunken p-6">
            <img src={state.url} alt={name} className="max-w-full shadow-[var(--shadow-pop)]" />
          </div>
        ) : state.text !== undefined ? (
          <pre tabIndex={0} className="h-full overflow-auto p-6 font-code text-[13px] whitespace-pre-wrap">
            {state.text}
          </pre>
        ) : (
          <EmptyState
            title={t('file.noPreview')}
            action={
              system && (
                <Button variant="primary" onClick={() => void system(path)}>
                  {t('file.openWithSystem')}
                </Button>
              )
            }
          />
        )}
      </div>
    </div>
  )
}

function PdfFile({
  doc,
  name,
  initialPage,
}: {
  doc: PDFDocumentProxy
  name: string
  initialPage?: number | undefined
}) {
  const viewer = useRef<PdfViewerHandle>(null)
  const [zoom, setZoom] = useState(1)
  const [current, setCurrent] = useState(1)
  const [jump, setJump] = useState('')

  useEffect(() => {
    if (!initialPage) return
    const timer = setTimeout(() => viewer.current?.scrollToPage(initialPage), 200)
    return () => clearTimeout(timer)
  }, [initialPage, doc])

  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 0.001)
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 3 : i) + dir))]!)
  }

  return (
    <div className="flex h-full flex-col">
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
        <span className="flex-1" />
        <IconButton label={t('file.zoomOut')} onClick={() => step(-1)} disabled={zoom <= ZOOMS[0]!}>
          <Minus size={15} />
        </IconButton>
        <span className="w-12 text-center text-[12.5px] text-ink-2 tabular-nums">
          {Math.round(zoom * 100)} %
        </span>
        <IconButton
          label={t('file.zoomIn')}
          onClick={() => step(1)}
          disabled={zoom >= ZOOMS[ZOOMS.length - 1]!}
        >
          <Plus size={15} />
        </IconButton>
        <IconButton label={t('file.fitWidth')} onClick={() => setZoom(1)} active={zoom === 1}>
          <ScanLine size={15} />
        </IconButton>
      </div>
      <PdfViewer
        ref={viewer}
        doc={doc}
        zoom={zoom}
        onPage={setCurrent}
        label={name}
        className="min-h-0 flex-1 overflow-auto bg-sunken"
      />
    </div>
  )
}
