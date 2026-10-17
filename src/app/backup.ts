import { withProgress } from '@/app/progress'
import { t } from '@/i18n'
import { electronBridge, type BackupSnapshot } from '@/lib/vault'

/**
 * Daily backup of the folder (desktop app): the main process copies, this shows the progress and
 * decides when – once a day, checked at start and every hour.
 */
const DAY = 86_400_000

export function runBackup(): Promise<BackupSnapshot> {
  const backup = electronBridge()?.backup
  if (!backup) return Promise.reject(new Error(t('backup.desktopOnly')))
  return withProgress(
    t('backup.running'),
    async (task) => {
      const off = backup.onProgress((e) => task.update(e.done, e.total, e.file))
      try {
        return await backup.run()
      } finally {
        off()
      }
    },
    {
      success: (s) => t('backup.done', { files: s.files }),
      action: (s) => ({ label: t('backup.show'), run: () => void backup.show(s.name) }),
    },
  )
}

/** Makes today's backup if it is switched on and the last one is a day old (or there is none). */
export async function backupIfDue(now = Date.now()): Promise<boolean> {
  const backup = electronBridge()?.backup
  if (!backup) return false
  const status = await backup.status()
  if (!status.settings.enabled || !status.root || status.running) return false
  const last = status.snapshots[0]
  if (last && now - Date.parse(last.date) < DAY) return false
  await runBackup()
  return true
}
