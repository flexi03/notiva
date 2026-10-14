import { useState } from 'react'
import { syncExamPlan } from '@/app/examPlan'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { programById } from '@/lib/study/catalog'
import { findStudyDashboard } from '@/lib/study/sync'
import { electronBridge } from '@/lib/vault'
import { Button, Switch } from '@/components/ui'
import { Row } from '@/screens/settingsLayout'
import { StudySyncDialog } from './StudySyncDialog'

/** Settings → Studium: degree and first semester, automatic updates, exam plan. */
export function StudySettingsSection() {
  const ws = useWorkspace()
  const run = useAction()
  const autoSync = useApp((s) => s.settings.studyAutoSync)
  const [open, setOpen] = useState(false)
  const dash = findStudyDashboard(ws)
  const program = programById(dash?.setup?.program)
  return (
    <>
      <p className="text-sm" role="status">
        {!dash
          ? t('study.noFolder')
          : program && dash.setup
            ? t('study.current', {
                program: `${program.title} (${program.degree}) · ${program.university} · PO ${program.po}`,
                start: dash.setup.start,
                folder: dash.folder,
              })
            : t('study.notSet')}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!dash} onClick={() => setOpen(true)}>
          {t('study.sync')}
        </Button>
        {electronBridge()?.examPlan && (
          <Button disabled={!program} onClick={() => void run(() => syncExamPlan(ws))}>
            {t('examPlan.check')}
          </Button>
        )}
      </div>
      <Row label={t('study.autoSync')} hint={t('study.autoSyncHint')}>
        <Switch
          checked={autoSync}
          onChange={(v) => useApp.getState().updateSettings({ studyAutoSync: v })}
          label={t('study.autoSync')}
        />
      </Row>
      {open && <StudySyncDialog onClose={() => setOpen(false)} />}
    </>
  )
}
