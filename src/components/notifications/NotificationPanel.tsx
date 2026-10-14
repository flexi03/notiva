import { useEffect, useState } from 'react'
import {
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  FileText,
  FileUp,
  GraduationCap,
  MessageSquare,
  Settings2,
} from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { unreadCount, useNotifications } from '@/app/notifications'
import { useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import type { AppNotification, NotificationKind } from '@/lib/notifications'
import type { Workspace } from '@/lib/workspace'
import { electronBridge } from '@/lib/vault'
import { cx, EmptyState, IconButton } from '@/components/ui'
import { SidePanel } from '@/components/layout/SidePanel'

const ICONS: Record<NotificationKind, typeof Bell> = {
  deadline: CalendarClock,
  moved: CalendarClock,
  reminder: BellRing,
  material: FileUp,
  updated: FileText,
  notice: MessageSquare,
  grade: GraduationCap,
}

/** Opens what a notification is about: the Notiva page, the material or the Moodle page. */
export function openNotification(n: AppNotification, ws: Workspace): void {
  void useNotifications.getState().markRead([n.id])
  const app = useApp.getState()
  // Imported Moodle deadlines open their Notiva task page.
  const moodleId = /^(?:deadline|moved|reminder):(event:\d+)/.exec(n.id)?.[1]
  const page = moodleId ? ws.all().find((p) => p.data.moodle === moodleId) : undefined
  if (page) return app.openEntry(page.path)
  const target = n.target
  if (!target) return
  if (target.type === 'page') return ws.get(target.path) ? app.openEntry(target.path) : undefined
  if (target.type === 'material') return app.navigate({ name: 'moodle' })
  // Moodle pages open with the university login in an app window; anything else in the browser.
  const bridge = electronBridge()
  if (!bridge) {
    window.open(target.url, '_blank', 'noopener')
    return
  }
  void useMoodle
    .getState()
    .open(target.url, false)
    .catch(() => bridge.openExternal(target.url))
}

function when(iso: string): string {
  const date = new Date(iso)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const today = new Date().toDateString() === date.toDateString()
  return today
    ? date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
}

/** The notification center: news from Moodle and reminders, newest first. */
export function NotificationPanel() {
  const ws = useWorkspace()
  const { list, markRead, clear } = useNotifications()
  const navigate = useApp((s) => s.navigate)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const unread = unreadCount(list)
  const shown = filter === 'unread' ? list.filter((n) => !n.read) : list
  const desktop = Boolean(electronBridge()?.notifications)

  useEffect(() => {
    void useNotifications.getState().load()
  }, [])

  const header = (
    <>
      <IconButton label={t('notify.markAll')} onClick={() => void markRead('all')} disabled={unread === 0}>
        <CheckCheck size={16} />
      </IconButton>
      <IconButton label={t('notify.settings')} onClick={() => navigate({ name: 'settings' })}>
        <Settings2 size={16} />
      </IconButton>
    </>
  )

  return (
    <SidePanel view="notifications" title={t('notify.title')} icon={<Bell size={16} />} actions={header}>
      <div className="flex items-center gap-1 border-b border-line px-3 py-2 text-[13px]">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={cx(
              'rounded-full px-2.5 py-0.5 hover:bg-hover',
              filter === f ? 'bg-hover font-semibold text-ink' : 'text-ink-2',
            )}
          >
            {f === 'all' ? t('notify.all') : t('notify.unread', { count: unread })}
          </button>
        ))}
        <span className="flex-1" />
        {list.length > 0 && (
          <button type="button" className="text-ink-3 hover:text-ink" onClick={() => void clear()}>
            {t('notify.clear')}
          </button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 ? (
          <EmptyState icon={<Bell size={26} />} title={t('notify.empty')}>
            {desktop ? t('notify.emptyHint') : t('notify.browserHint')}
          </EmptyState>
        ) : (
          <ul aria-label={t('notify.title')} className="divide-y divide-line">
            {shown.map((n) => {
              const Icon = ICONS[n.kind]
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n, ws)}
                    className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-hover"
                  >
                    <span className={cx('mt-0.5 shrink-0', n.read ? 'text-ink-3' : 'text-accent')}>
                      <Icon size={16} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className={cx('min-w-0 flex-1 truncate text-sm', !n.read && 'font-semibold')}>
                          <span className="sr-only">{t(`notify.kind.${n.kind}`)}: </span>
                          {n.title}
                        </span>
                        <span className="shrink-0 text-[11.5px] text-ink-3 tabular-nums">{when(n.time)}</span>
                      </span>
                      <span className="block text-[12.5px] text-ink-3">
                        {t(`notify.kind.${n.kind}`)}
                        {n.course && ` · ${n.course}`}
                      </span>
                      {n.body && (
                        <span className="line-clamp-2 block text-[12.5px] text-ink-2">{n.body}</span>
                      )}
                    </span>
                    {!n.read && (
                      <span
                        aria-label={t('notify.new')}
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                      />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </SidePanel>
  )
}
