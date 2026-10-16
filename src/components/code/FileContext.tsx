import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, FlaskConical, Package } from 'lucide-react'
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

/**
 * Above a file of a got repository: what it belongs to – the repository (with its description,
 * folded) and the lab session – so the task stays in view while working on the file.
 */
export function FileContext({ path }: { path: string }) {
  const ws = useWorkspace()
  const navigate = useApp((s) => s.navigate)
  const { repo, session } = ancestors(ws, path)
  const remote = typeof repo?.data.repo === 'string' ? repo.data.repo : undefined
  const info = useRepoInfo((s) => (remote ? s[remote] : undefined))
  const [open, setOpen] = useState(true)
  useEffect(() => {
    if (remote) void loadRepoInfo(ws, remote)
  }, [ws, remote])
  if (!repo && !session) return null
  const description = info?.description
  return (
    <div
      className="no-print border-b border-line bg-sunken/60 px-4 py-2 text-[13px]"
      data-testid="file-context"
    >
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
      </div>
      {repo && description && open && (
        <div className="mt-1.5 max-h-48 overflow-y-auto pr-2">
          <MarkdownView markdown={description} untrusted className="md text-[13px]" />
        </div>
      )}
    </div>
  )
}
