import { review } from '@/app/review'
import { relogin } from '@/app/relogin'
import { courseIdsOf } from '@/lib/study/modules'
import { useEffect, useState } from 'react'
import {
  RefreshCw,
  Bell,
  BellRing,
  CalendarClock,
  CheckCheck,
  FileText,
  FileUp,
  Archive,
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
import { Button, cx, EmptyState, IconButton } from '@/components/ui'
import { loadMaterialMap } from '@/app/materials'
import { parseRoute } from '@/lib/route'
import { SidePanel } from '@/components/layout/SidePanel'

const ICONS: Record<NotificationKind, typeof Bell> = {
  deadline: CalendarClock,
  moved: CalendarClock,
  reminder: BellRing,
  material: FileUp,
  updated: FileText,
  notice: MessageSquare,
  grade: GraduationCap,
  aside: Archive,
  check: RefreshCw,
}

/** Colour per kind – a warning (sign in again, cancelled lecture) stands out in red. */
const COLORS: Record<NotificationKind, string> = {
  deadline: 'orange',
  moved: 'orange',
  reminder: 'yellow',
  material: 'green',
  updated: 'blue',
  notice: 'purple',
  grade: 'pink',
  aside: 'gray',
  check: 'gray',
}
export function notificationColor(n: AppNotification): string {
  if (
    n.target?.type === 'relogin' ||
    /^⚠|ausfall|fällt aus|abgesagt|bitte neu anmelden|fehler/i.test(`${n.title} ${n.body ?? ''}`)
  )
    return 'red'
  return COLORS[n.kind]
}

/** Opens what a notification is about: the Notiva page, the saved file, the course or the Moodle page. */
export async function openNotification(n: AppNotification, ws: Workspace): Promise<void> {
  void useNotifications.getState().markRead([n.id])
  const app = useApp.getState()
  // Imported Moodle deadlines open their Notiva task page.
  const moodleId = /^(?:deadline|moved|reminder):(event:\d+)/.exec(n.id)?.[1]
  const page = moodleId ? ws.all().find((p) => p.data.moodle === moodleId) : undefined
  if (page) return app.openEntry(page.path)
  const target = n.target
  if (!target) return
  if (target.type === 'relogin') return void relogin(target.service).catch(() => undefined)
  if (target.type === 'review') return void review(target.what, ws)
  if (target.type === 'page') return ws.get(target.path) ? app.openEntry(target.path) : undefined
  if (target.type === 'route') return app.navigate(parseRoute(target.hash))
  if (target.type === 'material') {
    const saved = (await loadMaterialMap(ws))[target.id]
    return app.navigate(saved ? { name: 'file', path: saved } : { name: 'moodle', course: target.courseId })
  }
  if (target.type === 'course') {
    // The module page that lists the course (older vaults: a page with `moodle:`).
    const coursePage = ws
      .all()
      .find((p) => courseIdsOf(p.data).includes(target.courseId) || p.data.moodle === target.courseId)
    return coursePage
      ? app.openEntry(coursePage.path)
      : app.navigate({ name: 'moodle', course: target.courseId })
  }
  openUrl(target.url)
}

/** Moodle pages open with the university login in an app window; anything else in the browser. */
function openUrl(url: string): void {
  const bridge = electronBridge()
  if (!bridge) {
    window.open(url, '_blank', 'noopener')
    return
  }
  void useMoodle
    .getState()
    .open(url, false)
    .catch(() => bridge.openExternal(url))
}

/** Label of the main action ("Zur Aufgabe", "Noten ansehen" …). */
function actionLabel(n: AppNotification): string {
  const target = n.target
  if (/^(?:deadline|moved|reminder):/.test(n.id)) return t('notify.open.task')
  if (!target) return t('notify.open.default')
  if (target.type === 'route')
    return target.hash.startsWith('#/grades') ? t('notify.open.grades') : t('notify.open.default')
  if (target.type === 'material') return t('notify.open.file')
  if (target.type === 'course') return t('notify.open.course')
  if (target.type === 'url') return t('notify.open.moodle')
  if (target.type === 'relogin') return t('notify.open.relogin')
  if (target.type === 'review') return t('notify.open.review')
  return t('notify.open.default')
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
  const [open, setOpen] = useState<string | null>(null)
  const unread = unreadCount(list)
  // Opened in "Ungelesen": it stays in the list (now read) so its details can be seen – until the
  // filter is switched.
  const [kept, setKept] = useState<Set<string>>(new Set())
  const shown = filter === 'unread' ? list.filter((n) => !n.read || kept.has(n.id)) : list
  const desktop = Boolean(electronBridge()?.notifications)

  useEffect(() => {
    void useNotifications.getState().load()
  }, [])

  const header = (
    <>
      <IconButton label={t('notify.markAll')} onClick={() => void markRead('all')} disabled={unread === 0}>
        <CheckCheck size={16} />
      </IconButton>
      <IconButton
        label={t('notify.settings')}
        onClick={() => navigate({ name: 'settings', section: 'checks' })}
      >
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
            onClick={() => {
              setFilter(f)
              setKept(new Set())
            }}
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
                    aria-expanded={open === n.id}
                    onClick={() => {
                      setOpen(open === n.id ? null : n.id)
                      if (!n.read) {
                        setKept((k) => new Set(k).add(n.id))
                        void markRead([n.id])
                      }
                    }}
                    className="flex w-full items-start gap-2.5 py-2.5 pr-3 pl-2.5 text-left hover:bg-hover"
                    style={{ borderLeft: `3px solid var(--opt-${notificationColor(n)}-ink)` }}
                    data-color={notificationColor(n)}
                  >
                    <span
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: `var(--opt-${notificationColor(n)})`,
                        color: `var(--opt-${notificationColor(n)}-ink)`,
                        opacity: n.read ? 0.7 : 1,
                      }}
                    >
                      <Icon size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span
                          className={cx(
                            'min-w-0 flex-1 text-sm',
                            open !== n.id && 'truncate',
                            !n.read && 'font-semibold',
                          )}
                        >
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
                        <span
                          className={cx(
                            'block text-[12.5px] whitespace-pre-line text-ink-2',
                            open !== n.id && 'line-clamp-2',
                          )}
                        >
                          {n.body}
                        </span>
                      )}
                    </span>
                    {!n.read && (
                      <span
                        aria-label={t('notify.new')}
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                      />
                    )}
                  </button>
                  {open === n.id && (n.target || /^(?:deadline|moved|reminder):/.test(n.id)) && (
                    <div className="flex flex-wrap gap-2 px-3 pb-2.5 pl-[2.6rem]">
                      <Button size="sm" variant="primary" onClick={() => void openNotification(n, ws)}>
                        {actionLabel(n)}
                      </Button>
                      {n.target?.type === 'course' && (
                        <Button
                          size="sm"
                          onClick={() =>
                            useApp.getState().navigate({
                              name: 'moodle',
                              course: (n.target as { courseId: string }).courseId,
                            })
                          }
                        >
                          {t('notify.open.moodle')}
                        </Button>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </SidePanel>
  )
}
