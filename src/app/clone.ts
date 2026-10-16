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

/** "Praktikum 1 - SQL Wiederholung" → "praktikum-1-sql-wiederholung" (folder name for snippets). */
function slug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * "Repository ins Praktikum holen": asks first, then git clone into "<Praktikum>/<Projekt>" with a
 * progress bar. Private projects (ProjectBase sends git to its sign-in page): the fix is an access
 * token, stored encrypted per server – then it tries again by itself.
 */
export async function cloneIntoLab(
  ws: Workspace,
  link: string,
  folder: string,
  /** found otherwise (e.g. by the local model) */
  given?: { url: string; name: string } | null,
  /** the link's title – names snippets ("snippet-41" says nothing) */
  title = '',
): Promise<string | null> {
  const code = electronBridge()?.code
  const repo = given ?? repoUrl(link)
  if (!code?.clone || !repo) return null
  // Own links have the address as title – that is no name.
  const titled = title && !/^https?:/i.test(title) ? slug(title) : ''
  const base = repo.name.startsWith('snippet-') && titled ? titled : repo.name
  const taken = (n: string) => ws.assets().some((f) => f.path.startsWith(`${folder}/${n}/`))
  let suggestion = base
  for (let i = 2; taken(suggestion); i++) suggestion = `${base}-${i}`
  // The folder name – suggested, the user may change it.
  const typed = await useApp.getState().ask({
    title: t('clone.ask', { name: titled ? title : base }),
    label: t('clone.askNote', { url: repo.url, folder }),
    initial: suggestion,
    confirmLabel: t('clone.confirm'),
  })
  const name = typed
    ?.trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/^\.+/, '')
  if (!name) return null
  if (taken(name)) {
    announce(t('clone.exists', { name }), { state: 'info' })
    return null
  }
  return runClone(ws, repo.url, `${folder}/${name}`, name)
}

async function runClone(ws: Workspace, url: string, target: string, name: string): Promise<string | null> {
  const code = electronBridge()!.code!
  const label = t('clone.running', { name })
  try {
    await withProgress(
      label,
      async (task) => {
        const off = code.onCloneProgress?.((p) => task.update(p, 100))
        try {
          await code.clone!(url, target)
        } finally {
          off?.()
        }
        await ws.reload()
      },
      {
        total: 100,
        success: () => t('clone.done', { name, folder: target }),
        action: () => ({
          label: t('clone.openEditor'),
          run: () => void electronBridge()?.code?.open(target, 'editor'),
        }),
      },
    )
    // The buttons next to the link now say "Im Praktikum öffnen".
    void import('@/app/clones').then((m) => m.loadClones(target.slice(0, target.lastIndexOf('/'))))
    return target
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    if (!/LOGIN:/.test(message)) return null
    // Login needed: the reason and the one-click fix instead of git's message.
    useProgress.setState((s) => ({
      tasks: s.tasks.filter((x) => !(x.state === 'error' && x.label === label)),
    }))
    const host = new URL(url).host
    const had = await code.hasToken?.(host)
    announce(had ? t('clone.tokenRejected', { host }) : t('clone.login', { host }), {
      state: 'info',
      sticky: true,
      open: true,
      note: t('clone.loginNote'),
      key: `clone-login:${url}`,
      ...(code.setToken
        ? {
            action: {
              label: t('clone.enterToken'),
              run: () =>
                void enterToken(url).then((saved) => (saved ? runClone(ws, url, target, name) : null)),
            },
          }
        : {}),
    })
    return null
  }
}

/**
 * Asks for an access token of the Git server (with the page to create one, scope prefilled) and
 * stores it encrypted in the main process. Resolves whether one was saved.
 */
async function enterToken(url: string): Promise<boolean> {
  const code = electronBridge()?.code
  if (!code?.setToken) return false
  const { origin, host } = new URL(url)
  const page = `${origin}/-/user_settings/personal_access_tokens?name=Notiva&scopes=read_repository`
  const token = await useApp.getState().ask({
    title: t('clone.tokenTitle', { host }),
    label: t('clone.tokenLabel'),
    confirmLabel: t('clone.tokenSave'),
    secret: true,
    help: { label: t('clone.tokenCreate'), run: () => void electronBridge()?.openExternal(page) },
  })
  if (!token?.trim()) return false
  const saved = await code.setToken(host, token.trim())
  if (!saved) announce(t('clone.tokenNotStored'), { state: 'info' })
  return true
}
