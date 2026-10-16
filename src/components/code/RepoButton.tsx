import { useEffect } from 'react'
import { FolderOpen, GitBranch } from 'lucide-react'
import { cloneIntoLab, labFolderOf } from '@/app/clone'
import { labFoldersOf, loadClones, sameRepo, useClones } from '@/app/clones'
import { useRepo } from '@/app/repoDetect'
import { ensureHub, hubName, hubsOf, linkRepoToSession } from '@/app/labHubs'
import { labNumber } from '@/app/labLinks'
import type { Workspace } from '@/lib/workspace'
import { ensureRepoPage } from '@/app/repoPage'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { Button } from '@/components/ui'
import { createCodeFolder } from './CodeFolder'

/**
 * "Repository ins Praktikum holen" right next to a link that is a Git repository (known pattern, or
 * the local model said so) – or, when it is already there, "Im Praktikum öffnen". `folder`: the lab
 * folder; else `module`: its lab folders (a new one "Praktikum" when there is none yet).
 */
export function RepoButton({
  link,
  title = '',
  folder,
  module,
}: {
  link: string
  title?: string
  folder?: string
  module?: string
}) {
  const ws = useWorkspace()
  const run = useAction()
  const repo = useRepo(link, title)
  const navigate = useApp((s) => s.navigate)
  const baseLabs = folder ? [folder] : module ? labFoldersOf(ws, module) : []
  // Sessions (P01 …) inside the labs hold repositories too.
  const labs = [
    ...baseLabs,
    ...baseLabs.flatMap((l) => [...hubsOf(ws, l).values()].map((h) => h.path.slice(0, -3))),
  ]
  const key = labs.join('|')
  const clones = useClones()
  useEffect(() => {
    for (const lab of key ? key.split('|') : []) if (!useClones.getState()[lab]) void loadClones(lab)
  }, [key])
  if (!repo || !electronBridge()?.code?.clone) return null
  const found = labs
    .flatMap((lab) => (clones[lab] ?? []).map((c) => ({ lab, ...c })))
    .find((c) => sameRepo(c.remote, repo.url))
  if (found)
    return (
      <Button
        size="sm"
        variant="ghost"
        icon={<FolderOpen size={13} />}
        title={`${found.lab}/${found.name}`}
        onClick={() =>
          void run(async () => {
            // Its page in the app: description, files (also for repositories got before).
            const page = await ensureRepoPage(ws, `${found.lab}/${found.name}`, repo.url, link, title)
            navigate({ name: 'page', path: page })
          })
        }
      >
        {t('clone.openLab', { name: found.name })}
      </Button>
    )
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<GitBranch size={13} />}
      title={repo.url}
      onClick={() =>
        void run(async () => {
          // A course without module: say how to get a lab folder.
          if (!folder && !module) return useApp.getState().showToast(t('clone.noModule'))
          const lab =
            folder ??
            labFolderOf(ws, module!) ??
            (await createCodeFolder(ws, module!, 'Praktikum')).slice(0, -3)
          const choice = await chooseSession(ws, lab, `${title} ${link}`)
          if (choice === null) return
          const target = await cloneIntoLab(ws, link, choice.folder, repo, title)
          // Linked with its session (wherever it lies) – shown on the session's page.
          if (target && choice.session) await linkRepoToSession(ws, `${target}.md`, choice.session)
        })
      }
    >
      {t('clone.button')}
    </Button>
  )
}

/**
 * Where the repository goes and which session it belongs to. Default: the shared lab folder (a
 * later session may need an earlier one's files), linked with the session suggested by its number
 * ("Praktikum 2" → P02, created if needed); "eigene Umgebung" puts it into the session's own folder.
 * Called on a session page: that session, its shared folder.
 */
async function chooseSession(
  ws: Workspace,
  lab: string,
  text: string,
): Promise<{ folder: string; session?: string } | null> {
  const here = ws.get(`${lab}.md`)
  if (typeof here?.data.praktikum === 'number') {
    const parent = lab.slice(0, lab.lastIndexOf('/'))
    return { folder: parent, session: here.path }
  }
  const hubs = hubsOf(ws, lab)
  const n = labNumber(text)
  const options: Array<{ value: string; label: string }> = []
  if (n) {
    options.push({ value: `shared:${n}`, label: t('clone.sessionShared', { name: hubName(n) }) })
    options.push({ value: `own:${n}`, label: t('clone.sessionOwn', { name: hubName(n) }) })
  }
  for (const k of [...hubs.keys()].sort((a, b) => a - b))
    if (k !== n) options.push({ value: `shared:${k}`, label: hubName(k) })
  options.push({
    value: 'none',
    label: t('clone.sessionNone', { name: lab.slice(lab.lastIndexOf('/') + 1) }),
  })
  const picked = await useApp.getState().ask({
    title: t('clone.sessionTitle'),
    label: n ? t('clone.sessionSuggested', { name: hubName(n) }) : t('clone.sessionPick'),
    confirmLabel: t('common.next'),
    choices: options,
    initial: options[0]!.value,
  })
  if (picked === null) return null
  if (picked === 'none') return { folder: lab }
  const [where, num] = picked.split(':') as ['shared' | 'own', string]
  const hub = await ensureHub(ws, lab, Number(num))
  return { folder: where === 'own' ? hub.slice(0, -3) : lab, session: hub }
}
