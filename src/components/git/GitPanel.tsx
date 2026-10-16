import { electronBridge } from '@/lib/vault'
import { commitSummary, localModelAvailable } from '@/app/localModel'
import { LabRepos } from './LabRepos'
import { RemoteDialog } from './RemoteDialog'
import { graphRows, type GraphRow } from '@/lib/gitGraph'
import { explain } from '@/app/fixes'
import { withProgress } from '@/app/progress'
import { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ChevronDown,
  ChevronRight,
  FileText,
  GitBranch,
  GitCommitHorizontal,
  RefreshCw,
  Sparkles,
  Undo2,
} from 'lucide-react'
import { discardChanges, gitAvailable, useGit } from '@/app/git'
import { restoreEntries } from '@/app/treeActions'
import type { Workspace } from '@/lib/workspace'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { commitMessage } from '@/lib/commitMessage'
import { diffLines, diffStats, type DiffStats } from '@/lib/diff'
import { basename, dirname } from '@/lib/path'
import type { GitChange, GitCommit, GitStatus } from '@/lib/vault'
import { AutoTextArea, Button, Checkbox, cx, EmptyState, IconButton } from '@/components/ui'
import { SidePanel } from '@/components/layout/SidePanel'
import { DiffStatsLabel } from './DiffView'

const LETTER: Record<GitStatus, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  renamed: 'R',
  untracked: 'U',
}
const COLOR: Record<GitStatus, string> = {
  modified: 'text-[var(--git-modified)]',
  renamed: 'text-[var(--git-modified)]',
  added: 'text-[var(--git-added)]',
  untracked: 'text-[var(--git-added)]',
  deleted: 'text-[var(--git-deleted)]',
}

export function StatusLetter({ status }: { status: GitStatus }) {
  return (
    <span
      className={cx('w-3 shrink-0 text-center text-[12px] font-bold', COLOR[status])}
      title={t(`git.status.${status}`)}
      aria-label={t(`git.status.${status}`)}
    >
      {LETTER[status]}
    </span>
  )
}

type FileStats = DiffStats & { excerpt: string[] }

/** +/− line counts per changed text file, plus a few changed lines (for the commit summary). */
function useStats(changes: GitChange[]): Map<string, FileStats> {
  const ws = useWorkspace()
  const head = useGit((s) => s.state?.head)
  const [stats, setStats] = useState(new Map<string, FileStats>())
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = new Map<string, FileStats>()
      for (const change of changes.slice(0, 200)) {
        if (
          !/\.(md|txt|json|css|ya?ml|csv|py|java|sql|js|ts|tsx|jsx|html?|c|cpp|h|kt|swift|sh|r|m|xml)$/i.test(
            change.path,
          )
        )
          continue
        const [old, now] = await Promise.all([
          change.status === 'untracked' || change.status === 'added'
            ? ''
            : useGit.getState().headText(change.from ?? change.path),
          change.status === 'deleted' ? '' : ws.vault.read(change.path).catch(() => ''),
        ])
        const lines = diffLines(old ?? '', now)
        const excerpt = lines
          .filter((l) => l.type !== 'same' && l.text.trim())
          .slice(0, 10)
          .map((l) => `${l.type === 'add' ? '+' : '-'} ${l.text.trim().slice(0, 120)}`)
        next.set(change.path, { ...diffStats(lines), excerpt })
      }
      if (!cancelled) setStats(next)
    })()
    return () => {
      cancelled = true
    }
  }, [changes, head, ws, ws.version])
  return stats
}

