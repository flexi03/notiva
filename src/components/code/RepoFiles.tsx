import { useEffect, useState } from 'react'
import { Code2, ExternalLink, FileCode2, FolderOpen, RefreshCw } from 'lucide-react'
import { updateRepo } from '@/app/repoUpdate'
import { loadRepoInfo, useRepoInfo } from '@/app/repoInfo'
import { textHash } from '@/lib/textHash'
import { MarkdownView } from '@/components/editor/MarkdownView'
import { ResizeHandle, useStoredWidth } from '@/components/layout/ResizeHandle'
import { TokenBanner } from './GitTokens'
import { RepoTask } from './LabLinks'
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
  const info = useRepoInfo((s) => (remote ? s[remote] : undefined))
  const [descHeight, setDescHeight] = useStoredWidth('repo-desc-h', 260, 80, 1400)
  useEffect(() => {
    if (!remote) return
    void loadRepoInfo(ws, remote)
    // Pages of an earlier version had the description as their text: unchanged → it moves into the
    // box above (the text is for notes now); changed → it stays as the user's notes.
    if (page.data.descriptionHash !== undefined) {
      const untouched = textHash(page.body.trim()) === String(page.data.bodyHash ?? '')
      const data = { ...page.data }
      delete data.descriptionHash
      delete data.bodyHash
      void ws.save(page.path, { data, ...(untouched ? { body: '' } : {}) })
    }
  }, [ws, remote, page])
  return (
    <section aria-label={t('repo.files')} data-testid="repo-files" className="no-print mt-4 space-y-3">
      <TokenBanner remote={remote} />
      <RepoTask repo={page} />
      {(info?.description || info?.scope) && (
        <div className="rounded-panel border border-line bg-sunken/60 p-3" data-testid="repo-description">
          <p className="mb-1 text-[12px] font-semibold text-ink-3">{t('repo.description')}</p>
          {info.description ? (
            // Height draggable at the lower edge (like the terminal).
            <div className="relative" style={{ height: descHeight }}>
              <div className="h-full overflow-y-auto pr-2">
                <MarkdownView markdown={info.description} untrusted className="md text-[14px]" />
              </div>
              <ResizeHandle
                side="bottom"
                width={descHeight}
                onResize={setDescHeight}
                label={t('fileContext.description')}
                reset={260}
              />
            </div>
          ) : (
            <p className="text-[13px] text-ink-2">{t('repo.noDescriptionScope')}</p>
          )}
        </div>
      )}
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
      <p className="text-[12.5px] text-ink-3">{t('repo.filesHint')}</p>
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
