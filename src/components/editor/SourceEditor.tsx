import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { parseMarkdown } from '@/lib/frontmatter'
import { continueList, indentLine, wrapSelection, type TextState } from '@/lib/editing'
import type { Page } from '@/lib/workspace'
import { AutoTextArea } from '@/components/ui'

/** Whole file as plain Markdown (frontmatter included) – the "escape hatch" for full control. */
export function SourceEditor({ page }: { page: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const spellcheck = useApp((s) => s.settings.spellcheck)
  const [text, setText] = useState(() => ws.source(page.path))
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const latest = useRef(text)

  const save = (value: string) => {
    const parsed = parseMarkdown(value)
    setError(parsed.error ?? null)
    if (parsed.error) return
    void run(() => ws.saveSource(page.path, value))
  }

  // Flush on unmount with the latest save function.
  const saveRef = useRef(save)
  useLayoutEffect(() => {
    saveRef.current = save
  })
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      saveRef.current(latest.current)
    },
    [],
  )

  const change = (value: string, selection?: { start: number; end: number }) => {
    setText(value)
    latest.current = value
    clearTimeout(timer.current)
    timer.current = setTimeout(() => save(value), 600)
    if (selection) requestAnimationFrame(() => ref.current?.setSelectionRange(selection.start, selection.end))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget
    const s: TextState = { text: el.value, start: el.selectionStart, end: el.selectionEnd }
    const mod = e.metaKey || e.ctrlKey
    let next: TextState | null = null
    if (e.key === 'Enter' && !e.shiftKey) next = continueList(s)
    else if (e.key === 'Tab') next = indentLine(s, e.shiftKey)
    else if (mod && e.key.toLowerCase() === 'b') next = wrapSelection(s, '**')
    else if (mod && e.key.toLowerCase() === 'i') next = wrapSelection(s, '_')
    if (next) {
      e.preventDefault()
      change(next.text, next)
    }
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-2 rounded-control bg-[var(--opt-red)] px-3 py-1.5 text-sm text-[var(--opt-red-ink)]"
        >
          {t('page.yamlError', { message: error })}
        </p>
      )}
      <AutoTextArea
        ref={ref}
        plain
        aria-label={t('page.source')}
        spellCheck={spellcheck}
        value={text}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        className="min-h-[60vh] font-code text-[14px] leading-relaxed"
      />
    </div>
  )
}
