import { useEffect, useState } from 'react'
import { t } from '@/i18n'
import { electronBridge, type CheckKind, type NotifySettings } from '@/lib/vault'
import { Button, Select, Switch } from '@/components/ui'
import { Row } from '@/screens/settingsLayout'

const CHECKS: CheckKind[] = ['moodle', 'materials', 'courseInfo', 'grades', 'examPlan']

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
      {bridge.test && (
        <Button size="sm" onClick={() => void bridge.test!().catch(() => undefined)}>
          {t('notify.test')}
        </Button>
      )}
      <p className="text-[13px] text-ink-3">{t('notify.intervalHint')}</p>
      {CHECKS.map((kind) => (
        <Row key={kind} label={t(`notify.check.${kind}`)}>
          <Select
            aria-label={t(`notify.check.${kind}`)}
            value={String(settings.intervals[kind])}
            onChange={(e) => save({ intervals: { ...settings.intervals, [kind]: Number(e.target.value) } })}
          >
            {[0, 5, 15, 30, 60, 180, 360, 720, 1440].map((m) => (
              <option key={m} value={m}>
                {m === 0
                  ? t('notify.manual')
                  : m < 60
                    ? t('notify.minutes', { count: m })
                    : t('notify.hours', { count: m / 60 })}
              </option>
            ))}
          </Select>
        </Row>
      ))}
    </>
  )
}
