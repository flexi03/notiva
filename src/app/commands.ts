import { checkUpdatesNow } from '@/app/update'
import { syncExamPlan } from '@/app/examPlan'
import { useEcampus } from '@/app/ecampus'
import { useMoodle } from '@/app/moodle'
import { useApp } from '@/app/store'
import { setupHint } from '@/app/study'
import { syncAll } from '@/app/sync'
import { runUndo } from '@/app/undo'
import { forgetVault, openFolder } from '@/app/vaults'
import type { Workspace } from '@/lib/workspace'

/** Commands of the menu bar (desktop) and of shortcuts – one place, so both do the same. */
export const COMMANDS = [
  'settings',
  'newPage',
  'search',
  'today',
  'openFolder',
  'closeFolder',
  'save',
  'back',
  'forward',
  'toggleSidebar',
  'assistant',
  'git',
  'notifications',
  'shelf',
  'trash',
  'templates',
  'studyDashboard',
  'grades',
  'moodle',
  'fetchMoodle',
  'fetchEcampus',
  'syncStudy',
  'examPlan',
  'setupCheck',
  'checkUpdates',
  'syncAll',
  'semester',
  'undo',
  'redo',
] as const
export type CommandId = (typeof COMMANDS)[number]

export function runCommand(
  id: string,
  ws: Workspace,
  actions: { openToday(): Promise<unknown> },
  save: () => void,
): void {
  const app = useApp.getState()
  switch (id as CommandId) {
    case 'settings':
      // ⌘, : settings as side panel (full screen from there).
      return app.route.name === 'settings' ? undefined : app.toggleView('settings')
    case 'newPage':
      return app.setNewPage({ folder: '' })
    case 'search':
      return app.setSearch(true)
    case 'today':
      return void actions.openToday()
    case 'openFolder':
      return void openFolder().then((w) => w && void app.setWorkspace(w))
    case 'closeFolder':
      forgetVault()
      return void app.setWorkspace(null)
    case 'save':
      return save()
    case 'back':
      return history.back()
    case 'forward':
      return history.forward()
    case 'toggleSidebar':
      return app.setSidebar(!app.sidebarOpen)
    case 'assistant':
      return app.toggleView('assistant')
    case 'git':
      return app.toggleView('git')
    case 'notifications':
      return app.toggleView('notifications')
    case 'shelf':
      return app.toggleView('shelf')
    case 'trash':
      return app.navigate({ name: 'trash' })
    case 'templates':
      return app.navigate({ name: 'templates' })
    case 'studyDashboard': {
      const dash = ws.all().find((p) => p.data.studium) ?? ws.get('Studium.md')
      return dash
        ? app.navigate({ name: 'page', path: dash.path })
        : app.navigate({ name: 'settings', section: 'study' })
    }
    case 'grades':
      return app.navigate({ name: 'grades' })
    case 'moodle':
      return app.navigate({ name: 'moodle' })
    case 'fetchMoodle':
      return void useMoodle.getState().fetchNow()
    case 'fetchEcampus':
      return void useEcampus.getState().fetchNow()
    case 'syncStudy':
      return app.navigate({ name: 'settings', section: 'study' })
    case 'examPlan':
      return void syncExamPlan(ws).catch(() => undefined)
    case 'undo':
      return runUndo(false)
    case 'redo':
      return runUndo(true)
    case 'semester':
      return app.navigate({ name: 'semester' })
    case 'syncAll':
      return void syncAll(ws)
    case 'setupCheck':
      return void setupHint(ws)
    case 'checkUpdates':
      return void checkUpdatesNow()
  }
}
