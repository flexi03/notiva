import { useEffect, useState } from 'react'
import { Download, ExternalLink } from 'lucide-react'
import { installUpdate } from '@/app/update'
import { useAction, useApp } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { compareVersions, releaseNotes, type ReleaseInfo, type UpdateStatus } from '@/lib/update'
import { electronBridge } from '@/lib/vault'
import { Button, Chip, IconButton, Spinner } from '@/components/ui'
import { MarkdownView } from '@/components/editor/MarkdownView'
import { Row } from '@/screens/settingsLayout'

/**
 * Settings → Über: the installed version, the update state (check, install) and every published
 * version with its notes – any of them can be installed (older ones after a warning).
 */
export function UpdateSettings() {
  const bridge = electronBridge()?.update
  const run = useAction()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    if (!bridge) return
    void bridge.status().then(setStatus)
    void bridge
      .releases()
      .then(setReleases)
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : String(e)))
    return bridge.onStatus(setStatus)
  }, [bridge])

  if (!bridge || !status) return null
  const lang = getLanguage() === 'de' ? 'de' : 'en'
  const locale = lang === 'de' ? 'de-DE' : 'en-US'
  const installed = status.version

  const install = (release: ReleaseInfo) =>
    void run(async () => {
      if (compareVersions(release.version, installed) < 0) {
        const ok = await useApp.getState().ask({
          title: t('update.olderTitle', { version: release.version }),
          label: t('update.olderHint', { current: installed }),
          confirmLabel: t('update.installVersion'),
          confirm: true,
        })
        if (ok === null) return
      }
      await installUpdate(release.version, release.version)
    })

  return (
    <div className="space-y-4" data-testid="update-settings">
      <Row label={t('settings.version', { version: installed })} hint={stateText(status, locale)}>
        <div className="flex flex-wrap gap-2">
          {status.state === 'available' && (
            <Button variant="primary" onClick={() => void run(() => installUpdate(status.latest))}>
              {t('update.installNamed', { version: status.latest })}
            </Button>
          )}
          <Button
            disabled={status.state === 'checking' || status.state === 'downloading'}
            onClick={() => void run(async () => setStatus(await bridge.check()))}
          >
            {t('settings.checkUpdates')}
          </Button>
        </div>
      </Row>

      <div>
        <p className="mb-2 font-semibold">{t('update.versions')}</p>
        {failed && <p className="text-sm text-ink-3">{t('update.versionsFailed', { message: failed })}</p>}
        {!releases && !failed && <Spinner label={t('update.versions')} />}
        {releases && (
          <ul
            className="divide-y divide-line rounded-panel border border-line"
            aria-label={t('update.versions')}
          >
            {releases.map((release) => {
              const order = compareVersions(release.version, installed)
              const notes = releaseNotes(release.notes, lang)
              return (
                <li key={release.version} className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold tabular-nums">{release.version}</span>
                    {order === 0 && <Chip color="green">{t('update.installed')}</Chip>}
                    {order > 0 && <Chip color="blue">{t('update.newer')}</Chip>}
                    {release.date && (
                      <span className="text-[13px] text-ink-3">
                        {new Date(release.date).toLocaleDateString(locale)}
                      </span>
                    )}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      {order !== 0 && release.asset && (
                        <Button
                          size="sm"
                          variant={order > 0 ? 'primary' : 'ghost'}
                          onClick={() => install(release)}
                        >
                          <Download size={14} />
                          {t('update.installVersion')}
                        </Button>
                      )}
                      <IconButton
                        size="sm"
                        label={t('update.onGitHub')}
                        onClick={() => void electronBridge()?.openExternal(release.url)}
                      >
                        <ExternalLink size={14} />
                      </IconButton>
                    </span>
                  </div>
                  {notes && (
                    <details className="mt-1 text-[13px]">
                      <summary className="cursor-pointer text-ink-3">{t('update.notes')}</summary>
                      <MarkdownView markdown={notes} untrusted className="mt-1" />
                    </details>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

function stateText(s: UpdateStatus, locale: string): string {
  switch (s.state) {
    case 'checking':
      return t('update.checking')
    case 'available':
      return t('update.available', { version: s.latest })
    case 'downloading':
      return t('update.downloading', { done: Math.round(s.done / 1e6), total: Math.round(s.total / 1e6) })
    case 'ready':
      return t('update.restarting')
    case 'error':
      return `${t('update.failed')}: ${s.message}`
    default:
      return s.checkedAt
        ? t('update.upToDate', { date: new Date(s.checkedAt).toLocaleString(locale) })
        : t('update.notChecked')
  }
}
