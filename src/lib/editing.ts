/**
 * Pure text operations used by the block editor. They take the block text plus selection and
 * return the new text plus selection, so they are easy to test and reuse (source mode, too).
 */
import { blockType } from './blocks'

export interface TextState {
  text: string
  start: number
  end: number
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/

/** Lines of the current cursor position. */
function lineAt(text: string, pos: number): { start: number; end: number; line: string } {
  const start = text.lastIndexOf('\n', pos - 1) + 1
  const nl = text.indexOf('\n', pos)
  const end = nl === -1 ? text.length : nl
  return { start, end, line: text.slice(start, end) }
}

/**
 * Enter inside a list: continues the list ("- ", "1. " → "2. ", "- [ ] ").
 * On an empty item, removes the marker and returns `exit: true` (caller ends the list).
 */
export function continueList(state: TextState): (TextState & { exit?: boolean }) | null {
  if (state.start !== state.end) return null
  const { start, end, line } = lineAt(state.text, state.start)
  const match = LIST_ITEM.exec(line)
  if (!match) return null
  const [, indent = '', marker = '-', space = ' ', task, content = ''] = match
  if (content.trim() === '' && state.start === end) {
    // Empty item: drop it and leave the list.
    const before = state.text.slice(0, start).replace(/\n$/, '')
    return { text: before + state.text.slice(end), start: before.length, end: before.length, exit: true }
  }
  const numbered = /^(\d+)([.)])$/.exec(marker)
  const nextMarker = numbered ? `${Number(numbered[1]) + 1}${numbered[2]}` : marker
  const prefix = `\n${indent}${nextMarker}${space}${task ? '[ ] ' : ''}`
  const text = state.text.slice(0, state.start) + prefix + state.text.slice(state.start)
  const cursor = state.start + prefix.length
  return { text, start: cursor, end: cursor }
}

/** Tab / Shift+Tab in lists: indents or outdents the current line by two spaces. */
export function indentLine(state: TextState, outdent: boolean): TextState | null {
  const { start, line } = lineAt(state.text, state.start)
  if (!LIST_ITEM.test(line)) return null
  if (outdent) {
    const remove = line.startsWith('  ') ? 2 : line.startsWith(' ') ? 1 : 0
    if (!remove) return state
    return {
      text: state.text.slice(0, start) + line.slice(remove) + state.text.slice(start + line.length),
      start: Math.max(start, state.start - remove),
      end: Math.max(start, state.end - remove),
    }
  }
  return {
    text: `${state.text.slice(0, start)}  ${state.text.slice(start)}`,
    start: state.start + 2,
    end: state.end + 2,
  }
}

/** Wraps the selection with markers (bold, italic, code, wiki link …); toggles if already wrapped. */
export function wrapSelection(state: TextState, before: string, after = before): TextState {
  const { text, start, end } = state
  const selected = text.slice(start, end)
  if (text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
    return {
      text: text.slice(0, start - before.length) + selected + text.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    }
  }
  return {
    text: text.slice(0, start) + before + selected + after + text.slice(end),
    start: start + before.length,
    end: end + before.length,
  }
}

/**
 * Detects an active trigger before the cursor: "/query" at line start or after whitespace,
 * or "[[query" for page links. Returns the range to replace.
 */
export function activeTrigger(
  state: TextState,
): { kind: 'slash' | 'link'; query: string; from: number } | null {
  if (state.start !== state.end) return null
  const before = state.text.slice(0, state.start)
  const link = /\[\[([^\]\n[]*)$/.exec(before)
  if (link) return { kind: 'link', query: link[1]!, from: state.start - link[0].length }
  const slash = /(?:^|\s)\/([\p{L}\p{N}-]*)$/u.exec(before)
  if (slash && blockType(state.text) !== 'code')
    return { kind: 'slash', query: slash[1]!, from: state.start - slash[1]!.length - 1 }
  return null
}

/** Replaces text[from, cursor) with `insert`; `|` inside insert marks the new cursor position. */
export function replaceRange(state: TextState, from: number, insert: string): TextState {
  const cursorMark = insert.indexOf('|')
  const clean = cursorMark === -1 ? insert : insert.slice(0, cursorMark) + insert.slice(cursorMark + 1)
  const text = state.text.slice(0, from) + clean + state.text.slice(state.end)
  const cursor = from + (cursorMark === -1 ? clean.length : cursorMark)
  return { text, start: cursor, end: cursor }
}

/** Types whose Enter key inserts a newline instead of starting a new block. */
export function isMultilineBlock(text: string): boolean {
  const type = blockType(text)
  if (type === 'code' || type === 'widget' || type === 'math') {
    // An unfinished fence/math block keeps Enter as newline; a finished one too.
    return true
  }
  return type === 'table' || type === 'html' || type === 'quote' || type === 'callout'
}

/** Splits a block at the cursor (Enter at the end of a paragraph/heading). */
export function splitAt(state: TextState): { before: string; after: string } {
  return {
    before: state.text.slice(0, state.start).trimEnd(),
    after: state.text.slice(state.end).trimStart(),
  }
}

/** Counts words for the page footer. */
export function wordCount(markdown: string): number {
  return (markdown.replace(/```[\s\S]*?```/g, ' ').match(/[\p{L}\p{N}]+/gu) ?? []).length
}
