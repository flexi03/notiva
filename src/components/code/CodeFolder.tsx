import { useState } from 'react'
import { Code2, FolderOpen, GitBranch, SquareTerminal } from 'lucide-react'
import { TerminalPanel } from '@/components/terminal/TerminalPanel'
import { useGit } from '@/app/git'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import type { Page } from '@/lib/workspace'
import { electronBridge } from '@/lib/vault'
import { Button } from '@/components/ui'

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
            {t('code.openFinder')}
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
        <div className="h-80 overflow-hidden rounded-control border border-line">
          <TerminalPanel
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
      {files.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium">
            {t('code.files', { count: files.length })}
          </summary>
          <ul className="mt-1 max-h-60 overflow-y-auto font-code text-[12.5px] text-ink-2">
            {files.slice(0, 300).map((f) => (
              <li key={f}>{f.slice(folder.length + 1)}</li>
            ))}
          </ul>
        </details>
      )}
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
