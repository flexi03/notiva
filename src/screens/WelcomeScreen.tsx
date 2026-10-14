import { useEffect, useState, type ReactNode } from 'react'
import { FolderOpen, HardDrive, Sparkles } from 'lucide-react'
import { useApp } from '@/app/store'
import {
  availableVaults,
  openBrowserVault,
  openDemo,
  openFolder,
  reopenFolder,
  storedFolderName,
} from '@/app/vaults'
import { t } from '@/i18n'
import type { Workspace } from '@/lib/workspace'
import { cx, Spinner } from '@/components/ui'

function Choice({
  icon,
  title,
  hint,
  onClick,
  disabled,
  primary,
}: {
  icon: ReactNode
  title: string
  hint: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'group flex w-full items-start gap-4 border-b border-line py-4 text-left transition-colors last:border-b-0 disabled:opacity-40',
        'hover:bg-surface sm:px-3',
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-panel',
          primary ? 'bg-accent text-on-accent' : 'bg-sunken text-ink-2',
        )}
      >
        {icon}
      </span>
      <span>
        <span className="block font-bold group-hover:underline group-hover:decoration-marker group-hover:decoration-[3px] group-hover:underline-offset-4">
          {title}
        </span>
        <span className="mt-0.5 block text-[14px] text-ink-2">{hint}</span>
      </span>
    </button>
  )
}

export function WelcomeScreen() {
  const setWorkspace = useApp((s) => s.setWorkspace)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastFolder, setLastFolder] = useState<string | null>(null)
  const options = availableVaults()

  useEffect(() => {
    void storedFolderName().then(setLastFolder)
  }, [])

  const open = async (task: () => Promise<Workspace | null>) => {
    setBusy(true)
    setError(null)
    try {
      const ws = await task()
      if (ws) await setWorkspace(ws)
    } catch (e) {
      setError(t('welcome.error', { message: (e as Error).message }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-xl">
        <h1 className="text-[clamp(3rem,10vw,5.5rem)] leading-[0.95] font-bold tracking-[-0.035em]">
          <span className="bg-[linear-gradient(transparent_58%,var(--marker)_58%,var(--marker)_88%,transparent_88%)] px-1">
            Notiva
          </span>
        </h1>
        <p className="mt-5 max-w-md text-[17px] text-ink-2">{t('app.tagline')}</p>
        <h2 className="mt-12 mb-1 text-[13px] font-semibold text-ink-3">{t('welcome.title')}</h2>
        {busy ? (
          <Spinner label={t('common.loading')} />
        ) : (
          <div className="border-t border-line">
            {lastFolder && (
              <Choice
                primary
                icon={<FolderOpen size={19} />}
                title={t('welcome.reopen', { name: lastFolder })}
                hint={t('welcome.folderHint')}
                onClick={() => void open(reopenFolder)}
              />
            )}
            <Choice
              primary={!lastFolder}
              icon={<FolderOpen size={19} />}
              title={t('welcome.folder')}
              hint={options.folder ? t('welcome.folderHint') : t('welcome.unsupported')}
              disabled={!options.folder}
              onClick={() => void open(openFolder)}
            />
            {!options.electron && (
              <Choice
                icon={<HardDrive size={19} />}
                title={t('welcome.browser')}
                hint={t('welcome.browserHint')}
                disabled={!options.browser}
                onClick={() => void open(openBrowserVault)}
              />
            )}
            <Choice
              icon={<Sparkles size={19} />}
              title={t('welcome.demo')}
              hint={t('welcome.demoHint')}
              onClick={() => void open(openDemo)}
            />
          </div>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
