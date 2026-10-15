import { useEffect, useState } from 'react'
import { t } from '@/i18n'

interface MenuState {
  x: number
  y: number
  field: HTMLTextAreaElement | HTMLInputElement
}

/** Replaces the selection like typing does (undo works, React sees the change). */
function replaceSelection(field: HTMLTextAreaElement | HTMLInputElement, wrap: (text: string) => string) {
  field.focus()
  const start = field.selectionStart ?? 0
  const end = field.selectionEnd ?? 0
  const text = field.value.slice(start, end)
  if (!document.execCommand('insertText', false, wrap(text)))
    field.setRangeText(wrap(text), start, end, 'end')
}

/**
 * Right click in a text field (comments, notes, page notes …): cut/copy/paste and Markdown helpers –
 * selected text as code block (```), inline code (`) or bold.
 */
export function TextContextMenu() {
  const [menu, setMenu] = useState<MenuState | null>(null)
  useEffect(() => {
    const onContext = (e: MouseEvent) => {
      const field = e.target
      if (
        !(field instanceof HTMLTextAreaElement) &&
        !(field instanceof HTMLInputElement && field.type === 'text')
      )
        return
      if (field.closest('.cm-editor, .xterm')) return
      e.preventDefault()
      setMenu({ x: e.clientX, y: e.clientY, field })
    }
    const close = () => setMenu(null)
    document.addEventListener('contextmenu', onContext)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('contextmenu', onContext)
      window.removeEventListener('blur', close)
    }
  }, [])
  if (!menu) return null
  const { field } = menu
  const selected = (field.selectionEnd ?? 0) > (field.selectionStart ?? 0)
  const items: Array<[string, () => void, boolean]> = [
    [t('ctx.cut'), () => (field.focus(), document.execCommand('cut')), selected],
    [t('ctx.copy'), () => (field.focus(), document.execCommand('copy')), selected],
    [
      t('ctx.paste'),
      () =>
        void navigator.clipboard
          .readText()
          .then((text) => replaceSelection(field, () => text))
          .catch(() => undefined),
      true,
    ],
    ['—', () => undefined, false],
    [
      t('ctx.codeBlock'),
      () =>
        replaceSelection(field, (text) => {
          const before = field.value.slice(0, field.selectionStart ?? 0)
          const lead = before && !before.endsWith('\n') ? '\n' : ''
          return `${lead}\`\`\`\n${text.replace(/\n$/, '')}\n\`\`\`\n`
        }),
      true,
    ],
    [t('ctx.inlineCode'), () => replaceSelection(field, (text) => `\`${text}\``), selected],
    [t('ctx.bold'), () => replaceSelection(field, (text) => `**${text}**`), selected],
  ]
  return (
    <div
      className="fixed inset-0 z-[60]"
      // Keep the focus in the text field (notes switch to the formatted view on leaving).
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={() => setMenu(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <ul
        role="menu"
        aria-label={t('ctx.menu')}
        className="absolute min-w-44 rounded-panel border border-line bg-surface py-1 text-sm shadow-[var(--shadow-pop)]"
        style={{
          left: Math.min(menu.x, window.innerWidth - 200),
          top: Math.min(menu.y, window.innerHeight - 240),
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.preventDefault()}
      >
        {items.map(([label, run, enabled], i) =>
          label === '—' ? (
            <li key={i} role="separator" className="my-1 h-px bg-line" />
          ) : (
            <li key={label} role="none">
              <button
                type="button"
                role="menuitem"
                disabled={!enabled}
                className="w-full px-3 py-1.5 text-left hover:bg-hover disabled:opacity-40"
                onClick={() => {
                  setMenu(null)
                  run()
                }}
              >
                {label}
              </button>
            </li>
          ),
        )}
      </ul>
    </div>
  )
}