/** Git could not be read (e.g. not installed): why, the technical text, and a one-click fix. */
function GitError({ error, retry }: { error: string; retry: () => void }) {
  const { message, note, action } = explain(error, retry)
  return (
    <div role="alert" className="space-y-2 p-4 text-sm">
      <p className="font-semibold">{message}</p>
      <p className="text-[12.5px] text-ink-2">{t('git.whatIsGit')}</p>
      {note && <p className="font-mono text-[11.5px] break-words text-ink-3">{note}</p>}
      <div className="flex flex-wrap gap-2">
        {action && (
          <Button size="sm" variant="primary" onClick={action.run}>
            {action.label}
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={retry}>
          {t('fix.retry')}
        </Button>
      </div>
    </div>
  )
}

/** Source control view in the right side bar (like VS Code). */
export function GitPanel() {
  const { state, loading, error, refresh, act, showDiff } = useGit()
  const ws = useWorkspace()
  /** null = the automatic message (follows the selection); a string once the user edits it. */
  const [custom, setCustom] = useState<string | null>(null)
  /** the last message the local model wrote (to tell "KI" from "von dir bearbeitet") */
  const [aiText, setAiText] = useState<string | null>(null)
  const [explain, setExplain] = useState(false)
  const [excluded, setExcluded] = useState(new Set<string>())
  // Got lab repositories inside the vault have their own Git – tab "Praktikum", not here.
  const changes = useMemo(() => (state?.changes ?? []).filter((c) => !c.nested), [state])
  const nested = (state?.changes ?? []).filter((c) => c.nested)
  const [tab, setTab] = useState<'vault' | 'labs'>('vault')
  const [remoteOpen, setRemoteOpen] = useState(false)
  const stats = useStats(changes)
  const selected = changes.filter((c) => !excluded.has(c.path))
  const showToast = useApp((s) => s.showToast)
  const auto = commitMessage(
    selected.map((c) => ({ ...c, added: stats.get(c.path)?.added, removed: stats.get(c.path)?.removed })),
  )
  // The local model writes the message (once per set of changes); the template from the file
  // names is only the fallback – when no model is set up or it doesn't answer (with a hint).
  const [summarizing, setSummarizing] = useState(false)
  const [fallback, setFallback] = useState<'off' | 'failed' | null>(null)
  const signature = selected.map((c) => `${c.path}:${stats.get(c.path)?.added ?? ''}`).join('|')
  /** The set of changes the model already wrote for (or the template was taken for). */
  const [summarized, setSummarized] = useState('')
  const model = localModelAvailable()
  // Waiting for the model (also during the short pause before it starts).
  const pending = model && custom === null && selected.length > 0 && (summarizing || summarized !== signature)
  const message = custom ?? (pending ? '' : auto)
  // Where the message comes from – shown above the field.
  const source: 'ai' | 'user' | 'template' =
    custom === null ? 'template' : aiText !== null && custom === aiText ? 'ai' : 'user'
  const summarize = async () => {
    if (summarizing || !selected.length) return
    setSummarized(signature)
    setSummarizing(true)
    setFallback(null)
    try {
      const text = await Promise.race([
        commitSummary(
          selected.map((c) => ({
            path: c.path,
            status: c.status,
            ...(c.from ? { from: c.from } : {}),
            added: stats.get(c.path)?.added,
            removed: stats.get(c.path)?.removed,
            excerpt: stats.get(c.path)?.excerpt,
          })),
        ),
        new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timeout')), 90_000)),
      ])
      if (text) {
        setCustom(text)
        setAiText(text)
      } else setFallback('failed')
    } catch {
      setFallback('failed')
    } finally {
      setSummarizing(false)
    }
  }
  useEffect(() => {
    if (!model || custom !== null || !selected.length || summarizing) return
    if (summarized === signature) return
    // Wait until the line counts are there (they carry the changed lines).
    const timer = setTimeout(() => void summarize(), 800)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, custom])

  const commit = async () => {
    // Hundreds of files (lecture PDFs) take a while: visible progress bottom left.
    // "x of y files" and the remaining time while git adds them in batches.
    const hash = await withProgress(
      t('git.committing', { count: selected.length }),
      async (task) => {
        const off = electronBridge()?.git?.onProgress?.((e) =>
          task.update(e.done, e.total, e.done >= e.total ? t('git.writingCommit') : e.file?.split('/').pop()),
        )
        try {
          return await act((git) =>
            git.commit(
              message,
              selected.map((c) => c.path),
            ),
          )
        } finally {
          off?.()
        }
      },
      {
        total: selected.length,
        success: (h) => (h ? t('git.committed', { hash: h.slice(0, 7) }) : t('git.commitFailed')),
      },
    )
    if (hash) setCustom(null)
  }

  const header = state?.isRepo && (
    <>
      <IconButton label={t('git.refresh')} onClick={() => void refresh()} disabled={loading}>
        <RefreshCw size={15} className={cx(loading && 'animate-spin')} />
      </IconButton>
      <IconButton
        label={t('git.pull')}
        disabled={!state.upstream}
        onClick={() =>
          void act((git) => git.pull()).then((m) => m !== undefined && showToast(t('git.pulled')))
        }
      >
        <ArrowDownToLine size={15} />
      </IconButton>
      <IconButton
        label={t('git.push')}
        disabled={!state.upstream}
        onClick={() =>
          void act((git) => git.push()).then((m) => m !== undefined && showToast(t('git.pushed')))
        }
      >
        <ArrowUpFromLine size={15} />
      </IconButton>
    </>
  )

  const tabBar = (
    <div role="tablist" aria-label={t('git.tabs')} className="flex gap-1 border-b border-line pb-2">
      {(['vault', 'labs'] as const).map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => setTab(id)}
          className={cx(
            'rounded-full px-2.5 py-0.5 text-[13px] hover:bg-hover',
            tab === id ? 'bg-hover font-semibold text-ink' : 'text-ink-2',
          )}
        >
          {id === 'vault' ? t('git.tab.vault') : t('git.tab.labs')}
        </button>
      ))}
    </div>
  )

  return (
    <>
      {remoteOpen && <RemoteDialog open onClose={() => setRemoteOpen(false)} />}
      <SidePanel view="git" title={t('git.title')} icon={<GitBranch size={16} />} actions={header}>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {!gitAvailable() ? (
            <EmptyState icon={<GitBranch size={22} />} title={t('git.desktopOnly')}>
              {t('git.desktopOnlyHint')}
            </EmptyState>
          ) : !state && error ? (
            <GitError error={error} retry={() => void refresh()} />
          ) : !state ? (
            <p className="p-4 text-sm text-ink-3">{t('common.loading')}</p>
          ) : !state.isRepo ? (
            // The lab repositories have their own Git – reachable without one for the folder.
            <div className="space-y-4 p-3">
              {tabBar}
              {tab === 'labs' ? (
                <LabRepos />
              ) : (
                <EmptyState
                  icon={<GitBranch size={22} />}
                  title={t('git.noRepo')}
                  action={
                    <Button variant="primary" onClick={() => void act((git) => git.init())}>
                      {t('git.init')}
                    </Button>
                  }
                >
                  {t('git.noRepoHint')}
                </EmptyState>
              )}
            </div>
          ) : (
            <div className="space-y-4 p-3">
              {tabBar}
              {tab === 'labs' ? (
                <LabRepos />
              ) : (
                <>
                  {nested.map((n) => (
                    <div
                      key={n.path}
                      role="note"
                      data-testid="nested-repo"
                      className="space-y-1.5 rounded-control border border-line bg-sunken p-2.5 text-[13px]"
                    >
                      <p>
                        <span className="font-semibold">{n.path.split('/').pop()}</span> – {t('git.nested')}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="primary"
                          onClick={() =>
                            void act((git) => git.untrackNested!(n.path)).then(() =>
                              showToast(t('git.nestedDone')),
                            )
                          }
                        >
                          {t('git.nestedFix')}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setTab('labs')}>
                          {t('git.nestedShow')}
                        </Button>
                      </div>
                    </div>
                  ))}
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[13px] text-ink-2">
                    <span className="flex items-center gap-1 font-semibold text-ink">
                      <GitBranch size={13} /> {state.branch ?? 'HEAD'}
                    </span>
                    {state.upstream ? (
                      <>
                        {state.ahead > 0 && <span>↑ {t('git.ahead', { count: state.ahead })}</span>}
                        {state.behind > 0 && <span>↓ {t('git.behind', { count: state.behind })}</span>}
                      </>
                    ) : (
                      <>
                        <span className="text-ink-3">{t('git.noUpstream')}</span>
                        {electronBridge()?.git?.addRemote && (
                          <Button size="sm" variant="secondary" onClick={() => setRemoteOpen(true)}>
                            {t('remote.button')}
                          </Button>
                        )}
                      </>
                    )}
                  </p>

                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault()
                      void commit()
                    }}
                  >
                    {selected.length > 0 && !pending && (
                      <div
                        className="flex flex-wrap items-center gap-1.5 text-[12px]"
                        data-testid="commit-source"
                      >
                        {source === 'ai' ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 font-semibold text-accent">
                            <Sparkles size={11} /> {t('git.source.ai')}
                          </span>
                        ) : source === 'user' ? (
                          <span className="rounded-full bg-hover px-2 py-0.5 font-semibold text-ink-2">
                            {t('git.source.user')}
                          </span>
                        ) : (
                          <span className="rounded-full bg-hover px-2 py-0.5 font-semibold text-ink-2">
                            {t('git.source.template')}
                          </span>
                        )}
                        {model && (
                          <button
                            type="button"
                            className="font-semibold text-accent hover:underline"
                            onClick={() => void summarize()}
                          >
                            {source === 'ai' ? t('git.rewrite') : t('git.writeWithAi')}
                          </button>
                        )}
                        {source === 'user' && (
                          <button
                            type="button"
                            className="text-ink-3 hover:text-ink hover:underline"
                            onClick={() => setCustom(aiText)}
                            title={t('git.autoMessageHint')}
                          >
                            {t('git.backToSuggestion')}
                          </button>
                        )}
                        <span className="flex-1" />
                        <button
                          type="button"
                          aria-expanded={explain}
                          className="text-ink-3 hover:text-ink hover:underline"
                          onClick={() => setExplain((v) => !v)}
                        >
                          {t('git.howTitle')}
                        </button>
                      </div>
                    )}
                    {explain && (
                      <div
                        className="space-y-1 rounded-control border border-line bg-sunken p-2.5 text-[12.5px] text-ink-2"
                        data-testid="commit-explain"
                      >
                        <p>{t('git.how1')}</p>
                        <p>{t('git.how2')}</p>
                        <p>{t('git.how3')}</p>
                      </div>
                    )}
                    <div className="relative">
                      <AutoTextArea
                        value={message}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder={pending ? '' : t('git.messagePlaceholder')}
                        aria-label={t('git.message')}
                        aria-busy={pending}
                        readOnly={pending}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault()
                            void commit()
                          }
                        }}
                        className="min-h-16"
                      />
                      {pending && (
                        // While the model writes: shimmering lines instead of the template.
                        <div
                          role="status"
                          data-testid="commit-generating"
                          className="pointer-events-none absolute inset-0 flex flex-col justify-center gap-1.5 px-3 py-2"
                        >
                          <span className="flex items-center gap-1.5 text-[12px] font-medium text-accent">
                            <Sparkles size={12} className="animate-pulse" /> {t('git.generating')}
                          </span>
                          <span className="skeleton-line w-11/12" />
                          <span className="skeleton-line w-2/3" />
                        </div>
                      )}
                    </div>
                    {!model && custom === null && selected.length > 0 && (
                      <p className="text-[12px] text-ink-3" data-testid="commit-fallback">
                        {t('git.templateNoModel')}{' '}
                        <button
                          type="button"
                          className="font-semibold text-accent hover:underline"
                          onClick={() => useApp.getState().navigate({ name: 'settings', section: 'ai' })}
                        >
                          {t('git.setUpModel')}
                        </button>
                      </p>
                    )}
                    {model && fallback === 'failed' && custom === null && (
                      <p className="text-[12px] text-ink-3" data-testid="commit-fallback">
                        {t('git.templateFailed')}{' '}
                        <button
                          type="button"
                          className="font-semibold text-accent hover:underline"
                          onClick={() => void summarize()}
                        >
                          {t('fix.retry')}
                        </button>
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        variant="primary"
                        icon={<GitCommitHorizontal size={15} />}
                        disabled={pending || !message.trim() || selected.length === 0}
                        className="flex-1"
                      >
                        {t('git.commit', { count: selected.length })}
                      </Button>
                      {pending && (
                        <Button
                          variant="ghost"
                          onClick={() => {
                            setSummarized(signature)
                            setCustom(auto)
                          }}
                          title={t('git.useTemplateHint')}
                        >
                          {t('git.useTemplate')}
                        </Button>
                      )}
                    </div>
                  </form>

                  <section aria-label={t('git.changes')}>
                    <h3 className="mb-1 flex items-center gap-2 px-1 text-[13px] font-semibold text-ink-2">
                      {changes.length > 0 && (
                        <Checkbox
                          label={t('git.selectAll')}
                          checked={excluded.size === 0}
                          onChange={(all) =>
                            setExcluded(all ? new Set() : new Set(changes.map((c) => c.path)))
                          }
                        />
                      )}
                      {t('git.changes')} <span className="font-normal text-ink-3">{changes.length}</span>
                      {changes.length > excluded.size && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto"
                          icon={<Undo2 size={13} />}
                          onClick={async () => {
                            const chosen = changes.filter((c) => !excluded.has(c.path))
                            const ok = await useApp.getState().ask({
                              title: t('git.discardMany', { count: chosen.length }),
                              label: t('git.discardHint'),
                              confirm: true,
                              danger: true,
                              confirmLabel: t('git.discard'),
                            })
                            if (ok !== null) await discardWithUndo(ws, chosen)
                          }}
                        >
                          {excluded.size === 0
                            ? t('git.discardAll')
                            : t('git.discardSelected', { count: changes.length - excluded.size })}
                        </Button>
                      )}
                    </h3>
                    {changes.length === 0 ? (
                      <p className="px-1 text-[13px] text-ink-3">{t('git.noChanges')}</p>
                    ) : (
                      <ul>
                        {changes.map((change) => (
                          <ChangeRow
                            key={change.path}
                            change={change}
                            stats={stats.get(change.path)}
                            selected={!excluded.has(change.path)}
                            onSelect={(on) =>
                              setExcluded((prev) => {
                                const next = new Set(prev)
                                if (on) next.delete(change.path)
                                else next.add(change.path)
                                return next
                              })
                            }
                            onShow={() =>
                              showDiff({
                                path: change.path,
                                status: change.status,
                                ...(change.from ? { from: change.from } : {}),
                              })
                            }
                          />
                        ))}
                      </ul>
                    )}
                  </section>

                  <History />
                </>
              )}
            </div>
          )}
        </div>
      </SidePanel>
    </>
  )
}

