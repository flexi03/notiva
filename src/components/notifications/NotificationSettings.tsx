import { useEffect, useState } from 'react'
import { t } from '@/i18n'
import { electronBridge, type NotifySettings } from '@/lib/vault'
import { Select, Switch } from '@/components/ui'
import { Row } from '@/screens/settingsLayout'

/** Settings → Benachrichtigungen: system banners and how often Moodle is checked (desktop). */
export function NotificationSettingsSection() {
  const bridge = electronBridge()?.notifications
  const [settings, setSettings] = useState<NotifySettings | null>(null)
  useEffect(() => {
    void bridge?.settings().then(setSettings)
  }, [bridge])
  if (!bridge) return <p className="text-sm text-ink-3">{t('notify.settingsBrowser')}</p>
  if (!settings) return null
  const save = (patch: Partial<NotifySettings>) =>
    void bridge.setSettings({ ...settings, ...patch }).then(setSettings)
  return (
    <>
      <Row label={t('notify.system')} hint={t('notify.systemHint')}>
        <Switch
          checked={settings.system}
          onChange={(system) => save({ system })}
          label={t('notify.system')}
        />
      </Row>
      <Row label={t('notify.interval')} hint={t('notify.intervalHint')}>
        <Select
          aria-label={t('notify.interval')}
          value={String(settings.intervalMinutes)}
          onChange={(e) => save({ intervalMinutes: Number(e.target.value) })}
        >
          {[5, 15, 30, 60, 120].map((m) => (
            <option key={m} value={m}>
              {t('notify.minutes', { count: m })}
            </option>
          ))}
        </Select>
      </Row>
    </>
  )
}
