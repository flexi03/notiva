import { useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { FileText, Table2 } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { useAssistant } from '@/app/assistant'
import { t } from '@/i18n'
import {
  activeTrigger,
  continueList,
  indentLine,
  isMultilineBlock,
  replaceRange,
  splitAt,
  wrapSelection,
  type TextState,
} from '@/lib/editing'
import { widgetBlock } from '@/lib/widgets'
import { AutoTextArea } from '@/components/ui'
import { filterCommands, slashCommands, type SlashCommand } from './slashCommands'
import { SuggestMenu, type Suggestion } from './SuggestMenu'
import { saveAttachment, pickImageFile } from './attachments'

export type Caret = 'start' | 'end' | number

export interface BlockInputCallbacks {
  onChange(text: string): void
  /** Enter at a split point: current block keeps `before`, a new block with `after` follows. */
  onSplit(before: string, after: string): void
  /** Insert a standalone block after this one (widgets, code …). */
  onInsertBlock(text: string, caret?: Caret): void
  /** Backspace at start: merge into previous block (or delete if empty). */
  onMergeUp(text: string): void
  onFocusPrev(): void
  onFocusNext(): void
  onDone(): void
}

interface Suggest {
  kind: 'slash' | 'link' | 'database'
  query: string
  from: number
}

export function BlockInput({
  text,
  caret,
  pagePath,
  callbacks,
}: {
  text: string
  caret?: Caret
  pagePath: string
  callbacks: BlockInputCallbacks
}) {
  const ws = useWorkspace()
  const spellcheck = useApp((s) => s.settings.spellcheck)
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const [anchor, setAnchor] = useState<HTMLTextAreaElement | null>(null)
  const [suggest, setSuggest] = useState<Suggest | null>(null)
  const [active, setActive] = useState(0)
  const pendingSelection = useRef<{ start: number; end: number } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: false })
    const pos =
      caret === 'start'
        ? 0
        : caret === undefined || caret === 'end'
          ? el.value.length
          : Math.min(caret, el.value.length)
    el.setSelectionRange(pos, pos)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (pendingSelection.current && ref.current) {
      ref.current.setSelectionRange(pendingSelection.current.start, pendingSelection.current.end)
      pendingSelection.current = null
    }
  })

  const state = (): TextState => ({
    text: ref.current?.value ?? text,
    start: ref.current?.selectionStart ?? 0,
    end: ref.current?.selectionEnd ?? 0,
  })

  const apply = (next: TextState) => {
    pendingSelection.current = { start: next.start, end: next.end }
    callbacks.onChange(next.text)
    updateSuggest(next)
  }

  const updateSuggest = (s: TextState) => {
    if (suggest?.kind === 'database') return
    const trigger = activeTrigger(s)
    setSuggest(trigger)
    setActive(0)
  }

  const items: Array<Suggestion & { command?: SlashCommand; path?: string }> = useMemo(() => {
    if (!suggest) return []
    if (suggest.kind === 'slash') {
      return filterCommands(slashCommands(), suggest.query).map((c) => ({
        id: c.id,
        label: t(c.label),
        icon: c.icon,
        command: c,
      }))
    }
    const q = suggest.query.toLowerCase()
    const pages = suggest.kind === 'database' ? ws.databases() : ws.all()
    return pages
      .filter((p) => !q || p.title.toLowerCase().includes(q) || p.path.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          Number(!a.title.toLowerCase().startsWith(q)) - Number(!b.title.toLowerCase().startsWith(q)) ||
          a.title.localeCompare(b.title, 'de'),
      )
      .slice(0, 30)
      .map((p) => ({
        id: p.path,
        path: p.path,
        label: p.title,
        detail: p.path.slice(0, -3),
        icon: p.icon ? <span>{p.icon}</span> : p.database ? <Table2 size={15} /> : <FileText size={15} />,
      }))
  }, [suggest, ws])

  const pick = async (item: (typeof items)[number]) => {
    const s = state()
    if (!suggest) return
    if (suggest.kind === 'link' && item.path) {
      apply(replaceRange(s, suggest.from, `[[${ws.linkText(item.path)}]]`))
      setSuggest(null)
      return
    }
    if (suggest.kind === 'database' && item.path) {
      setSuggest(null)
      const embed = widgetBlock(`type: view\nsource: ${JSON.stringify(ws.linkText(item.path))}`)
      const rest = replaceRange(s, suggest.from, '')
      if (rest.text.trim()) {
        apply(rest)
        callbacks.onInsertBlock(embed)
      } else callbacks.onChange(embed)
      callbacks.onDone()
      return
    }
    const command = item.command
    if (!command) return
    if (command.action === 'link') {
      apply(replaceRange(s, suggest.from, '[['))
      setSuggest({ kind: 'link', query: '', from: suggest.from })
      return
    }
    if (command.action === 'view') {
      setSuggest({ kind: 'database', query: '', from: suggest.from })
      setActive(0)
      return
    }
    if (command.action === 'ai') {
      // Opens the assistant; the paragraph (if any) becomes the reference of the question.
      const rest = replaceRange(s, suggest.from, '')
      setSuggest(null)
      apply(rest)
      const context = rest.text.trim()
      useAssistant.getState().setDraft(context ? `Zu „${context.slice(0, 400)}“: ` : '')
      useApp.getState().openView('assistant')
      callbacks.onDone()
      return
    }
    if (command.action === 'image') {
      setSuggest(null)
      const file = await pickImageFile()
      if (file) apply(replaceRange(state(), suggest.from, await saveAttachment(ws, pagePath, file)))
      return
    }
    const insert = command.insert ?? ''
    setSuggest(null)
    const rest = replaceRange(s, suggest.from, '')
    if (command.block && rest.text.trim()) {
      apply(rest)
      const mark = insert.indexOf('|')
      callbacks.onInsertBlock(insert.replace('|', ''), mark === -1 ? 'end' : mark)
      return
    }
    apply(replaceRange(s, suggest.from, insert))
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const s = state()
    const mod = e.metaKey || e.ctrlKey
    if (suggest) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setActive(
          (a) =>
            (a + (e.key === 'ArrowDown' ? 1 : -1) + Math.max(items.length, 1)) % Math.max(items.length, 1),
        )
        return
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && items[active]) {
        e.preventDefault()
        void pick(items[active]!)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSuggest(null)
        return
      }
    }
    if (mod && !e.shiftKey && ['b', 'i', 'e', 'k'].includes(e.key.toLowerCase())) {
      e.preventDefault()
      const marks: Record<string, [string, string]> = {
        b: ['**', '**'],
        i: ['_', '_'],
        e: ['`', '`'],
        k: ['[[', ']]'],
      }
      const [before, after] = marks[e.key.toLowerCase()]!
      apply(wrapSelection(s, before, after))
      return
    }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      apply(wrapSelection(s, '==', '=='))
      return
    }
    if (e.key === 'Escape' || (mod && e.key === 'Enter')) {
      e.preventDefault()
      callbacks.onDone()
      return
    }
    if (e.key === 'Tab') {
      const next = indentLine(s, e.shiftKey)
      if (next) {
        e.preventDefault()
        apply(next)
      }
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      const list = continueList(s)
      if (list) {
        e.preventDefault()
        if (list.exit) callbacks.onSplit(list.text, '')
        else apply(list)
        return
      }
      if (isMultilineBlock(s.text)) return
      e.preventDefault()
      const { before, after } = splitAt(s)
      callbacks.onSplit(before, after)
      return
    }
    if (e.key === 'Backspace' && s.start === 0 && s.end === 0) {
      e.preventDefault()
      callbacks.onMergeUp(s.text)
      return
    }
    if (e.key === 'ArrowUp' && s.start === s.end && !s.text.slice(0, s.start).includes('\n')) {
      e.preventDefault()
      callbacks.onFocusPrev()
      return
    }
    if (e.key === 'ArrowDown' && s.start === s.end && !s.text.slice(s.end).includes('\n')) {
      e.preventDefault()
      callbacks.onFocusNext()
    }
  }

  const onPaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith('image/'))
    if (!file) return
    e.preventDefault()
    const s = state()
    apply(replaceRange(s, s.start, await saveAttachment(ws, pagePath, file)))
  }

  return (
    <>
      <AutoTextArea
        ref={(node) => {
          ref.current = node
          setAnchor(node)
        }}
        plain
        value={text}
        spellCheck={spellcheck}
        aria-label={t('editor.placeholder')}
        placeholder={t('editor.placeholder')}
        className="md block font-[inherit] leading-[1.65] text-ink placeholder:text-ink-3"
        style={{
          fontFamily: /^(```|~~~|\$\$|\|)/.test(text) ? 'var(--font-code)' : undefined,
          fontSize: /^(```|~~~|\$\$|\|)/.test(text) ? '0.88em' : undefined,
        }}
        onChange={(e) => {
          callbacks.onChange(e.target.value)
          updateSuggest({ text: e.target.value, start: e.target.selectionStart, end: e.target.selectionEnd })
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => void onPaste(e)}
        onBlur={() => {
          setSuggest(null)
          callbacks.onDone()
        }}
      />
      {suggest && (
        <SuggestMenu
          anchor={anchor}
          items={items}
          active={active}
          onHover={setActive}
          onPick={(item) => void pick(item as (typeof items)[number])}
          empty={t('slash.noResults')}
          label={suggest.kind === 'slash' ? 'Befehle' : t('search.title')}
        />
      )}
    </>
  )
}
