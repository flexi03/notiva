import { useEffect, useRef, useState } from 'react'
import { Code2, NotebookPen, RotateCcw, X } from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { IconButton } from '@/components/ui'

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/**
 * A shell in a folder of the vault (desktop app). Output can be copied into the notes as a code
 * block ("Auswahl in Notizen"), e.g. the commands and results of a lab next to its PDF.
 */
export function TerminalPanel({
  folder,
  onSave,
  onClose,
}: {
  folder: string
  /** Text selected in the terminal → notes. */
  onSave?: (text: string) => void
  onClose?: () => void
}) {
  const bridge = electronBridge()
  const host = useRef<HTMLDivElement>(null)
  const term = useRef<Terminal | null>(null)
  const [run, setRun] = useState(0)
  const [ended, setEnded] = useState(false)

  useEffect(() => {
    const api = bridge?.terminal
    if (!api || !host.current) return
    const terminal = new Terminal({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 12.5,
      cursorBlink: true,
      convertEol: false,
      theme: {
        background: css('--bg-sunken', '#f4f4f2'),
        foreground: css('--ink', '#1d1d1b'),
        cursor: css('--accent', '#2f6f5e'),
        selectionBackground: 'rgba(47,111,94,0.3)',
      },
    })
    const fit = new FitAddon()
    terminal.loadAddon(fit)
    terminal.open(host.current)
    fit.fit()
    term.current = terminal
    let id: number | null = null
    let disposed = false
    const offData = api.onData((tid, data) => tid === id && terminal.write(data))
    const offExit = api.onExit((tid) => tid === id && setEnded(true))
    const input = terminal.onData((data) => id !== null && void api.write(id, data))
    void api.start(folder, terminal.cols, terminal.rows).then((started) => {
      if (disposed) void api.stop(started)
      else id = started
    })
    const observer = new ResizeObserver(() => {
      fit.fit()
      if (id !== null) void api.resize(id, terminal.cols, terminal.rows)
    })
    observer.observe(host.current)
    terminal.focus()
    return () => {
      disposed = true
      observer.disconnect()
      offData()
      offExit()
      input.dispose()
      if (id !== null) void api.stop(id)
      terminal.dispose()
      term.current = null
    }
  }, [bridge, folder, run])

  if (!bridge?.terminal) return <p className="p-3 text-sm text-ink-3">{t('terminal.desktopOnly')}</p>
  return (
    <section aria-label={t('terminal.title')} className="flex h-full min-h-0 flex-col bg-sunken">
      <header className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2 text-[12.5px] text-ink-2">
        <span className="min-w-0 flex-1 truncate font-code" title={folder || '/'}>
          {t('terminal.title')} · {folder || t('terminal.vaultRoot')}
          {ended && ` · ${t('terminal.ended')}`}
        </span>
        {onSave && (
          <IconButton
            size="sm"
            label={t('terminal.saveSelection')}
            onClick={() => {
              const text = term.current?.getSelection().trim()
              if (text) onSave(text)
            }}
          >
            <NotebookPen size={14} />
          </IconButton>
        )}
        <IconButton
          size="sm"
          label={t('code.openEditor')}
          onClick={() => void bridge.code?.open(folder, 'editor')}
        >
          <Code2 size={14} />
        </IconButton>
        <IconButton
          size="sm"
          label={t('terminal.restart')}
          onClick={() => {
            setEnded(false)
            setRun((n) => n + 1)
          }}
        >
          <RotateCcw size={14} />
        </IconButton>
        {onClose && (
          <IconButton size="sm" label={t('common.close')} onClick={onClose}>
            <X size={14} />
          </IconButton>
        )}
      </header>
      <div ref={host} data-testid="terminal" className="min-h-0 flex-1 px-1 py-1" />
    </section>
  )
}