function ChangeRow({
  change,
  stats,
  selected,
  onSelect,
  onShow,
}: {
  change: GitChange
  stats: DiffStats | undefined
  selected: boolean
  onSelect: (on: boolean) => void
  onShow: () => void
}) {
  const ws = useWorkspace()
  const { openPage, ask } = useApp()
  const page = ws.get(change.path)
  const folder = dirname(change.path)
  const name = page?.title ?? basename(change.path).replace(/\.md$/, '')
  return (
    <li className="group flex items-center gap-1.5 rounded-control px-1 py-0.5 hover:bg-hover">
      <Checkbox label={t('git.select', { path: change.path })} checked={selected} onChange={onSelect} />
      <button
        type="button"
        onClick={onShow}
        aria-label={t('git.showDiff', { path: change.path })}
        className={cx(
          'flex min-w-0 flex-1 items-baseline gap-1.5 py-0.5 text-left text-[13.5px]',
          change.status === 'deleted' && 'line-through decoration-ink-3',
        )}
      >
        <span className="truncate">{name}</span>
        {folder && <span className="min-w-0 truncate text-[12px] text-ink-3">{folder}</span>}
      </button>
      {stats && <DiffStatsLabel {...stats} />}
      <span className="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100">
        {page && (
          <IconButton size="sm" label={t('git.openPage')} onClick={() => openPage(page.path)}>
            <FileText size={13} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          label={t('git.discard')}
          onClick={async () => {
            const ok = await ask({
              title: t('git.discardConfirm', { path: change.path }),
              label: t('git.discardHint'),
              confirm: true,
              danger: true,
              confirmLabel: t('git.discard'),
            })
            if (ok !== null) await discardWithUndo(ws, [change])
          }}
        >
          <Undo2 size={13} />
        </IconButton>
      </span>
      <StatusLetter status={change.status} />
    </li>
  )
}

function History() {
  const [open, setOpen] = useState(true)
  const [commits, setCommits] = useState<GitCommit[] | null>(null)
  const head = useGit((s) => s.state?.head)
  const upstream = useGit((s) => s.state?.upstream)
  const act = useGit((s) => s.act)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void act((git) => git.log(100, null)).then((list) => !cancelled && setCommits(list ?? []))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, head])
  const rows = commits ? graphRows(commits) : []
  const width = Math.max(1, ...rows.map((r) => r.width))
  // Commits above the upstream's position are not uploaded yet.
  const pushedAt = upstream && commits ? commits.findIndex((c) => c.refs?.includes(upstream)) : -1
  return (
    <section aria-label={t('git.history')}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 px-1 text-[13px] font-semibold text-ink-2 hover:text-ink"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {t('git.history')}
      </button>
      {open && (
        <ul className="mt-1" data-testid="git-graph">
          {commits?.length === 0 && <li className="px-1 text-[13px] text-ink-3">{t('git.historyEmpty')}</li>}
          {commits?.map((c, i) => (
            <CommitRow
              key={c.hash}
              commit={c}
              row={rows[i]!}
              width={width}
              local={pushedAt > 0 && i < pushedAt}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

const LANE = 12
const ROW = 30
const LANE_COLORS = ['var(--accent)', '#d97706', '#7c3aed', '#db2777', '#059669', '#2563eb']
const laneX = (i: number) => 7 + i * LANE

/** One row of the graph: lines from the commits above, the dot, lines on to the parents. */
function GraphCell({ row, width, merge }: { row: GraphRow; width: number; merge: boolean }) {
  const mid = ROW / 2
  const color = (i: number) => LANE_COLORS[i % LANE_COLORS.length]
  return (
    <svg width={laneX(width - 1) + 7} height={ROW} className="shrink-0" aria-hidden>
      {row.top.map((l, k) => (
        <path
          key={`t${k}`}
          d={`M${laneX(l.from)} 0 C${laneX(l.from)} ${mid / 2} ${laneX(l.to)} ${mid / 2} ${laneX(l.to)} ${mid}`}
          stroke={color(l.from)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      {row.bottom.map((l, k) => (
        <path
          key={`b${k}`}
          d={`M${laneX(l.from)} ${mid} C${laneX(l.from)} ${mid * 1.5} ${laneX(l.to)} ${mid * 1.5} ${laneX(l.to)} ${ROW}`}
          stroke={color(l.to)}
          strokeWidth={2}
          fill="none"
        />
      ))}
      <circle
        cx={laneX(row.lane)}
        cy={mid}
        r={merge ? 3 : 4.5}
        fill={merge ? 'var(--surface)' : color(row.lane)}
        stroke={color(row.lane)}
        strokeWidth={2}
      />
    </svg>
  )
}

function CommitRow({
  commit,
  row,
  width,
  local,
}: {
  commit: GitCommit
  row: GraphRow
  width: number
  local: boolean
}) {
  const [files, setFiles] = useState<GitChange[] | null>(null)
  const { act, showDiff } = useGit()
  const date = new Date(commit.date)
  const refs = (commit.refs ?? []).map((r) => r.replace(/^HEAD -> /, ''))
  return (
    <li>
      <button
        type="button"
        aria-expanded={files !== null}
        title={`${commit.subject}\n${commit.author} · ${date.toLocaleString()} · ${commit.short}`}
        onClick={() =>
          files
            ? setFiles(null)
            : void act((git) => git.commitFiles(commit.hash)).then((f) => setFiles(f ?? []))
        }
        className="flex w-full items-center gap-2 rounded-control pr-1 text-left hover:bg-hover"
        style={{ height: ROW }}
      >
        <GraphCell row={row} width={width} merge={(commit.parents?.length ?? 0) > 1} />
        <span className="min-w-0 flex-1 truncate text-[13.5px]">{commit.subject}</span>
        {refs.map((r) => (
          <span
            key={r}
            className={cx(
              'shrink-0 rounded-full border px-1.5 text-[11px]',
              r.includes('/') ? 'border-line text-ink-3' : 'border-accent text-accent',
            )}
          >
            {r}
          </span>
        ))}
        {local && (
          <span className="shrink-0 text-[11px] text-ink-3" title={t('git.notPushed')}>
            ↑
          </span>
        )}
        <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">
          {date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' })}
        </span>
      </button>
      {files && (
        <ul className="mb-1 border-l border-line pl-2" style={{ marginLeft: laneX(row.lane) }}>
          {files.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() =>
                  showDiff({
                    path: f.path,
                    commit: commit.hash,
                    status: f.status,
                    ...(f.from ? { from: f.from } : {}),
                  })
                }
                className="flex w-full items-center gap-1.5 rounded-control px-1 py-0.5 text-left text-[13px] hover:bg-hover"
              >
                <StatusLetter status={f.status} />
                <span className="truncate">{f.path}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Discards the changes (new files into the trash) and offers to bring those files back. */
async function discardWithUndo(ws: Workspace, changes: GitChange[]): Promise<void> {
  const entries = await discardChanges(ws, changes)
  useApp.getState().showToast(
    t('git.discarded', { count: changes.length }),
    entries.length
      ? {
          label: t('git.restoreNew', { count: entries.length }),
          run: () => void restoreEntries(ws, entries),
        }
      : undefined,
  )
}
