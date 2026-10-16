import { useEffect, useLayoutEffect, useRef } from 'react'
import { basicSetup, EditorView } from 'codemirror'
import { EditorState, type Extension } from '@codemirror/state'
import { gutter, GutterMarker, keymap } from '@codemirror/view'
import { StateEffect, StateField } from '@codemirror/state'
import { lineMarkers } from '@/lib/diff'
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
  '.cm-change-gutter': { width: '4px' },
  '.cm-change': { width: '3px', height: '100%' },
  '.cm-change-added': { backgroundColor: '#2da44e' },
  '.cm-change-modified': { backgroundColor: '#0969da' },
  '.cm-change-deleted': { height: '3px', marginTop: '-1px', backgroundColor: '#cf222e' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent) !important',
  },
})

/* ---------- change markers in the gutter (like VS Code): against the file in Git ---------- */

class ChangeMarker extends GutterMarker {
  constructor(readonly kind: 'added' | 'modified' | 'deleted') {
    super()
  }
  override eq(other: ChangeMarker) {
    return other.kind === this.kind
  }
  override toDOM() {
    const el = document.createElement('div')
    el.className = `cm-change cm-change-${this.kind}`
    el.title = this.kind
    return el
  }
}
const setBase = StateEffect.define<string | null>()
/** The text in Git (HEAD) the markers compare with; null: no markers. */
const baseField = StateField.define<string | null>({
  create: () => null,
  update: (value, tr) => tr.effects.find((e) => e.is(setBase))?.value ?? value,
})
const changeGutter = gutter({
  class: 'cm-change-gutter',
  lineMarker(view, line) {
    const base = view.state.field(baseField)
    if (base === null) return null
    const cache = markerCache.get(view.state.doc)
    const markers = cache ?? lineMarkers(base, view.state.doc.toString())
    if (!cache) markerCache.set(view.state.doc, markers)
    const n = view.state.doc.lineAt(line.from).number - 1
    const kind = markers.changed.get(n)
    if (kind) return new ChangeMarker(kind)
    return markers.deletedBefore.has(n) ? new ChangeMarker('deleted') : null
  },
  lineMarkerChange: (u) => u.docChanged || u.transactions.some((tr) => tr.effects.some((e) => e.is(setBase))),
})
const markerCache = new WeakMap<object, ReturnType<typeof lineMarkers>>()

/** Code editor (CodeMirror) – syntax colours by file type, Tab indents, ⌘S saves right away. */
export function CodeEditor({
  path,
  value,
  onChange,
  onSave,
  base = null,
}: {
  path: string
  value: string
  onChange: (text: string) => void
  onSave: () => void
  /** the file as in Git – the gutter marks added, changed and deleted lines against it */
  base?: string | null
}) {
  const host = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
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
          baseField,
          changeGutter,
          ...language(path),
          EditorView.updateListener.of(
            (u) => u.docChanged && latest.current.onChange(u.state.doc.toString()),
          ),
        ],
      }),
    })
    viewRef.current = view
    return () => view.destroy()
    // The editor is created once per file; later text comes from typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])
  useEffect(() => {
    viewRef.current?.dispatch({ effects: setBase.of(base) })
  }, [base, path])
  return <div ref={host} className="h-full min-h-0 overflow-hidden" data-testid="code-editor" />
}
