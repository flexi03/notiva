import { useEffect, useState } from 'react'
import { Smartphone, Trash2 } from 'lucide-react'
import QRCode from 'qrcode'
import { useAction, useApp } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { electronBridge, type CompanionStatus } from '@/lib/vault'
import { Button, IconButton, TextInput } from '@/components/ui'

/**
 * Settings → iPhone & iPad: pair a device (QR code with its own key, valid 10 minutes – shown only
 * while pairing), see the paired ones and unpair them.
 */
export function CompanionSettings() {
  const bridge = electronBridge()?.companion
  const run = useAction()
  const [status, setStatus] = useState<CompanionStatus | null>(null)
  const [name, setName] = useState('iPhone')
  const [qr, setQr] = useState<string | null>(null)
  useEffect(() => {
    if (!bridge) return
    void bridge.status().then(setStatus)
    // Paired: the QR code (it holds the key) disappears at once.
    return bridge.onPaired(() => {
      setQr(null)
      void bridge.status().then(setStatus)
    })
  }, [bridge])
  if (!bridge) return <p className="text-sm text-ink-3">{t('companion.desktopOnly')}</p>
  if (!status) return null
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'

  const pair = () =>
    void run(async () => {
      const result = await bridge.pair(name.trim() || 'iPhone')
      setStatus(result)
      setQr(await QRCode.toDataURL(result.pairing, { margin: 1, width: 400, errorCorrectionLevel: 'M' }))
    })

  return (
    <div className="space-y-3" data-testid="companion-settings">
      <p className="text-sm text-ink-2">{t('companion.explain')}</p>
      {status.error && (
        <p role="alert" className="text-sm text-danger">
          {status.error}
        </p>
      )}
      {qr ? (
        <div className="flex flex-wrap items-start gap-4">
          <img
            src={qr}
            alt={t('companion.qr')}
            width={200}
            height={200}
            className="rounded-panel border border-line bg-white p-2"
          />
          <div className="min-w-0 flex-1 space-y-2 text-[13px]">
            <p>{t('companion.scan')}</p>
            <p className="text-ink-3">{t('companion.qrHint')}</p>
            <Button size="sm" variant="ghost" onClick={() => setQr(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <TextInput
            aria-label={t('companion.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-44"
          />
          <Button variant="primary" icon={<Smartphone size={15} />} onClick={pair}>
            {t('companion.pair')}
          </Button>
        </div>
      )}
      {status.devices.length > 0 && (
        <ul
          className="divide-y divide-line rounded-panel border border-line text-[13px]"
          aria-label={t('companion.devices')}
        >
          {status.devices.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-1.5">
              <Smartphone size={14} className="text-ink-3" />
              <span className="flex-1 font-medium">{d.name}</span>
              <span className="text-ink-3">
                {d.lastSeen
                  ? t('companion.lastSeen', { date: new Date(d.lastSeen).toLocaleString(locale) })
                  : t('companion.never')}
              </span>
              <IconButton
                size="sm"
                label={t('companion.remove', { name: d.name })}
                onClick={() =>
                  void run(async () => {
                    const ok = await useApp.getState().ask({
                      title: t('companion.removeTitle', { name: d.name }),
                      label: t('companion.removeHint'),
                      confirmLabel: t('companion.removeShort'),
                      confirm: true,
                      danger: true,
                    })
                    if (ok !== null) setStatus(await bridge.remove(d.id))
                  })
                }
              >
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
