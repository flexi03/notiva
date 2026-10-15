import { Maximize2, Trash2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { IconButton } from '@/components/ui'
import { TrashContent } from '@/screens/TrashScreen'
import { SidePanel } from './SidePanel'

/** Trash as a side panel – "Ganz öffnen" shows it as a full screen. */
export function TrashPanel() {
  return (
    <SidePanel
      view="trash"
      title={t('trash.title')}
      icon={<Trash2 size={16} />}
      actions={
        <IconButton
          label={t('settings.openFull')}
          onClick={() => {
            const app = useApp.getState()
            app.closeView('trash')
            app.navigate({ name: 'trash' })
          }}
        >
          <Maximize2 size={15} />
        </IconButton>
      }
    >
      <div className="min-h-0 flex-1 overflow-y-auto [&>div]:!px-3 [&>div]:!py-3">
        <TrashContent compact />
      </div>
    </SidePanel>
  )
}
