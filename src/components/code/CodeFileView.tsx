import { useEffect, useRef, useState } from 'react'
import { Globe, SquareTerminal } from 'lucide-react'
import { SideWeb } from '@/components/terminal/SideWeb'
import { useAction, useWorkspace } from '@/app/store'
import { useGit } from '@/app/git'
import { t } from '@/i18n'
import { workFolderFor } from '@/lib/codeFolders'
import { electronBridge } from '@/lib/vault'
import { IconButton } from '@/components/ui'
import { ResizeHandle, useStoredWidth } from '@/components/layout/ResizeHandle'
import { TerminalDock } from '@/components/terminal/TerminalDock'
import { CodeEditor } from './CodeEditor'

/**
 * A text/code file (SQL, Java, Python …) like in VS Code: editor on top, terminal below in the code
 * folder. Saves by itself shortly after typing and with ⌘S.
 */
export function CodeFileView({ path, initial }: { path: string; initial: string }) {
  const ws = useWorkspace()
  const run = useAction()
  const [state, setState] = useState<'saved' | 'dirty' | 'saving'>('saved')
  const text = useRef(initial)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [terminal, setTerminal] = useState(() => !!electronBridge()?.terminal)
  const [web, setWeb] = useState(false)
  const [height, setHeight] = useStoredWidth('code-terminal', 260, 120, 900)
  const work = workFolderFor(ws, path)

  const save = () => {
    clearTimeout(timer.current)
    setState('saving')
    void run(async () => {
      await ws.writeFile(path, text.current)
      setState('saved')
    })
  }
  useEffect(() => () => clearTimeout(timer.current), [])
  // The file as in Git – a got lab repository's own Git, else the folder's – for the markers.
  const [base, setBase] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const code = electronBridge()?.code
      const repo = (await code?.repoRoot?.(path).catch(() => null)) ?? null
      const text = repo
        ? await code?.repoShow?.(repo, 'HEAD', path.slice(repo.length + 1)).catch(() => null)
        : await useGit
            .getState()
            .headText(path)
            .catch(() => null)
      if (!cancelled) setBase(text ?? null)
    })()
    return () => {
      cancelled = true
    }
  }, [path, ws, ws.version])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-[12.5px] text-ink-3">
        <span className="min-w-0 flex-1 truncate font-code">{path}</span>
        <span role="status">
          {state === 'saved' ? t('code.saved') : state === 'saving' ? t('code.saving') : t('code.unsaved')}
        </span>
        {electronBridge()?.terminal && (
          <IconButton size="sm" label={t('web.open')} active={web} onClick={() => setWeb((v) => !v)}>
            <Globe size={14} />
          </IconButton>
        )}
        {electronBridge()?.terminal && (
          <IconButton
            size="sm"
            label={t('terminal.toggle')}
            active={terminal}
            onClick={() => setTerminal((v) => !v)}
          >
            <SquareTerminal size={14} />
          </IconButton>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <CodeEditor
            path={path}
            value={initial}
            base={base}
            onSave={save}
            onChange={(next) => {
              text.current = next
              setState('dirty')
              clearTimeout(timer.current)
              timer.current = setTimeout(save, 800)
            }}
          />
        </div>
        {web && <SideWeb storageKey={path} onClose={() => setWeb(false)} />}
      </div>
      {terminal && (
        <div className="relative shrink-0 border-t border-line" style={{ height }}>
          <ResizeHandle
            side="top"
            width={height}
            onResize={setHeight}
            label={t('terminal.title')}
            reset={260}
          />
          <TerminalDock folder={work.folder} other={work.fileFolder} onClose={() => setTerminal(false)} />
        </div>
      )}
    </div>
  )
}
