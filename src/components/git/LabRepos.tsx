import { useCallback, useEffect, useState } from 'react'
import { ArrowUpFromLine, GitBranch, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { labFoldersOf, loadClones, useClones } from '@/app/clones'
import { hubsOf } from '@/app/labHubs'
import { showLoginHint } from '@/app/clone'
import { updateRepo } from '@/app/repoUpdate'
import { announce, withProgress } from '@/app/progress'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { Button, IconButton, TextInput } from '@/components/ui'
import { TokenBanner } from '@/components/code/GitTokens'

interface Status {
  branch: string | null
  ahead: number
  behind: number
  changes: Array<{ path: string; status: string }>
}

/**
 * Git sidebar → "Praktikum-Repos": every got lab repository with its own Git – changes, commit,
 * upload, update from the server. Kept apart from the vault's Git (they have their own history).
 */
export function LabRepos() {
  const ws = useWorkspace()
  const labs = ws
    .all()
    .filter((p) => p.data.code === true)
    .map((p) => p.path.slice(0, -3))
  // Labs below modules and free ones (e.g. "Praktikum.md" at the top).
  const base = [...new Set([...labs, ...ws.databases().flatMap((db) => labFoldersOf(ws, db.path))])]
  // Repositories live in the sessions' folders too (P01/…).
  const all = [...base, ...base.flatMap((l) => [...hubsOf(ws, l).values()].map((h) => h.path.slice(0, -3)))]
  const key = all.join('|')
  const clones = useClones()
  useEffect(() => {
    for (const lab of key ? key.split('|') : []) void loadClones(lab)
  }, [key])
  const repos = all.flatMap((lab) => (clones[lab] ?? []).map((c) => ({ ...c, folder: `${lab}/${c.name}` })))
  if (!repos.length) return <p className="px-1 text-[13px] text-ink-3">{t('labRepos.none')}</p>
  return (
    <ul className="space-y-3" data-testid="lab-repos-tab">
      {repos.map((r) => (
        <Repo key={r.folder} folder={r.folder} name={r.name} remote={r.remote} />
      ))}
    </ul>
  )
}

function Repo({ folder, name, remote }: { folder: string; name: string; remote: string }) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const code = electronBridge()?.code
  const [status, setStatus] = useState<Status | null>(null)
  const [message, setMessage] = useState('')
  const reload = useCallback(
    () =>
      void code
        ?.repoStatus?.(folder)
        .then(setStatus)
        .catch(() => setStatus(null)),
    [code, folder],
  )
  useEffect(reload, [reload, ws.version])

  const push = () =>
    run(async () => {
      try {
        await withProgress(t('labRepos.push'), () => code!.repoPush!(folder), {
          success: () => t('labRepos.pushed', { name }),
        })
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e)
        if (/WRITE:/.test(text))
          announce(t('labRepos.writeScope'), { state: 'info', sticky: true, open: true })
        else if (/LOGIN:/.test(text)) await showLoginHint(remote, () => void push())
      }
      reload()
    })

  return (
    <li className="space-y-2 rounded-panel border border-line p-2.5">
      <div className="flex items-center gap-2">
        <GitBranch size={14} className="shrink-0 text-accent" />
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold hover:underline"
          title={folder}
          onClick={() =>
            navigate({
              name: 'page',
              path: ws.get(`${folder}.md`)
                ? `${folder}.md`
                : `${folder.slice(0, folder.lastIndexOf('/'))}.md`,
            })
          }
        >
          {name}
        </button>
        <IconButton
          size="sm"
          label={t('repo.update')}
          onClick={() => void run(async () => (await updateRepo(ws, folder), reload()))}
        >
          <RefreshCw size={13} />
        </IconButton>
      </div>
      <TokenBanner remote={remote} />
      <p className="text-[12px] text-ink-3">
        {[
          status?.branch,
          status &&
            (status.changes.length
              ? t('labRepos.changes', { count: status.changes.length })
              : t('labRepos.clean')),
          status?.ahead ? t('labRepos.ahead', { count: status.ahead }) : '',
          status?.behind ? t('labRepos.behind', { count: status.behind }) : '',
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {status && status.changes.length > 0 && (
        <>
          <ul className="space-y-0.5">
            {status.changes.slice(0, 30).map((c) => (
              <li key={c.path}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-control px-1 py-0.5 text-left font-code text-[12.5px] hover:bg-hover"
                  onClick={() => navigate({ name: 'file', path: `${folder}/${c.path}` })}
                >
                  <span className="w-4 shrink-0 text-ink-3">
                    {c.status === 'untracked' ? 'U' : c.status[0]!.toUpperCase()}
                  </span>
                  <span className="truncate">{c.path}</span>
                </button>
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!message.trim()) return
              void run(async () => {
                await code!.repoCommit!(folder, message)
                setMessage('')
                announce(t('labRepos.committed', { name }))
                reload()
              })
            }}
          >
            <TextInput
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={t('labRepos.message')}
              aria-label={t('labRepos.message')}
              className="min-w-0 flex-1"
            />
            <Button
              type="submit"
              size="sm"
              icon={<GitCommitHorizontal size={13} />}
              disabled={!message.trim()}
            >
              {t('labRepos.commit')}
            </Button>
          </form>
        </>
      )}
      {status && status.ahead > 0 && (
        <Button size="sm" icon={<ArrowUpFromLine size={13} />} onClick={() => void push()}>
          {t('labRepos.push')}
        </Button>
      )}
    </li>
  )
}
