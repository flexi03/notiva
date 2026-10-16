import { announce, useProgress, withProgress } from '@/app/progress'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { repoUrl } from '@/lib/gitUrl'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** The lab's code folder of a module page (the first `code: true` page below it), if any. */
export function labFolderOf(ws: Workspace, modulePath: string): string | null {
  const base = modulePath.slice(0, -3)
  const lab = ws.all().find((p) => p.data.code === true && p.path.startsWith(`${base}/`))
  return lab ? lab.path.slice(0, -3) : null
}

/**
 * "Repository ins Praktikum holen": asks first, then git clone into "<Praktikum>/<Projekt>" with a
 * progress bar. When the server wants a login, the fix is the clone in the Terminal (git asks for
 * user name and token there, the keychain keeps them).
 */
export async function cloneIntoLab(
  ws: Workspace,
  link: string,
  folder: string,
  /** found otherwise (e.g. by the local model) */
  given?: { url: string; name: string } | null,
): Promise<string | null> {
  const code = electronBridge()?.code
  const repo = given ?? repoUrl(link)
  if (!code?.clone || !repo) return null
  let name = repo.name
  for (let i = 2; ws.assets().some((f) => f.path.startsWith(`${folder}/${name}/`)); i++)
    name = `${repo.name}-${i}`
  const target = `${folder}/${name}`
  const ok = await useApp.getState().ask({
    title: t('clone.ask', { name: repo.name }),
    label: t('clone.askNote', { url: repo.url, folder: target }),
    confirmLabel: t('clone.confirm'),
  })
  if (ok === null) return null
  const label = t('clone.running', { name: repo.name })
  try {
    await withProgress(
      label,
      async (task) => {
        const off = code.onCloneProgress?.((p) => task.update(p, 100))
        try {
          await code.clone!(repo.url, target)
        } finally {
          off?.()
        }
        await ws.reload()
      },
      { total: 100, success: () => t('clone.done', { name: repo.name, folder: target }) },
    )
    return target
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (
      !/auth|credential|username|password|403|401|could not read|terminal prompts disabled|access denied|repository .*not found/i.test(
        message,
      )
    )
      return null
    // Login needed: replace the raw error with the reason and the one-click fix.
    useProgress.setState((s) => ({
      tasks: s.tasks.filter((x) => !(x.state === 'error' && x.label === label)),
    }))
    announce(t('clone.login'), {
      state: 'info',
      sticky: true,
      open: true,
      note: t('clone.loginNote'),
      ...(code.cloneInTerminal
        ? {
            action: {
              label: t('clone.inTerminal'),
              run: () => void code.cloneInTerminal!(repo.url, target).catch(() => undefined),
            },
          }
        : {}),
    })
    return null
  }
}
