import { useEffect, useRef, useState } from 'react'
import { Code2, NotebookPen, RotateCcw, X } from 'lucide-react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { IconButton } from '@/components/ui'

const css = (name: string, fallback: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

/** Colors from the app theme (light or dark) – ANSI colors readable on both. */
export function terminalTheme(): ITheme {
  const dark = document.documentElement.dataset.theme === 'dark'
  const base = {
    background: css('--sunken', dark ? '#1b1d21' : '#f4f4f2'),
    foreground: css('--ink', dark ? '#e6e6e3' : '#1d1d1b'),
    cursor: css('--accent', dark ? '#7cc4ad' : '#2f6f5e'),
    cursorAccent: css('--sunken', dark ? '#1b1d21' : '#f4f4f2'),
    selectionBackground: dark ? 'rgba(124,196,173,0.35)' : 'rgba(47,111,94,0.25)',
  }
  return dark
    ? {
        ...base,
        black: '#3b3f46',
        red: '#ff7b72',
        green: '#7ee787',
        yellow: '#e3b341',
        blue: '#79c0ff',
        magenta: '#d2a8ff',
        cyan: '#56d4dd',
        white: '#d0d0cc',
        brightBlack: '#6e7681',
        brightRed: '#ffa198',
        brightGreen: '#aff5b4',
        brightYellow: '#f8e3a1',
        brightBlue: '#a5d6ff',
        brightMagenta: '#e2c5ff',
        brightCyan: '#b3f0ff',
        brightWhite: '#ffffff',
      }
    : {
        ...base,
        black: '#1d1d1b',
        red: '#c0392b',
        green: '#1e7a3e',
        yellow: '#8a6200',
        blue: '#1f5fbf',
        magenta: '#8e3fa8',
        cyan: '#0e7380',
        white: '#6b6b66',
        brightBlack: '#57574f',
        brightRed: '#e0483a',
        brightGreen: '#2a9a50',
        brightYellow: '#a87900',
        brightBlue: '#2f74e0',
        brightMagenta: '#a855c7',
        brightCyan: '#13909f',
        brightWhite: '#3a3a36',
      }
}

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
      theme: terminalTheme(),
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
    // Follow the light/dark switch of the app.
    const themeWatch = new MutationObserver(() => (terminal.options.theme = terminalTheme()))
    themeWatch.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'style', 'class'],
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
      themeWatch.disconnect()
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
