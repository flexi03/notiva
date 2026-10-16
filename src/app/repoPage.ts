import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/**
 * The Notiva page of a repository in a lab folder: "<lab>/<name>.md" owns the folder "<lab>/<name>/"
 * – its description on top (for GitLab snippets from the API: git only has the files), the files
 * below (see RepoFiles), the link to the project. Created once; returns its path.
 */
export async function ensureRepoPage(
  ws: Workspace,
  target: string,
  cloneUrl: string,
  link: string,
  title = '',
): Promise<string> {
  const path = `${target}.md`
  await ignoreInVault(ws, target)
  if (ws.get(path)) return path
  const info = await electronBridge()
    ?.code?.snippetInfo?.(cloneUrl)
    .catch(() => null)
  const meta = info && !('error' in info) ? info : null
  const description = meta?.description?.trim()
  const body = description
    ? `${description}\n`
    : info && 'error' in info
      ? `> [!info] ${t('repo.noDescriptionScope')}\n`
      : ''
  const name = target.slice(target.lastIndexOf('/') + 1)
  const heading = meta?.title || (title && !/^https?:/i.test(title) ? title : name)
  await ws.createPage({
    folder: target.slice(0, target.lastIndexOf('/')),
    title: name,
    data: {
      icon: '📦',
      repo: cloneUrl,
      link: meta?.webUrl || link,
      ...(heading !== name ? { title: heading } : {}),
    },
    body,
  })
  await ws.reload()
  return path
}

/**
 * A got repository has its own Git history: the vault's repository ignores it (".gitignore" of the
 * lab folder) – otherwise it shows as one changed folder without content in "Änderungen".
 */
export async function ignoreInVault(ws: Workspace, target: string): Promise<void> {
  const lab = target.slice(0, target.lastIndexOf('/'))
  const name = target.slice(target.lastIndexOf('/') + 1)
  const file = `${lab}/.gitignore`
  const current = await ws.vault.read(file).catch(() => '')
  const line = `/${name}/`
  if (current.split(/\r?\n/).some((l) => l.trim() === line)) return
  await ws.writeFile(
    file,
    `${current.trimEnd()}${current.trim() ? '\n' : ''}# ${t('repo.ignoreComment')}\n${line}\n`,
  )
  void import('@/app/git').then((m) => m.useGit.getState().refresh?.()).catch(() => undefined)
}
