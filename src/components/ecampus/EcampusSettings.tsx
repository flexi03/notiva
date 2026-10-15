import { useEffect, useState } from 'react'
import { ecampusAvailable, useEcampus } from '@/app/ecampus'
import { useApp } from '@/app/store'
import { currentProfile } from '@/app/university'
import { getLanguage, t } from '@/i18n'
import { Button, Field, TextInput } from '@/components/ui'

/** Settings → eCampus: sign in once, then results are checked in the background. */
export function EcampusSection() {
  const { status, busy, error, refresh, connect, fetchNow, disconnect } = useEcampus()
  const navigate = useApp((s) => s.navigate)
  // Addresses from the university profile (Studium/Hochschule.md; default: HSD).
  const profile = currentProfile(useApp((s) => s.ws))
  const [startUrl, setStartUrl] = useState(profile.ecampus.startUrl)
  const [examsUrl, setExamsUrl] = useState(profile.ecampus.examsUrl)
  const [advanced, setAdvanced] = useState(false)
  const desktop = ecampusAvailable()

  useEffect(() => {
    if (desktop) void refresh()
  }, [desktop, refresh])

  if (!desktop) return <p className="text-sm text-ink-3">{t('ecampus.desktopOnly')}</p>
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'

  return (
    <>
      <p className="text-[13px] text-ink-3">{t('ecampus.intro')}</p>
      {status?.connected ? (
        <>
          <p role="status" className="text-sm">
            {status.fetchedAt
              ? t('ecampus.status', {
                  count: status.count ?? 0,
                  time: new Date(status.fetchedAt).toLocaleString(locale),
                })
              : t('ecampus.connected')}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={busy} onClick={() => navigate({ name: 'grades' })}>
              {t('ecampus.show')}
            </Button>
            <Button disabled={busy} onClick={() => void fetchNow()}>
              {t('ecampus.check')}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                void connect({ startUrl: status.startUrl ?? startUrl, examsUrl: status.examsUrl ?? examsUrl })
              }
            >
              {t('ecampus.relogin')}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void disconnect()}>
              {t('moodle.disconnect')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-ink-2">
            <li>{t('ecampus.step1')}</li>
            <li>{t('ecampus.step2')}</li>
            <li>{t('ecampus.step3')}</li>
          </ol>
          <button
            type="button"
            className="text-[13px] text-accent hover:underline"
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? t('ecampus.hideAddresses') : t('ecampus.addresses')}
          </button>
          {advanced && (
            <div className="space-y-3">
              <Field label={t('ecampus.startUrl')}>
                <TextInput
                  value={startUrl}
                  onChange={(e) => setStartUrl(e.target.value)}
                  spellCheck={false}
                />
              </Field>
              <Field label={t('ecampus.examsUrl')}>
                <TextInput
                  value={examsUrl}
                  onChange={(e) => setExamsUrl(e.target.value)}
                  spellCheck={false}
                />
              </Field>
            </div>
          )}
          <Button variant="primary" disabled={busy} onClick={() => void connect({ startUrl, examsUrl })}>
            {busy ? t('ecampus.waiting') : t('ecampus.connect')}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </>
  )
}
