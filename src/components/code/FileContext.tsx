import { useEffect, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  Package,
  PanelLeft,
  PanelRight,
  PanelTop,
} from 'lucide-react'
import { ResizeHandle, useStoredWidth } from '@/components/layout/ResizeHandle'
import { cx, IconButton } from '@/components/ui'
import { loadRepoInfo, useRepoInfo } from '@/app/repoInfo'
import { sessionOfRepo } from '@/app/labHubs'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import type { Page, Workspace } from '@/lib/workspace'
import { MarkdownView } from '@/components/editor/MarkdownView'

/** The nearest page above a file that is a repository (`repo:`) or a lab session (`praktikum:`). */
function ancestors(ws: Workspace, path: string): { repo?: Page; session?: Page } {
  const out: { repo?: Page; session?: Page } = {}
  let dir = path
  while (dir.includes('/')) {
    dir = dir.slice(0, dir.lastIndexOf('/'))
    const page = ws.get(`${dir}.md`)
    if (!page) continue
    if (!out.repo && typeof page.data.repo === 'string') out.repo = page
    if (!out.session && typeof page.data.praktikum === 'number') out.session = page
  }
  // A repository in the shared lab folder: its session from its link.
  if (out.repo && !out.session) {
    const hub = sessionOfRepo(ws, out.repo)
    if (hub && ws.get(hub)) out.session = ws.get(hub)
  }
  return out
}

type Layout = 'top' | 'left' | 'right'
const LAYOUT_KEY = 'notiva:file-context-layout'

/**
 * A file of a got repository with what it belongs to: the repository (its description) and the lab
 * session – the task stays in view. The description sits above the file (height draggable like the
 * terminal) or beside it, left or right (width draggable); the choice is kept.
 */
export function FileContext({ path, children }: { path: string; children: ReactNode }) {
  const ws = useWorkspace()
  const navigate = useApp((s) => s.navigate)
  const { repo, session } = ancestors(ws, path)
  const remote = typeof repo?.data.repo === 'string' ? repo.data.repo : undefined
  const info = useRepoInfo((s) => (remote ? s[remote] : undefined))
  const [open, setOpen] = useState(true)
  const [layout, setLayoutState] = useState<Layout>(() => {
    try {
      const v = localStorage.getItem(LAYOUT_KEY)
      return v === 'left' || v === 'right' ? v : 'top'
    } catch {
      return 'top'
    }
  })
  const setLayout = (v: Layout) => {
    setLayoutState(v)
    try {
      localStorage.setItem(LAYOUT_KEY, v)
    } catch {
      /* private mode */
    }
  }
  const [height, setHeight] = useStoredWidth('file-context-h', 180, 60, 900)
  const [width, setWidth] = useStoredWidth('file-context-w', 380, 220, 1000)
  useEffect(() => {
    if (remote) void loadRepoInfo(ws, remote)
  }, [ws, remote])
  if (!repo && !session) return <>{children}</>
  const description = info?.description
  const side = layout !== 'top' && !!description && open

  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {repo && description && (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="text-ink-3 hover:text-ink"
          aria-label={t('fileContext.toggle')}
        >
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      )}
      {repo && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 font-semibold hover:underline"
          onClick={() => navigate({ name: 'page', path: repo.path })}
        >
          <Package size={13} className="text-accent" /> {repo.title}
        </button>
      )}
      {session && (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-ink-2 hover:underline"
          onClick={() => navigate({ name: 'page', path: session.path })}
        >
          <FlaskConical size={13} /> {session.title}
        </button>
      )}
      <span className="flex-1" />
      {description && (
        <div role="radiogroup" aria-label={t('fileContext.layout')} className="flex items-center gap-0.5">
          {(['left', 'top', 'right'] as const).map((v) => {
            const Icon = v === 'left' ? PanelLeft : v === 'top' ? PanelTop : PanelRight
            return (
              <IconButton
                key={v}
                size="sm"
                role="radio"
                aria-checked={layout === v}
                label={t(`fileContext.${v}`)}
                active={layout === v}
                onClick={() => setLayout(v)}
              >
                <Icon size={13} />
              </IconButton>
            )
          })}
        </div>
      )}
    </div>
  )
  const text = description && (
    <div className="h-full overflow-y-auto pr-2">
      <MarkdownView markdown={description} untrusted className="md text-[13px]" />
    </div>
  )

  if (side)
    return (
      <div className="flex h-full min-h-0 flex-col" data-testid="file-context">
        <div className="no-print border-b border-line bg-sunken/60 px-4 py-2 text-[13px]">{header}</div>
        <div className={cx('flex min-h-0 flex-1', layout === 'right' && 'flex-row-reverse')}>
          <aside
            className={cx(
              'relative shrink-0 bg-sunken/40 p-3',
              layout === 'left' ? 'border-r' : 'border-l',
              'border-line',
            )}
            style={{ width }}
            aria-label={t('fileContext.description')}
          >
            <ResizeHandle
              side={layout === 'left' ? 'right' : 'left'}
              width={width}
              onResize={setWidth}
              label={t('fileContext.description')}
              reset={380}
            />
            {text}
          </aside>
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </div>
    )
  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="file-context">
      <div className="no-print border-b border-line bg-sunken/60 px-4 py-2 text-[13px]">
        {header}
        {description && open && (
          <div className="relative mt-1.5" style={{ height }}>
            {text}
            <ResizeHandle
              side="bottom"
              width={height}
              onResize={setHeight}
              label={t('fileContext.description')}
              reset={180}
            />
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
