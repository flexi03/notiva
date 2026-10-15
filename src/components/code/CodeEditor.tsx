import { useEffect, useLayoutEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { sql } from '@codemirror/lang-sql'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { java } from '@codemirror/lang-java'
import { json } from '@codemirror/lang-json'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'

function language(path: string): Extension[] {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (ext === 'sql') return [sql()]
  if (['js', 'mjs', 'cjs', 'jsx'].includes(ext)) return [javascript({ jsx: true })]
  if (['ts', 'tsx'].includes(ext)) return [javascript({ typescript: true, jsx: ext === 'tsx' })]
  if (ext === 'py') return [python()]
  if (['java', 'kt'].includes(ext)) return [java()]
  if (['json', 'ipynb'].includes(ext)) return [json()]
  if (['html', 'htm', 'xml'].includes(ext)) return [html()]
  if (['css', 'scss'].includes(ext)) return [css()]
  return []
}

/** Colours from the app theme (light and dark). */
const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--paper)', color: 'var(--ink)', fontSize: '13px' },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.5' },
  '.cm-gutters': { backgroundColor: 'var(--sunken)', color: 'var(--ink-3, #888)', border: 'none' },
  '.cm-activeLine, .cm-activeLineGutter': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 7%, transparent)',
  },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important',
  },
})

/** Code editor (CodeMirror) – syntax colours by file type, Tab indents, ⌘S saves right away. */
export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
}: {
  path: string
  value: string
  onChange: (text: string) => void
  onSave: () => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const latest = useRef({ onChange, onSave })
  useLayoutEffect(() => {
    latest.current = { onChange, onSave }
  })
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([
            indentWithTab,
            {
              key: 'Mod-s',
              preventDefault: true,
              run: () => {
                latest.current.onSave()
                return true
              },
            },
          ]),
          theme,
          ...language(path),
          EditorView.updateListener.of(
            (u) => u.docChanged && latest.current.onChange(u.state.doc.toString()),
          ),
        ],
      }),
    })
    return () => view.destroy()
    // The editor is created once per file; later text comes from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />
}
