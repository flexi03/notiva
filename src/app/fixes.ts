import { announce } from '@/app/progress'
import { useApp } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { cleanMessage, explainError, type FixKind } from '@/lib/errors'
import { electronBridge } from '@/lib/vault'

/** The button for a fix: label and what it does. `retry` repeats the failed action. */
export function fixAction(fix: FixKind, retry?: () => void): { label: string; run: () => void } | undefined {
  const app = useApp.getState()
  const bridge = electronBridge()
  switch (fix) {
    case 'installGit':
      if (!bridge?.git?.install) return undefined
      return { label: t('fix.installGit'), run: () => void installGit() }
    case 'gitIdentity':
      if (!bridge?.git?.setIdentity) return undefined
      return { label: t('fix.gitIdentity'), run: () => void gitIdentity(retry) }
    case 'gitInit':
      if (!bridge?.git) return undefined
      return {
        label: t('fix.gitInit'),
        run: () =>
          void bridge.git!.init().then(() => import('@/app/git').then((m) => m.useGit.getState().refresh())),
      }
    case 'gitPull':
      if (!bridge?.git) return undefined
      return {
        label: t('fix.gitPull'),
        run: () => void import('@/app/git').then((m) => m.useGit.getState().act((git) => git.pull())),
      }
    case 'connectStudy':
      return { label: t('fix.connectStudy'), run: () => app.navigate({ name: 'settings', section: 'study' }) }
    case 'aiSettings':
      return { label: t('fix.aiSettings'), run: () => app.navigate({ name: 'settings', section: 'ai' }) }
    case 'notificationSettings':
      if (!bridge?.notifications?.openSystemSettings) return undefined
      return {
        label: t('fix.notificationSettings'),
        run: () => void bridge.notifications!.openSystemSettings!(),
      }
    case 'chooseFolder':
      return { label: t('fix.chooseFolder'), run: () => void app.setWorkspace(null) }
    case 'restart':
      if (!bridge?.restart) return undefined
      return { label: t('fix.restart'), run: () => void bridge.restart!() }
    case 'retry':
      return retry ? { label: t('fix.retry'), run: retry } : undefined
  }
}

/** Reason and fix button for an error – for progress messages and toasts. */
export function explain(
  error: unknown,
  retry?: () => void,
): { message: string; note?: string; action?: { label: string; run: () => void } } {
  const message = cleanMessage(error instanceof Error ? error.message : String(error))
  const known = explainError(error, getLanguage() === 'de' ? 'de' : 'en')
  if (!known) return { message, ...(retry ? { action: { label: t('fix.retry'), run: retry } } : {}) }
  const action = known.fix ? fixAction(known.fix, retry) : undefined
  // The technical message stays visible below (helps with an issue on GitHub).
  return {
    message: known.reason,
    ...(message && message !== known.reason ? { note: message.slice(0, 300) } : {}),
    ...(action ? { action } : {}),
  }
}

/** Shows an error with its reason and fix (bottom left). */
export function reportError(error: unknown, retry?: () => void): void {
  const { message, note, action } = explain(error, retry)
  announce(message, { state: 'info', sticky: true, ...(note ? { note } : {}), ...(action ? { action } : {}) })
}

async function installGit(): Promise<void> {
  const result = await electronBridge()!.git!.install!()
  announce(t(result === 'installing' ? 'fix.gitInstalling' : 'fix.gitDownload'), {
    state: 'info',
    sticky: true,
    key: 'fix-git',
    note: t('fix.gitAfter'),
    ...(electronBridge()?.restart
      ? { action: { label: t('fix.restart'), run: () => void electronBridge()!.restart!() } }
      : {}),
  })
}

async function gitIdentity(retry?: () => void): Promise<void> {
  const ask = useApp.getState().ask
  const name = await ask({
    title: t('fix.gitName'),
    label: t('fix.gitNameLabel'),
    confirmLabel: t('common.next'),
  })
  if (!name?.trim()) return
  const email = await ask({
    title: t('fix.gitEmail'),
    label: t('fix.gitEmailLabel'),
    confirmLabel: t('common.save'),
  })
  if (!email?.trim()) return
  try {
    await electronBridge()!.git!.setIdentity!(name.trim(), email.trim())
    announce(t('fix.gitIdentityDone'), retry ? { action: { label: t('fix.retry'), run: retry } } : {})
  } catch (e) {
    reportError(e)
  }
}
