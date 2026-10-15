import { Bot, ExternalLink, School } from 'lucide-react'
import { useAssistant } from '@/app/assistant'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { findStudyDashboard } from '@/lib/study/sync'
import { ISSUES_URL } from '@/lib/university'
import { electronBridge } from '@/lib/vault'
import { Button } from '@/components/ui'

/**
 * "Andere Hochschule?" – the three ways to make Notiva work elsewhere: the profile page, the
 * assistant (it can fill the page in) or an issue on GitHub so it gets built in.
 */
export function OtherUniversity({ what }: { what: 'study' | 'moodle' | 'ecampus' }) {
  const ws = useWorkspace()
  const dash = findStudyDashboard(ws)
  const profile = dash ? `${dash.folder}/Hochschule.md` : null
  const openIssue = () => {
    const bridge = electronBridge()
    if (bridge) void bridge.openExternal(ISSUES_URL)
    else window.open(ISSUES_URL, '_blank', 'noopener')
  }
  return (
    <div className="space-y-2 rounded-panel border border-line bg-sunken p-3 text-[13px]">
      <p className="font-semibold">{t('uni.other')}</p>
      <p className="text-ink-2">{t(`uni.other.${what}`)}</p>
      <div className="flex flex-wrap gap-2">
        {profile && ws.get(profile) && (
          <Button
            size="sm"
            icon={<School size={14} />}
            onClick={() => useApp.getState().navigate({ name: 'page', path: profile })}
          >
            {t('uni.openProfile')}
          </Button>
        )}
        <Button
          size="sm"
          icon={<Bot size={14} />}
          onClick={() => {
            useAssistant.getState().setDraft(t('uni.aiDraft'))
            useApp.getState().openView('assistant')
          }}
        >
          {t('uni.askAi')}
        </Button>
        <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={openIssue}>
          {t('uni.issue')}
        </Button>
      </div>
    </div>
  )
}
