import { useEffect } from 'react'
import { FolderOpen, GitBranch } from 'lucide-react'
import { cloneIntoLab, labFolderOf } from '@/app/clone'
import { labFoldersOf, loadClones, sameRepo, useClones } from '@/app/clones'
import { useRepo } from '@/app/repoDetect'
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
  const labs = folder ? [folder] : module ? labFoldersOf(ws, module) : []
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
        onClick={() => navigate({ name: 'page', path: `${found.lab}.md` })}
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
          const target = await cloneIntoLab(ws, link, lab, repo, title)
          if (target && !folder) navigate({ name: 'page', path: `${lab}.md` })
        })
      }
    >
      {t('clone.button')}
    </Button>
  )
}
