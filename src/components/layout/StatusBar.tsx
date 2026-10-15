import { useEffect, useState } from 'react'
import { Bug, CircleHelp, Info, Lightbulb } from 'lucide-react'
import { useNotifications } from '@/app/notifications'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { EventBadge } from './EventBadge'
import { ProgressHost, ProgressSummary } from './ProgressHost'
import { ToastLine } from './Toast'

const ISSUE_URL = 'https://github.com/flexi03/notiva/issues/new'

/**
 * The bar at the bottom (like VS Code): the next session on the left; help, version, info and
 * "report a problem" on the right. Never covers content – it has its own row.
 */
export function StatusBar() {
  const navigate = useApp((s) => s.navigate)
  // Open suggestions (study, timetable, materials) wait in the notifications – counted here.
  const suggestions = useNotifications(
    (s) => s.list.filter((n) => n.target?.type === 'review' && !n.read).length,
  )
  const [version, setVersion] = useState<string | null>(
    typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : null,
  )
  useEffect(() => {
    void electronBridge()
      ?.update?.status()
      .then((s) => setVersion(s.version))
      .catch(() => undefined)
  }, [])
  const open = (url: string) => {
    const bridge = electronBridge()
    if (bridge) void bridge.openExternal(url)
    else window.open(url, '_blank', 'noopener')
  }
  const item =
    'inline-flex h-full items-center gap-1 rounded-control px-1.5 text-ink-2 hover:bg-hover hover:text-ink'
  return (
    <footer
      aria-label={t('status.bar')}
      className="no-print relative flex h-7 shrink-0 items-center gap-2 border-t border-line bg-sunken px-2 text-[12px]"
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <EventBadge inline />
      </div>
      <ToastLine />
      <ProgressSummary />
      {suggestions > 0 && (
        <button
          type="button"
          className={`${item} font-semibold text-accent`}
          onClick={() => useApp.getState().openView('notifications')}
          title={t('status.suggestionsHint')}
        >
          <Lightbulb size={13} /> {t('status.suggestions', { count: suggestions })}
        </button>
      )}
      <button
        type="button"
        className={item}
        onClick={() => navigate({ name: 'help' })}
        title={t('help.open')}
      >
        <CircleHelp size={13} /> {t('nav.help')}
      </button>
      <button
        type="button"
        className={item}
        onClick={() => navigate({ name: 'settings', section: 'about' })}
        title={t('settings.tab.about')}
      >
        <Info size={13} /> {version ? `v${version}` : 'Notiva'}
      </button>
      <button
        type="button"
        className={item}
        onClick={() => open(ISSUE_URL)}
        title={t('settings.reportIssue')}
      >
        <Bug size={13} /> <span className="max-[700px]:hidden">{t('settings.reportIssue')}</span>
      </button>
      <ProgressHost />
    </footer>
  )
}
