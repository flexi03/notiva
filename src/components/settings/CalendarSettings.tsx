import { useEffect, useState } from 'react'
import { Copy, RefreshCw } from 'lucide-react'
import QRCode from 'qrcode'
import { publishCalendar } from '@/app/calendarPublish'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { electronBridge, type CalendarStatus } from '@/lib/vault'
import { Button, IconButton, Switch } from '@/components/ui'

/**
 * Settings → Studium → Kalender aufs Handy: switch the feed on, scan the QR code with the phone
 * (Apple Kalender subscribes), copy an address, or make a new secret to stop old subscriptions.
 */
export function CalendarSettings() {
  const bridge = electronBridge()?.calendar
  const ws = useWorkspace()
  const run = useAction()
  const [status, setStatus] = useState<CalendarStatus | null>(null)
  const [qr, setQr] = useState('')
  useEffect(() => {
    void bridge?.status().then(setStatus)
  }, [bridge])
  const url = status?.enabled ? status.urls[0] : undefined
  useEffect(() => {
    if (!url) return
    let alive = true
    void QRCode.toDataURL(url, { margin: 1, width: 336 }).then((png) => alive && setQr(png))
    return () => {
      alive = false
    }
  }, [url])
  if (!bridge) return <p className="text-sm text-ink-3">{t('calendarFeed.desktopOnly')}</p>
  if (!status) return null
  const apply = (next: Promise<CalendarStatus>) =>
    void run(async () => {
      const s = await next
      setStatus(s)
      if (s.enabled) await publishCalendar(ws)
    })

  return (
    <div className="space-y-3" data-testid="calendar-settings">
      <p className="text-sm text-ink-2">{t('calendarFeed.explain')}</p>
      <Switch
        label={t('calendarFeed.enabled')}
        checked={status.enabled}
        onChange={(on) => apply(bridge.set(on))}
      />
      {status.error && (
        <p role="alert" className="text-sm text-danger">
          {status.error}
        </p>
      )}
      {status.enabled && (
        <div className="flex flex-wrap items-start gap-4">
          {qr && url && (
            <img
              src={qr}
              alt={t('calendarFeed.qr')}
              width={168}
              height={168}
              className="rounded-panel border border-line bg-white p-2"
            />
          )}
          <div className="min-w-0 flex-1 space-y-2 text-[13px]">
            <p>{t('calendarFeed.how')}</p>
            {status.urls.length === 0 ? (
              <p className="text-danger">{t('calendarFeed.noNetwork')}</p>
            ) : (
              <ul className="space-y-1">
                {status.urls.map((u) => (
                  <li key={u} className="flex items-center gap-1">
                    <code className="min-w-0 flex-1 truncate font-code text-[12px]" title={u}>
                      {u.replace(/\/cal\/.+$/, '/cal/…')}
                    </code>
                    {u.includes('://100.') && (
                      <span className="rounded-full border border-line px-1.5 text-[11px] text-ink-3">
                        Tailscale
                      </span>
                    )}
                    <IconButton
                      size="sm"
                      label={t('calendarFeed.copy')}
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(u)
                          .then(() => useApp.getState().showToast(t('path.copied')))
                      }
                    >
                      <Copy size={13} />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            <Button
              size="sm"
              variant="ghost"
              icon={<RefreshCw size={13} />}
              onClick={() => apply(bridge.newToken())}
            >
              {t('calendarFeed.newToken')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
