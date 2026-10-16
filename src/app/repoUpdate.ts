import { showLoginHint } from '@/app/clone'
import { announce, useProgress, withProgress } from '@/app/progress'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/**
 * "Aktualisieren" of a got repository: asks the server what is new (git fetch), shows it – new
 * commits, changed files, a changed snippet description – and only takes it over after "Übernehmen".
 * Own changes in the folder are named; nothing of them is overwritten (fast-forward only).
 */
export async function updateRepo(ws: Workspace, folder: string): Promise<boolean> {
  const code = electronBridge()?.code
  if (!code?.repoFetch || !code.repoPull) return false
  const name = folder.slice(folder.lastIndexOf('/') + 1)
  const label = t('repo.checking', { name })
  let update: Awaited<ReturnType<NonNullable<typeof code.repoFetch>>>
  try {
    update = await withProgress(label, () => code.repoFetch!(folder))
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const remote = (await code.clones?.(folder.slice(0, folder.lastIndexOf('/'))))?.find(
      (c) => c.name === name,
    )?.remote
    if (/LOGIN:/.test(message) && remote) {
      useProgress.setState((s) => ({
        tasks: s.tasks.filter((x) => !(x.state === 'error' && x.label === label)),
      }))
      await showLoginHint(remote, () => void updateRepo(ws, folder))
    }
    return false
  }
  // The snippet's description (API) – changed on the server?
  const { fetchRepoInfo, storeRepoInfo, useRepoInfo } = await import('@/app/repoInfo')
  const fresh = await fetchRepoInfo(update.remote)
  const known = useRepoInfo.getState()[update.remote]
  const descriptionChanged = !!fresh?.hash && fresh.hash !== known?.hash
  if (!update.commits.length && !descriptionChanged) {
    announce(t('repo.upToDate', { name }))
    return false
  }
  const lines = [
    ...update.commits.slice(0, 8).map((c) => `• ${c.date} ${c.subject}`),
    ...(update.commits.length > 8 ? [t('repo.moreCommits', { count: update.commits.length - 8 })] : []),
    ...(update.files.length
      ? [
          `${t('repo.changedFiles')}: ${update.files.slice(0, 8).join(', ')}${update.files.length > 8 ? ' …' : ''}`,
        ]
      : []),
    ...(descriptionChanged ? [t('repo.descriptionChanged')] : []),
    ...(update.dirty.length ? [t('repo.dirty', { files: update.dirty.slice(0, 5).join(', ') })] : []),
  ]
  const ok = await useApp.getState().ask({
    title: update.commits.length
      ? t('repo.newChanges', { count: update.commits.length, name })
      : t('repo.newDescription', { name }),
    label: lines.join('\n'),
    confirmLabel: t('repo.apply'),
    confirm: true,
  })
  if (ok === null) return false
  await withProgress(
    t('repo.applying', { name }),
    async () => {
      if (update.commits.length) {
        try {
          await code.repoPull!(folder)
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e)
          throw new Error(/CONFLICT:/.test(message) ? t('repo.conflict') : message, { cause: e })
        }
      }
      if (descriptionChanged && fresh) await storeRepoInfo(ws, update.remote, fresh)
      await ws.reload()
    },
    { success: () => t('repo.applied', { name }) },
  )
  return true
}
