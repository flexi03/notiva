import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { isImage, isPdf } from '@/app/materials'
import { useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { basename } from '@/lib/path'
import { openPdf, type PDFDocumentProxy } from '@/lib/pdfjs'
import { electronBridge } from '@/lib/vault'
import { Button, EmptyState, IconButton, Spinner } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { PdfDocumentView } from '@/components/viewer/PdfDocumentView'
import { LecturePanel } from '@/components/lecture/LecturePanel'

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
          <PdfDocumentView doc={state.doc} path={path} name={name} initialPage={page} Side={LecturePanel} />
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
