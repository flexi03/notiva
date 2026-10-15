import { useState } from 'react'
import {
  Code2,
  ExternalLink,
  FileCode2,
  FilePlus,
  FolderOpen,
  GitBranch,
  Globe,
  Link2,
  SquareTerminal,
} from 'lucide-react'
import { cloneIntoLab } from '@/app/clone'
import { repoUrl } from '@/lib/gitUrl'
import { useDockRequests } from '@/app/dock'
import { useMoodle } from '@/app/moodle'
import { TerminalDock } from '@/components/terminal/TerminalDock'
import { useGit } from '@/app/git'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import type { Page } from '@/lib/workspace'
import { electronBridge } from '@/lib/vault'
import { Button, IconButton } from '@/components/ui'

/** Folder of a code page: the page "Praktikum.md" owns "Praktikum/" next to it. */
export const codeFolder = (page: Page) => page.path.slice(0, -3)

/**
 * A page marked `code: true` is a code folder (e.g. a lab project): open it in the editor, the
 * Finder or the Terminal, see its files and Git changes. The code lives in the vault, in the same
 * Git repository as the notes.
 */
export function CodeFolder({ page }: { page: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const toggleView = useApp((s) => s.toggleView)
  const folder = codeFolder(page)
  const [terminal, setTerminal] = useState(false)
  const bridge = electronBridge()?.code
  const files = ws
    .assets()
    .map((f) => f.path)
    .concat(ws.all().map((p) => p.path))
    .filter((p) => p.startsWith(`${folder}/`))
    .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }))
  const changes = useGit((s) => s.state?.changes.filter((c) => c.path.startsWith(`${folder}/`)).length ?? 0)
  const open = (how: 'editor' | 'finder' | 'terminal') => void run(() => bridge!.open(folder, how))
  const navigate = useApp((s) => s.navigate)
  // Links of the lab: own ones (frontmatter "links") and the links of the module's Moodle courses.
  const links = Array.isArray(page.data.links)
    ? page.data.links.filter((l): l is string => typeof l === 'string')
    : []
  const module = ws.get(`${page.path.slice(0, page.path.lastIndexOf('/'))}.md`)
  const courses = Array.isArray(module?.data.kurse) ? module!.data.kurse.map(String) : []
  const snapshot = useMoodle((s) => s.snapshot)
  const moodleLinks = (snapshot?.materials ?? [])
    .filter(
      (m) =>
        (m.kind === 'url' || m.kind === 'page') && courses.includes(m.courseId) && !links.includes(m.url),
    )
    .map((m) => ({ url: m.url, title: m.title, own: false }))
  const openLink = (url: string) => {
    setTerminal(true)
    // The terminal area of this folder opens it beside the terminal.
    setTimeout(() => useDockRequests.getState().openWeb(folder, url), 50)
  }
  const addLink = async () => {
    const url = (
      await useApp
        .getState()
        .ask({ title: t('code.addLinkAsk'), initial: 'https://', confirmLabel: t('code.addLink') })
    )?.trim()
    if (!url || !/^https?:\/\/\S+\.\S+/.test(url)) return
    await run(() => ws.setProperty(page.path, 'links', [...links, url]))
  }
  const newFile = async () => {
    const name = (
      await useApp
        .getState()
        .ask({ title: t('code.newFileName'), initial: '', confirmLabel: t('code.newFile') })
    )?.trim()
    if (!name || name.includes('..') || name.startsWith('/')) return
    await run(async () => {
      await ws.writeFile(`${folder}/${name}`, '')
      navigate({ name: 'file', path: `${folder}/${name}` })
    })
  }
  return (
    <section
      aria-label={t('code.title')}
      className="mt-4 space-y-3 rounded-panel border border-line bg-sunken/40 p-3"
    >
      <p className="text-[13px] text-ink-3">{t('code.hint', { folder })}</p>
      {bridge ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<Code2 size={15} />} onClick={() => open('editor')}>
            {t('code.openEditor')}
          </Button>
          <Button icon={<FolderOpen size={15} />} onClick={() => open('finder')}>
            {t(
              `code.openFinder.${({ darwin: 'mac', win32: 'win' } as Record<string, 'mac' | 'win'>)[electronBridge()?.platform ?? ''] ?? 'linux'}`,
            )}
          </Button>
          <Button icon={<SquareTerminal size={15} />} onClick={() => setTerminal((v) => !v)}>
            {terminal ? t('code.hideTerminal') : t('code.inAppTerminal')}
          </Button>
          <Button onClick={() => open('terminal')}>{t('code.openTerminal')}</Button>
          <Button icon={<GitBranch size={15} />} onClick={() => toggleView('git')}>
            {changes ? t('code.changes', { count: changes }) : t('code.noChanges')}
          </Button>
        </div>
      ) : (
        <p className="text-sm">{t('code.desktopOnly')}</p>
      )}
      {terminal && bridge && (
        <div className="h-96 overflow-hidden rounded-control border border-line">
          <TerminalDock
            folder={folder}
            onClose={() => setTerminal(false)}
            onSave={(text) =>
              void run(async () => {
                const current = ws.get(page.path)!
                await ws.save(page.path, {
                  body: `${current.body.trimEnd()}\n\n\`\`\`text\n${text}\n\`\`\`\n`,
                })
              })
            }
          />
        </div>
      )}
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="flex-1 text-[12.5px] font-semibold text-ink-2">
            {t('code.files', { count: files.length })}
          </h3>
          <Button size="sm" icon={<FilePlus size={13} />} onClick={() => void newFile()}>
            {t('code.newFile')}
          </Button>
        </div>
        {files.length > 0 && (
          <ul className="max-h-60 overflow-y-auto">
            {files.slice(0, 300).map((f) => (
              <li key={f}>
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 rounded-control px-1 py-0.5 text-left font-code text-[12.5px] text-ink-2 hover:bg-hover"
                  onClick={() =>
                    navigate(f.endsWith('.md') ? { name: 'page', path: f } : { name: 'file', path: f })
                  }
                >
                  <FileCode2 size={12} className="shrink-0 text-ink-3" />
                  {f.slice(folder.length + 1)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="flex-1 text-[12.5px] font-semibold text-ink-2">{t('code.links')}</h3>
          <Button size="sm" icon={<Link2 size={13} />} onClick={() => void addLink()}>
            {t('code.addLink')}
          </Button>
        </div>
        {links.length === 0 && moodleLinks.length === 0 ? null : (
          <ul className="space-y-0.5">
            {[...links.map((url) => ({ url, title: url, own: true })), ...moodleLinks].map((l) => (
              <li key={l.url} className="flex items-center gap-1.5 text-[13px]">
                <Globe size={12} className="shrink-0 text-ink-3" />
                <button
                  type="button"
                  className="min-w-0 truncate text-left text-accent hover:underline"
                  title={l.url}
                  onClick={() => openLink(l.url)}
                >
                  {l.title}
                </button>
                {!l.own && <span className="shrink-0 text-[11.5px] text-ink-3">{t('code.moodleLinks')}</span>}
                <IconButton
                  size="sm"
                  label={t('course.openBrowser')}
                  onClick={() => void electronBridge()?.openExternal(l.url)}
                >
                  <ExternalLink size={12} />
                </IconButton>
                {repoUrl(l.url) && bridge?.clone && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<GitBranch size={13} />}
                    onClick={() => void run(() => cloneIntoLab(ws, l.url, folder))}
                  >
                    {t('clone.button')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/** Creates "<page folder>/<name>.md" as code page and its folder with a .gitignore. */
export async function createCodeFolder(
  ws: ReturnType<typeof useWorkspace>,
  parent: string,
  name: string,
): Promise<string> {
  const path = await ws.createChild(
    parent,
    name,
    { code: true, icon: '💻' },
    '## Aufgabe\n\n- \n\n## Notizen\n\n- \n',
  )
  await electronBridge()?.code?.init(path.slice(0, -3))
  await ws.reload()
  return path
}
