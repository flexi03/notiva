import { currentProfile } from '@/app/university'
import { useEffect, useState } from 'react'
import { ipcMessage, moodleAvailable, useMoodle } from '@/app/moodle'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { Button, Field, Segmented, Switch, TextInput } from '@/components/ui'
import { Row } from '@/screens/settingsLayout'

type Mode = 'browser' | 'login' | 'calendar' | 'token'

/** Settings → Moodle: connect once, then fetch courses and deadlines into the study dashboard. */
export function MoodleSection() {
  const { status, refresh, connect, disconnect, setImportOpen } = useMoodle()
  const showToast = useApp((s) => s.showToast)
  const autoSave = useApp((s) => s.settings.moodleAutoSave)
  const [mode, setMode] = useState<Mode>('browser')
  // Default from the university profile (Studium/Hochschule.md; default: HSD).
  const [site, setSite] = useState(() => currentProfile(useApp.getState().ws).moodle.site)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const desktop = moodleAvailable()

  useEffect(() => {
    if (desktop) void refresh()
  }, [desktop, refresh])

  if (!desktop) return <p className="text-sm text-ink-3">{t('moodle.desktopOnly')}</p>

  if (status?.connected)
    return (
      <>
        <p role="status" className="text-sm">
          {status.mode === 'calendar'
            ? t('moodle.connectedCalendar', { site: status.site ?? '' })
            : t('moodle.connected', { site: status.site ?? '', user: status.user ?? '–' })}
        </p>
        <p className="text-[13px] text-ink-3">
          {status.remembered === false ? t('moodle.notRemembered') : t('moodle.stored')}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setImportOpen(true)}>
            {t('moodle.fetch')}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              void disconnect().then(() => showToast(t('moodle.disconnected')))
            }}
          >
            {t('moodle.disconnect')}
          </Button>
        </div>
        <Row label={t('moodle.autoSave')} hint={t('moodle.autoSaveHint')}>
          <Switch
            label={t('moodle.autoSave')}
            checked={autoSave}
            onChange={(v) => useApp.getState().updateSettings({ moodleAutoSave: v })}
          />
        </Row>
        <p className="text-[13px] text-ink-3">{t('moodle.aiHint')}</p>
      </>
    )

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await connect(
        mode === 'browser'
          ? { mode, site }
          : mode === 'calendar'
            ? { mode, url: secret }
            : mode === 'token'
              ? { mode, site, token: secret }
              : { mode, site, username, password },
      )
      setPassword('')
      setSecret('')
      showToast(t('moodle.connectedToast', { site: result.site ?? '' }))
    } catch (e) {
      setError(ipcMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <p className="text-[13px] text-ink-3">{t('moodle.intro')}</p>
      <Segmented
        label={t('moodle.mode')}
        value={mode}
        onChange={(m) => {
          setMode(m)
          setError(null)
        }}
        options={[
          { value: 'browser', label: t('moodle.mode.browser') },
          { value: 'login', label: t('moodle.mode.login') },
          { value: 'calendar', label: t('moodle.mode.calendar') },
          { value: 'token', label: t('moodle.mode.token') },
        ]}
      />
      <p className="text-[13px] text-ink-3">{t(`moodle.hint.${mode}`)}</p>
      {mode !== 'calendar' && (
        <Field label={t('moodle.site')}>
          <TextInput
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="https://moodle.uni-beispiel.de"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            required
          />
        </Field>
      )}
      {mode === 'login' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('moodle.username')}>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              spellCheck={false}
              required
            />
          </Field>
          <Field label={t('moodle.password')} hint={t('moodle.passwordHint')}>
            <TextInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
        </div>
      )}
      {(mode === 'calendar' || mode === 'token') && (
        <Field label={mode === 'calendar' ? t('moodle.calendarUrl') : t('moodle.token')}>
          <TextInput
            type={mode === 'token' ? 'password' : 'url'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder={
              mode === 'calendar' ? 'https://…/calendar/export_execute.php?userid=…&authtoken=…' : ''
            }
            required
          />
        </Field>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" variant="primary" disabled={busy}>
        {busy
          ? mode === 'browser'
            ? t('moodle.waitingLogin')
            : t('moodle.connecting')
          : mode === 'browser'
            ? t('moodle.openLogin')
            : t('moodle.connect')}
      </Button>
    </form>
  )
}
