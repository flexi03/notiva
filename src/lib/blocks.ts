import MarkdownIt from 'markdown-it'

/**
 * The editor works on top-level Markdown blocks (paragraph, heading, list, code fence, …).
 * Each block keeps its exact source text, so editing never reformats untouched parts of a file.
 */

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list'
  | 'tasks'
  | 'quote'
  | 'callout'
  | 'code'
  | 'widget'
  | 'math'
  | 'table'
  | 'divider'
  | 'html'

export interface Block {
  id: string
  text: string
}

const parser = new MarkdownIt({ html: true })

let counter = 0
export function newBlockId(): string {
  counter += 1
  return `b${Date.now().toString(36)}${counter.toString(36)}`
}

/** Splits a Markdown body into top-level blocks using the parser's line map. */
export function splitBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n?/g, '\n').split('\n')
  const tokens = parser.parse(body, {})
  const ranges: Array<[number, number]> = []
  for (const token of tokens) {
    if (token.level !== 0 || !token.map || token.nesting === -1) continue
    const [start, end] = token.map
    const last = ranges[ranges.length - 1]
    // Nested opening tokens at level 0 never overlap, but guard anyway.
    if (last && start < last[1]) continue
    ranges.push([start, end])
  }
  // Display math ($$ … $$) is not core Markdown: merge the paragraphs it spans into one block.
  const blocks: Block[] = []
  for (const [start, end] of ranges) {
    const text = lines.slice(start, end).join('\n').trimEnd()
    if (text.trim() === '') continue
    const previous = blocks[blocks.length - 1]
    if (previous && isOpenMath(previous.text)) {
      previous.text = `${previous.text}\n\n${text}`
      continue
    }
    blocks.push({ id: newBlockId(), text })
  }
  return blocks
}

function isOpenMath(text: string): boolean {
  return text.trimStart().startsWith('$$') && (text.match(/\$\$/g) ?? []).length % 2 === 1
}

export function joinBlocks(blocks: Block[]): string {
  const parts = blocks.map((b) => b.text.trimEnd()).filter((t) => t.trim() !== '')
  return parts.length === 0 ? '' : `${parts.join('\n\n')}\n`
}

export function blockType(text: string): BlockType {
  const t = text.trimStart()
  if (/^#{1,6}\s/.test(t)) return 'heading'
  if (/^```notiva\b/.test(t)) return 'widget'
  if (/^(```|~~~)/.test(t)) return 'code'
  if (/^\$\$/.test(t)) return 'math'
  if (/^>\s*\[!\w+\]/.test(t)) return 'callout'
  if (/^>/.test(t)) return 'quote'
  if (/^[-*+]\s\[[ xX]\]\s/.test(t)) return 'tasks'
  if (/^([-*+]|\d+[.)])\s/.test(t)) return 'list'
  if (/^\|.*\|\s*\n\|[\s:|-]+\|/.test(t)) return 'table'
  if (/^([-*_])(\s*\1){2,}\s*$/.test(t)) return 'divider'
  if (/^<[a-zA-Z!]/.test(t)) return 'html'
  return 'paragraph'
}

/** Toggles the n-th task checkbox ("- [ ]" ↔ "- [x]") inside a block's source. */
export function toggleTask(text: string, index: number): string {
  let seen = -1
  return text.replace(/^(\s*[-*+]\s\[)([ xX])(\]\s)/gm, (full, open: string, mark: string, close: string) => {
    seen += 1
    if (seen !== index) return full
    return `${open}${mark === ' ' ? 'x' : ' '}${close}`
  })
}

/** Moves the block at `from` to position `to` (both indices in the original array). */
export function moveBlock<T>(blocks: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= blocks.length) return blocks
  const next = blocks.slice()
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item as T)
  return next
}

/** Done/total task checkboxes of a body (code blocks and widgets are not counted). */
export function taskProgress(body: string): { done: number; total: number } {
  let done = 0
  let total = 0
  for (const block of splitBlocks(body)) {
    const type = blockType(block.text)
    if (type === 'code' || type === 'widget' || type === 'math') continue
    for (const match of block.text.matchAll(/^\s*(?:>\s*)*[-*+]\s\[([ xX])\]\s/gm)) {
      total += 1
      if (match[1] !== ' ') done += 1
    }
  }
  return { done, total }
}
