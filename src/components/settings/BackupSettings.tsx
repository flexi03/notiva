import { useEffect, useState } from 'react'
import { FolderOpen, HardDrive, RotateCcw } from 'lucide-react'
import { runBackup } from '@/app/backup'
import { useAction, useApp } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { electronBridge, type BackupStatus } from '@/lib/vault'
import { Button, IconButton, Switch } from '@/components/ui'

/**
 * Settings → Speicher → Sicherung: daily snapshots outside the folder (where, with Git or not),
 * "Jetzt sichern", and every snapshot to show in the Finder or restore as a new folder.
 */
export function BackupSettings() {
  const backup = electronBridge()?.backup
  const run = useAction()
  const [status, setStatus] = useState<BackupStatus | null>(null)
  useEffect(() => {
    void backup?.status().then(setStatus)
  }, [backup])
  if (!backup) return <p className="text-sm text-ink-3">{t('backup.desktopOnly')}</p>
  if (!status) return null
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const size = (bytes: number) =>
    bytes > 1e9
      ? `${(bytes / 1e9).toLocaleString(locale, { maximumFractionDigits: 1 })} GB`
      : `${Math.round(bytes / 1e6).toLocaleString(locale)} MB`
  const last = status.snapshots[0]

  return (
    <div className="space-y-3" data-testid="backup-settings">
      <p className="text-sm text-ink-2">{t('backup.explain')}</p>
      <Switch
        label={t('backup.enabled')}
        checked={status.settings.enabled}
        onChange={(enabled) => void backup.settings({ enabled }).then(setStatus)}
      />
      <Switch
        label={t('backup.withGit')}
        checked={status.settings.withGit}
        onChange={(withGit) => void backup.settings({ withGit }).then(setStatus)}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <HardDrive size={15} className="text-ink-3" />
        <span
          className="min-w-0 truncate font-code text-[12.5px]"
          title={status.root ?? status.settings.folder}
        >
          {status.root ?? status.settings.folder}
        </span>
        <Button size="sm" variant="ghost" onClick={() => void backup.chooseFolder().then(setStatus)}>
          {t('backup.chooseFolder')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void run(() => backup.show())}>
          {t('backup.openFolder')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          disabled={status.running || !status.root}
          onClick={() =>
            void run(async () => {
              await runBackup()
              setStatus(await backup.status())
            })
          }
        >
          {t('backup.now')}
        </Button>
        <span className="text-[13px] text-ink-3" data-testid="backup-last">
          {last ? t('backup.last', { date: new Date(last.date).toLocaleString(locale) }) : t('backup.none')}
        </span>
      </div>
      {status.snapshots.length > 0 && (
        <ul className="divide-y divide-line rounded-panel border border-line text-[13px]">
          {status.snapshots.map((s) => (
            <li key={s.name} className="flex items-center gap-2 px-3 py-1.5">
              <span className="flex-1 tabular-nums">{new Date(s.date).toLocaleString(locale)}</span>
              <span className="text-ink-3 tabular-nums">
                {t('backup.files', { count: s.files })} · {size(s.bytes)}
              </span>
              <IconButton
                size="sm"
                label={t('backup.showOne')}
                onClick={() => void run(() => backup.show(s.name))}
              >
                <FolderOpen size={14} />
              </IconButton>
              <IconButton
                size="sm"
                label={t('backup.restore')}
                onClick={() =>
                  void run(async () => {
                    const ok = await useApp.getState().ask({
                      title: t('backup.restoreTitle', { date: new Date(s.date).toLocaleString(locale) }),
                      label: t('backup.restoreHint'),
                      confirmLabel: t('backup.restore'),
                      confirm: true,
                    })
                    if (ok === null) return
                    const target = await backup.restore(s.name)
                    useApp.getState().showToast(t('backup.restored', { path: target }))
                  })
                }
              >
                <RotateCcw size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
