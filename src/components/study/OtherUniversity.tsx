import type { ReactNode } from 'react'
import { Bot, ExternalLink, FileText, School } from 'lucide-react'
import { useAssistant } from '@/app/assistant'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { findStudyDashboard } from '@/lib/study/sync'
import { ISSUES_URL } from '@/lib/university'
import { electronBridge } from '@/lib/vault'

/**
 * "Andere Hochschule?" – the three ways to make Notiva work elsewhere: the profile page, the
 * assistant (it fills the page in) or an issue on GitHub so it gets built in. `onLeave` closes the
 * surrounding dialog before the assistant or the page opens.
 */
export function OtherUniversity({
  what,
  onLeave,
}: {
  what: 'study' | 'moodle' | 'ecampus'
  onLeave?: () => void
}) {
  const ws = useWorkspace()
  const dash = findStudyDashboard(ws)
  const profile = dash && ws.get(`${dash.folder}/Hochschule.md`) ? `${dash.folder}/Hochschule.md` : null
  const leave = (then: () => void) => {
    onLeave?.()
    then()
  }
  const openIssue = () => {
    const bridge = electronBridge()
    if (bridge) void bridge.openExternal(ISSUES_URL)
    else window.open(ISSUES_URL, '_blank', 'noopener')
  }
  return (
    <aside aria-label={t('uni.other')} className="flex gap-3 rounded-panel bg-sunken px-3 py-2.5 text-[13px]">
      <School size={18} className="mt-0.5 shrink-0 text-ink-3" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{t('uni.other')}</p>
        <p className="text-ink-2">{t(`uni.other.${what}`)}</p>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
          {profile && (
            <LinkButton
              icon={<FileText size={13} />}
              onClick={() => leave(() => useApp.getState().navigate({ name: 'page', path: profile }))}
            >
              {t('uni.openProfile')}
            </LinkButton>
          )}
          <LinkButton
            icon={<Bot size={13} />}
            onClick={() =>
              leave(() => {
                useAssistant.getState().setDraft(t('uni.aiDraft'))
                useApp.getState().openView('assistant')
              })
            }
          >
            {t('uni.askAi')}
          </LinkButton>
          <LinkButton icon={<ExternalLink size={13} />} onClick={openIssue}>
            {t('uni.issue')}
          </LinkButton>
        </div>
      </div>
    </aside>
  )
}

function LinkButton({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
    >
      {icon}
      {children}
    </button>
  )
}
