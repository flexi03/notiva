import { useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useNotifications } from '@/app/notifications'
import { useWorkspace } from '@/app/store'
import { SOURCES, syncAll, syncOne, useSync } from '@/app/sync'
import { getLanguage, t } from '@/i18n'
import { Button, cx, IconButton, Popover } from '@/components/ui'
import { electronBridge } from '@/lib/vault'

/** Sync button: what was checked when (and with what result) – and sync everything now. */
export function SyncButton() {
  const ws = useWorkspace()
  const anchor = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const running = useSync((s) => s.running)
  const list = useNotifications((s) => s.list)
  const checks = list.filter((n) => n.kind === 'check')
  const [now, setNow] = useState(0)
  const [schedule, setSchedule] = useState<Record<string, number | null>>({})
  const inMinutes = (at: number | null | undefined) => {
    if (at === undefined) return ''
    if (at === null) return t('sync.manual')
    const min = Math.max(0, Math.round((at - now) / 60_000))
    return min < 60
      ? t('sync.nextIn', { count: min })
      : t('sync.nextAt', {
          time: new Date(at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
        })
  }
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const ago = (iso: string) => {
    const min = Math.round((now - Date.parse(iso)) / 60_000)
    if (min < 1) return t('sync.justNow')
    if (min < 60) return t('sync.minutesAgo', { count: min })
    return new Date(iso).toLocaleString(locale, { dateStyle: 'short', timeStyle: 'short' })
  }
  return (
    <>
      <IconButton
        ref={anchor}
        label={t('sync.title')}
        onClick={() => {
          setNow(Date.now())
          void electronBridge()
            ?.syncSchedule?.()
            .then(setSchedule)
            .catch(() => undefined)
          setOpen((v) => !v)
        }}
        active={open}
      >
        <RefreshCw size={18} className={cx(running && 'animate-spin')} />
      </IconButton>
      <Popover
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        label={t('sync.title')}
        className="w-80"
      >
        <div className="space-y-2 p-3">
          <p className="text-sm font-semibold">{t('sync.title')}</p>
          <ul aria-label={t('sync.last')} className="space-y-1.5">
            {SOURCES.map((source) => {
              const c = checks.find((x) => x.id === source.id)
              return (
                <li key={source.id} className="flex items-start gap-2 text-[13px]">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{t(source.label)}</span>
                      <span className="shrink-0 text-[12px] text-ink-3">
                        {c ? ago(c.time) : t('sync.neverShort')}
                      </span>
                    </span>
                    {c?.body && <span className="block truncate text-[12.5px] text-ink-2">{c.body}</span>}
                    {source.id in schedule && (
                      <span className="block text-[11.5px] text-ink-3">{inMinutes(schedule[source.id])}</span>
                    )}
                  </span>
                  <IconButton
                    size="sm"
                    label={t('sync.one', { name: t(source.label) })}
                    disabled={running}
                    onClick={() => void syncOne(ws, source.id)}
                  >
                    <RefreshCw size={13} />
                  </IconButton>
                </li>
              )
            })}
          </ul>
          <Button
            variant="primary"
            size="sm"
            disabled={running}
            onClick={() => void syncAll(ws)}
            className="w-full"
          >
            {running ? t('sync.running') : t('sync.now')}
          </Button>
        </div>
      </Popover>
    </>
  )
}
