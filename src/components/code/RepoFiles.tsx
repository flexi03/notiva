import { useEffect, useState } from 'react'
import { Code2, ExternalLink, FileCode2, FolderOpen, RefreshCw } from 'lucide-react'
import { updateRepo } from '@/app/repoUpdate'
import { TokenBanner } from './GitTokens'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { isTextFile } from '@/lib/codeFolders'
import type { Page } from '@/lib/workspace'
import { electronBridge } from '@/lib/vault'
import { Button } from '@/components/ui'

/**
 * Below a repository's page: its files – text files shown right here (e.g. the SQL of a lab
 * snippet), each one also opens in the app's editor – plus the project link, the editor and the
 * folder.
 */
export function RepoFiles({ page }: { page: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const folder = page.path.slice(0, -3)
  const files = ws
    .assets()
    .filter((f) => f.path.startsWith(`${folder}/`) && !f.path.slice(folder.length + 1).startsWith('.'))
    .sort((a, b) => a.path.localeCompare(b.path, 'de', { numeric: true }))
  const link = typeof page.data.link === 'string' && /^https:/.test(page.data.link) ? page.data.link : null
  const code = electronBridge()?.code
  const remote = typeof page.data.repo === 'string' ? page.data.repo : undefined
  return (
    <section aria-label={t('repo.files')} data-testid="repo-files" className="no-print mt-4 space-y-3">
      <TokenBanner remote={remote} />
      <div className="flex flex-wrap gap-2">
        {code?.repoFetch && (
          <Button icon={<RefreshCw size={15} />} onClick={() => void run(() => updateRepo(ws, folder))}>
            {t('repo.update')}
          </Button>
        )}
        {code && (
          <Button
            variant="primary"
            icon={<Code2 size={15} />}
            onClick={() => void run(() => code.open(folder, 'editor'))}
          >
            {t('code.openEditor')}
          </Button>
        )}
        {link && (
          <Button icon={<ExternalLink size={15} />} onClick={() => void electronBridge()?.openExternal(link)}>
            {t('repo.openLink')}
          </Button>
        )}
        {code && (
          <Button icon={<FolderOpen size={15} />} onClick={() => void run(() => code.open(folder, 'finder'))}>
            {t('repo.showFolder')}
          </Button>
        )}
      </div>
      {files.length === 0 && <p className="text-sm text-ink-3">{t('repo.empty')}</p>}
      {files.map((f, i) => (
        <FilePreview
          key={f.path}
          path={f.path}
          name={f.path.slice(folder.length + 1)}
          open={i < 3}
          onOpen={() => navigate({ name: 'file', path: f.path })}
        />
      ))}
    </section>
  )
}

function FilePreview({
  path,
  name,
  open,
  onOpen,
}: {
  path: string
  name: string
  open: boolean
  onOpen: () => void
}) {
  const ws = useWorkspace()
  const [text, setText] = useState<string | null>(null)
  const text_ = isTextFile(path) && !/\.md$/i.test(path)
  const size = ws.assets().find((f) => f.path === path)?.size ?? 0
  useEffect(() => {
    if (!text_ || size > 200_000) return
    let cancelled = false
    void ws.vault.read(path).then(
      (s) => !cancelled && setText(s),
      () => undefined,
    )
    return () => {
      cancelled = true
    }
  }, [ws, path, text_, size])
  return (
    <details open={open && text !== null} className="rounded-panel border border-line">
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13.5px]">
        <FileCode2 size={14} className="shrink-0 text-accent" />
        <span className="min-w-0 flex-1 truncate font-code">{name}</span>
        <button
          type="button"
          className="text-[12.5px] font-semibold text-accent hover:underline"
          onClick={(e) => {
            e.preventDefault()
            onOpen()
          }}
        >
          {t('repo.openFile')}
        </button>
      </summary>
      {text !== null && (
        <pre className="max-h-[32rem] overflow-auto border-t border-line bg-sunken px-3 py-2 font-code text-[12.5px] leading-relaxed">
          {text}
        </pre>
      )}
    </details>
  )
}
