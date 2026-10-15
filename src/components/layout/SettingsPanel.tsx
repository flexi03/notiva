import { Maximize2, Settings } from 'lucide-react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { IconButton } from '@/components/ui'
import { SettingsContent } from '@/screens/SettingsScreen'
import { SidePanel } from './SidePanel'

/** Settings first as a side panel – "Ganz öffnen" shows them as a full screen. */
export function SettingsPanel() {
  return (
    <SidePanel
      view="settings"
      title={t('settings.title')}
      icon={<Settings size={16} />}
      actions={
        <IconButton
          label={t('settings.openFull')}
          onClick={() => {
            const app = useApp.getState()
            app.closeView('settings')
            app.navigate({ name: 'settings' })
          }}
        >
          <Maximize2 size={15} />
        </IconButton>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SettingsContent compact />
      </div>
    </SidePanel>
  )
}
