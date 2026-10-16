import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, FileDiff, Replace } from 'lucide-react'
import { isPdf, pendingVersions, resolveVersion, type PendingVersion } from '@/app/materials'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { comparePdfText, type PageChange, type PdfComparison } from '@/lib/materialVersions'
import type { PDFDocumentProxy } from '@/lib/pdfjs'
import type { Workspace } from '@/lib/workspace'
import { Button, cx, EmptyState, Spinner } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

const name = (path: string) => path.slice(path.lastIndexOf('/') + 1)
const folder = (path: string) => path.slice(0, path.lastIndexOf('/'))

/**
 * Newer versions from Moodle next to the user's file: compared page by page (like a diff – changed
 * and new pages are marked), shown side by side. Per file: "Alte ersetzen" or "Beide behalten".
 */
export function VersionsScreen() {
  const ws = useWorkspace()
  const run = useAction()
  const [list, setList] = useState<PendingVersion[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const reload = () =>
    void pendingVersions(ws).then((l) => {
      setList(l)
      setSelected((s) => (s && l.some((v) => v.id === s) ? s : (l[0]?.id ?? null)))
    })
  useEffect(reload, [ws])
  const current = list?.find((v) => v.id === selected)
  const decide = (v: PendingVersion, choice: 'replace' | 'keep') =>
    void run(async () => {
      await resolveVersion(ws, v.id, choice)
      useApp
        .getState()
        .showToast(
          choice === 'replace' ? t('versions.replaced', { name: name(v.current) }) : t('versions.kept'),
        )
      reload()
    })

  return (
    <>
      <Topbar title={t('versions.title')} />
      <div className="mx-auto max-w-[min(100rem,100%)] px-4 py-8 sm:px-8">
        <h1 className="text-[2rem] font-bold">{t('versions.title')}</h1>
        <p className="mb-5 max-w-prose text-[13.5px] text-ink-3">{t('versions.intro')}</p>
        {list === null ? (
          <Spinner label={t('common.loading')} />
        ) : list.length === 0 ? (
          <EmptyState title={t('versions.empty')}>{t('versions.emptyHint')}</EmptyState>
        ) : (
          <div className="grid gap-5 min-[1000px]:grid-cols-[17rem_minmax(0,1fr)]">
            <ul className="space-y-1" aria-label={t('versions.title')}>
              {list.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-current={v.id === selected ? 'true' : undefined}
                    onClick={() => setSelected(v.id)}
                    className={cx(
                      'w-full rounded-control px-2.5 py-2 text-left hover:bg-hover',
                      v.id === selected && 'bg-[color-mix(in_srgb,var(--accent)_13%,transparent)]',
                    )}
                  >
                    <span className="block truncate text-sm font-semibold">{name(v.current)}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {folder(v.current).split('/').slice(-2).join(' / ')} ·{' '}
                      {new Date(v.found).toLocaleDateString(getLanguage() === 'de' ? 'de-DE' : 'en-US')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {current && <Comparison key={current.id} ws={ws} version={current} onDecide={decide} />}
          </div>
        )}
      </div>
    </>
  )
}

/** Text of every page (for the comparison) – at most 400 pages. */
async function pageTexts(doc: PDFDocumentProxy): Promise<string[]> {
  const out: string[] = []
  for (let n = 1; n <= Math.min(doc.numPages, 400); n++) {
    const content = await (await doc.getPage(n)).getTextContent()
    out.push(content.items.map((i) => ('str' in i ? `${i.str} ` : '')).join(''))
  }
  return out
}

function Comparison({
  ws,
  version,
  onDecide,
}: {
  ws: Workspace
  version: PendingVersion
  onDecide: (v: PendingVersion, choice: 'replace' | 'keep') => void
}) {
  const navigate = useApp((s) => s.navigate)
  const pdf = isPdf(version.current) && isPdf(version.next)
  const [docs, setDocs] = useState<{ old: PDFDocumentProxy; next: PDFDocumentProxy } | null>(null)
  const [diff, setDiff] = useState<PdfComparison | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    let opened: PDFDocumentProxy[] = []
    void (async () => {
      try {
        const { openPdf } = await import('@/lib/pdfjs')
        const [old, next] = await Promise.all([
          openPdf(await ws.vault.readBinary(version.current)),
          openPdf(await ws.vault.readBinary(version.next)),
        ])
        opened = [old, next]
        const result = comparePdfText(await pageTexts(old), await pageTexts(next))
        if (cancelled) return
        setDocs({ old, next })
        setDiff(result)
        // Start at the first difference.
        setPage(result.pages.find((p) => p.kind !== 'same')?.page ?? 1)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      for (const doc of opened) void doc.loadingTask.destroy()
    }
  }, [ws, version, pdf])
  const change = diff?.pages.find((p) => p.page === page)
  const count = (kind: PageChange['kind']) => diff?.pages.filter((p) => p.kind === kind).length ?? 0

  return (
    <section aria-label={name(version.current)} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Replace size={14} />} onClick={() => onDecide(version, 'replace')}>
          {t('versions.replace')}
        </Button>
        <Button icon={<Copy size={14} />} onClick={() => onDecide(version, 'keep')}>
          {t('versions.keep')}
        </Button>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          icon={<ExternalLink size={13} />}
          onClick={() => navigate({ name: 'file', path: version.next })}
        >
          {t('versions.openNew')}
        </Button>
      </div>
      <p className="text-[12.5px] text-ink-3">{t('versions.replaceHint', { name: name(version.current) })}</p>
      {!pdf ? (
        <p className="text-sm text-ink-2">{t('versions.noPdf', { name: name(version.next) })}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {t('versions.compareFailed', { reason: error })}
        </p>
      ) : !diff || !docs ? (
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <Spinner label={t('versions.comparing')} /> {t('versions.comparing')}
        </div>
      ) : (
        <>
          <p className="text-sm" data-testid="version-summary">
            <FileDiff size={14} className="mr-1 inline align-[-2px] text-accent" />
            {count('changed') + count('new') + diff.removed.length === 0
              ? t('versions.sameText')
              : t('versions.summary', {
                  changed: count('changed'),
                  added: count('new'),
                  removed: diff.removed.length,
                  same: count('same'),
                })}
          </p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('versions.pages')}>
            {diff.pages.map((p) => (
              <button
                key={p.page}
                type="button"
                aria-pressed={p.page === page}
                title={t(`versions.kind.${p.kind}`)}
                onClick={() => setPage(p.page)}
                data-kind={p.kind}
                className={cx(
                  'h-7 min-w-7 rounded-control border px-1 text-[12px] tabular-nums',
                  p.kind === 'same' && 'border-line text-ink-3',
                  p.kind === 'changed' &&
                    'border-[var(--opt-yellow-ink)] bg-[var(--opt-yellow)] font-semibold',
                  p.kind === 'new' && 'border-[var(--opt-green-ink)] bg-[var(--opt-green)] font-semibold',
                  p.page === page && 'ring-2 ring-accent',
                )}
              >
                {p.page}
              </button>
            ))}
          </div>
          {diff.removed.length > 0 && (
            <p className="text-[12.5px] text-ink-3">
              {t('versions.removed', { pages: diff.removed.join(', ') })}
            </p>
          )}
          <div className="grid gap-3 min-[800px]:grid-cols-2">
            <figure className="min-w-0">
              <figcaption className="mb-1 text-[12.5px] font-semibold text-ink-2">
                {t('versions.current')}
                {change && change.kind !== 'new' ? ` · ${t('versions.page', { page: change.old })}` : ''}
              </figcaption>
              {change && change.kind !== 'new' ? (
                <PageImage doc={docs.old} page={change.old} />
              ) : (
                <p className="rounded-panel border border-dashed border-line p-6 text-center text-sm text-ink-3">
                  {t('versions.notInOld')}
                </p>
              )}
            </figure>
            <figure className="min-w-0">
              <figcaption className="mb-1 text-[12.5px] font-semibold text-ink-2">
                {t('versions.next')} · {t('versions.page', { page })}
                {change && change.kind !== 'same' && (
                  <span className="ml-1.5 rounded-full bg-[var(--opt-yellow)] px-1.5 text-[11px] text-[var(--opt-yellow-ink)]">
                    {t(`versions.kind.${change.kind}`)}
                  </span>
                )}
                {change?.kind === 'same' && <Check size={13} className="ml-1 inline text-accent" />}
              </figcaption>
              <PageImage doc={docs.next} page={page} />
            </figure>
          </div>
        </>
      )}
    </section>
  )
}

/** One page as an image (fits the column). */
function PageImage({ doc, page }: { doc: PDFDocumentProxy; page: number }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let cancelled = false
    let task: { cancel(): void; promise: Promise<void> } | null = null
    void (async () => {
      const p = await doc.getPage(page)
      const c = canvas.current
      if (cancelled || !c) return
      const width = c.parentElement?.clientWidth || 500
      const viewport = p.getViewport({ scale: width / p.getViewport({ scale: 1 }).width })
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      c.width = Math.floor(viewport.width * ratio)
      c.height = Math.floor(viewport.height * ratio)
      c.style.width = `${viewport.width}px`
      task = p.render({
        canvas: c,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      })
      await task.promise.catch(() => undefined)
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [doc, page])
  return <canvas ref={canvas} className="max-w-full rounded-panel border border-line bg-white" />
}
