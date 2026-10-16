import { useEffect } from 'react'
import { FolderOpen, GitBranch } from 'lucide-react'
import { cloneIntoLab, labFolderOf } from '@/app/clone'
import { labFoldersOf, loadClones, sameRepo, useClones } from '@/app/clones'
import { useRepo } from '@/app/repoDetect'
import { ensureHub, hubName, hubsOf } from '@/app/labHubs'
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
          const into = await chooseSession(ws, lab, `${title} ${link}`)
          if (into === null) return
          await cloneIntoLab(ws, link, into, repo, title)
        })
      }
    >
      {t('clone.button')}
    </Button>
  )
}

/**
 * Which lab session the repository belongs to: a session page (P01 …) is used as it is; in a lab
 * folder Notiva suggests the session by number ("Praktikum 2" → P02, created if needed) and asks.
 */
async function chooseSession(ws: Workspace, lab: string, text: string): Promise<string | null> {
  if (typeof ws.get(`${lab}.md`)?.data.praktikum === 'number') return lab
  const hubs = hubsOf(ws, lab)
  const n = labNumber(text)
  const options = [
    ...(n && !hubs.has(n) ? [{ value: `new:${n}`, label: t('clone.sessionNew', { name: hubName(n) }) }] : []),
    ...[...hubs]
      .sort((a, b) => a[0] - b[0])
      .map(([k, h]) => ({ value: h.path.slice(0, -3), label: hubName(k) })),
    { value: lab, label: t('clone.sessionNone', { name: lab.slice(lab.lastIndexOf('/') + 1) }) },
  ]
  const suggested = n ? (hubs.get(n)?.path.slice(0, -3) ?? `new:${n}`) : options[0]!.value
  const picked = await useApp.getState().ask({
    title: t('clone.sessionTitle'),
    label: n ? t('clone.sessionSuggested', { name: hubName(n) }) : t('clone.sessionPick'),
    confirmLabel: t('common.next'),
    choices: options,
    initial: suggested,
  })
  if (picked === null) return null
  if (picked.startsWith('new:')) return (await ensureHub(ws, lab, Number(picked.slice(4)))).slice(0, -3)
  return picked
}
