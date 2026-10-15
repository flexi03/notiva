import { useEffect, useRef, useState } from 'react'
import { SquareTerminal } from 'lucide-react'
import { useAction, useWorkspace } from '@/app/store'
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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 text-[12.5px] text-ink-3">
        <span className="min-w-0 flex-1 truncate font-code">{path}</span>
        <span role="status">
          {state === 'saved' ? t('code.saved') : state === 'saving' ? t('code.saving') : t('code.unsaved')}
        </span>
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
      <div className="min-h-0 flex-1">
        <CodeEditor
          path={path}
          value={initial}
          onSave={save}
          onChange={(next) => {
            text.current = next
            setState('dirty')
            clearTimeout(timer.current)
            timer.current = setTimeout(save, 800)
          }}
        />
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
          <TerminalDock folder={work.folder} onClose={() => setTerminal(false)} />
        </div>
      )}
    </div>
  )
}
