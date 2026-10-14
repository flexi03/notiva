import MarkdownIt, {
  type MarkdownIt as Parser,
  type StateBlock,
  type StateCore,
  type StateInline,
} from 'markdown-it'
import DOMPurify from 'dompurify'
import katex from 'katex'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdownLang from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yamlLang from 'highlight.js/lib/languages/yaml'
import latex from 'highlight.js/lib/languages/latex'
import { parseWikiLink } from './links'

const LANGUAGES = {
  bash,
  c,
  cpp,
  css,
  java,
  javascript,
  json,
  markdown: markdownLang,
  python,
  sql,
  typescript,
  xml,
  yaml: yamlLang,
  latex,
}
for (const [name, lang] of Object.entries(LANGUAGES)) hljs.registerLanguage(name, lang)
hljs.registerAliases(['sh', 'zsh', 'shell'], { languageName: 'bash' })
hljs.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['tex'], { languageName: 'latex' })

export interface RenderEnv {
  /** Maps a wiki link target to a vault path, or null if the page does not exist. */
  resolveLink?: (target: string) => string | null
  /**
   * Content from outside the vault (AI answers): nothing may load from the network by itself –
   * a remote image URL could carry data out ("markdown image exfiltration").
   */
  untrusted?: boolean
}

export const CALLOUT_TYPES = [
  'note',
  'info',
  'tip',
  'success',
  'question',
  'warning',
  'danger',
  'example',
  'quote',
] as const
const CALLOUT_ALIASES: Record<string, (typeof CALLOUT_TYPES)[number]> = {
  hint: 'tip',
  important: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  caution: 'warning',
  attention: 'warning',
  error: 'danger',
  bug: 'danger',
  fail: 'danger',
  abstract: 'note',
  todo: 'info',
}

export function pageHref(path: string): string {
  return `#/p/${encodeURIComponent(path)}`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      output: 'html',
      trust: false,
      maxExpand: 500,
    })
  } catch {
    return `<code>${escapeHtml(tex)}</code>`
  }
}

/* ---------- inline rules ---------- */

function wikiLinkRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x5b || src.charCodeAt(pos + 1) !== 0x5b) return false
  const end = src.indexOf(']]', pos + 2)
  if (end === -1) return false
  const inner = src.slice(pos + 2, end)
  if (!inner.trim() || /[[\]\n]/.test(inner)) return false
  if (!silent) {
    const token = state.push('wikilink', '', 0)
    token.meta = { ...parseWikiLink(inner) }
  }
  state.pos = end + 2
  return true
}

const TAG_BODY = /^#([\p{L}_][\p{L}\p{N}_/-]*)/u
function tagRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x23) return false
  const before = pos === 0 ? ' ' : src[pos - 1]!
  if (!/[\s(,;]/.test(before)) return false
  const match = TAG_BODY.exec(src.slice(pos))
  if (!match) return false
  if (!silent) {
    const token = state.push('tag', '', 0)
    token.meta = { tag: match[1]! }
  }
  state.pos += match[0].length
  return true
}

function inlineMathRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x24 || src.charCodeAt(pos + 1) === 0x24) return false
  if (pos > 0 && src[pos - 1] === '\\') return false
  const next = src[pos + 1]
  if (!next || /\s/.test(next)) return false
  let end = pos + 1
  while ((end = src.indexOf('$', end)) !== -1) {
    if (src[end - 1] !== '\\') break
    end += 1
  }
  if (end === -1 || /\s/.test(src[end - 1]!) || /\d/.test(src[end + 1] ?? '')) return false
  if (!silent) {
    const token = state.push('math_inline', '', 0)
    token.content = src.slice(pos + 1, end)
  }
  state.pos = end + 1
  return true
}

/** ==highlight== → <mark> (the "Textmarker"). */
function markRule(state: StateInline, silent: boolean): boolean {
  const { src, pos } = state
  if (src.charCodeAt(pos) !== 0x3d || src.charCodeAt(pos + 1) !== 0x3d) return false
  const end = src.indexOf('==', pos + 2)
  if (end === -1 || end === pos + 2 || /\n/.test(src.slice(pos + 2, end))) return false
  if (!silent) {
    state.push('mark_open', 'mark', 1)
    const old = state.posMax
    state.pos = pos + 2
    state.posMax = end
    state.md.inline.tokenize(state)
    state.posMax = old
    state.push('mark_close', 'mark', -1)
  }
  state.pos = end + 2
  return true
}

/* ---------- block rules ---------- */

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const start = state.bMarks[startLine]! + state.tShift[startLine]!
  const firstLine = state.src.slice(start, state.eMarks[startLine])
  if (!firstLine.startsWith('$$')) return false
  if (silent) return true
  let content = firstLine.slice(2)
  let line = startLine
  let closed = content.trimEnd().endsWith('$$')
  if (closed) content = content.trimEnd().slice(0, -2)
  while (!closed && ++line < endLine) {
    const text = state.src.slice(state.bMarks[line]! + state.tShift[line]!, state.eMarks[line])
    if (text.trimEnd().endsWith('$$')) {
      content += `\n${text.trimEnd().slice(0, -2)}`
      closed = true
    } else content += `\n${text}`
  }
  state.line = line + 1
  const token = state.push('math_block', 'div', 0)
  token.content = content.trim()
  token.map = [startLine, state.line]
  return true
}

/* ---------- core rules ---------- */

function calloutRule(state: StateCore): void {
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i]!.type !== 'blockquote_open') continue
    const inline = tokens[i + 2]
    if (tokens[i + 1]?.type !== 'paragraph_open' || inline?.type !== 'inline') continue
    const match = /^\[!(\w+)\]([+-]?)[ \t]*([^\n]*)\n?/.exec(inline.content)
    if (!match) continue
    const raw = match[1]!.toLowerCase()
    const type = (CALLOUT_TYPES as readonly string[]).includes(raw) ? raw : (CALLOUT_ALIASES[raw] ?? 'note')
    tokens[i]!.meta = {
      callout: type,
      title: match[3] || raw.charAt(0).toUpperCase() + raw.slice(1),
      fold: match[2],
    }
    inline.content = inline.content.slice(match[0].length)
    if (inline.content.trim() === '') {
      tokens[i + 1]!.hidden = true
      tokens[i + 3]!.hidden = true
    }
  }
}

function taskListRule(state: StateCore): void {
  let index = 0
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!
    if (
      inline.type !== 'inline' ||
      tokens[i - 1]?.type !== 'paragraph_open' ||
      tokens[i - 2]?.type !== 'list_item_open'
    )
      continue
    const first = inline.children?.[0]
    const match = first?.type === 'text' ? /^\[([ xX])\]\s/.exec(first.content) : null
    if (!first || !match) continue
    first.content = first.content.slice(match[0].length)
    const box = new state.Token('task_checkbox', 'input', 0)
    const label = (inline.children ?? [])
      .map((c) => (c.type === 'text' || c.type === 'code_inline' ? c.content : ''))
      .join('')
      .trim()
    box.meta = { checked: match[1] !== ' ', index: index++, label }
    inline.children!.unshift(box)
    tokens[i - 2]!.attrJoin('class', 'task-item')
  }
}

function createParser(): Parser {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    highlight(code, lang) {
      const language = lang && hljs.getLanguage(lang) ? lang : null
      if (!language) return ''
      try {
        return hljs.highlight(code, { language, ignoreIllegals: true }).value
      } catch {
        return ''
      }
    },
  })
  md.inline.ruler.before('link', 'wikilink', wikiLinkRule)
  md.inline.ruler.push('tag', tagRule)
  md.inline.ruler.before('emphasis', 'mark', markRule)
  md.inline.ruler.after('escape', 'math_inline', inlineMathRule)
  md.block.ruler.before('fence', 'math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  })
  md.core.ruler.after('block', 'callout', calloutRule)
  md.core.ruler.after('inline', 'task_list', taskListRule)

  md.renderer.rules.wikilink = (tokens, idx, _opts, env) => {
    const { target, heading, label } = tokens[idx]!.meta as unknown as ReturnType<typeof parseWikiLink>
    const path = (env as RenderEnv | undefined)?.resolveLink?.(target) ?? null
    const text = escapeHtml(label ?? (heading ? `${target} › ${heading}` : target))
    const cls = path ? 'wikilink' : 'wikilink wikilink-missing'
    const href = path ? pageHref(path) : '#'
    return `<a class="${cls}" href="${escapeHtml(href)}" data-target="${escapeHtml(target)}">${text}</a>`
  }
  md.renderer.rules.tag = (tokens, idx) => {
    const tag = escapeHtml((tokens[idx]!.meta as { tag: string }).tag)
    return `<a class="tag" href="#/tag/${encodeURIComponent(tag.toLowerCase())}" data-tag="${tag.toLowerCase()}">#${tag}</a>`
  }
  md.renderer.rules.math_inline = (tokens, idx) => renderMath(tokens[idx]!.content, false)
  md.renderer.rules.math_block = (tokens, idx) =>
    `<div class="math-block">${renderMath(tokens[idx]!.content, true)}</div>\n`
  md.renderer.rules.task_checkbox = (tokens, idx) => {
    const { checked, index, label } = tokens[idx]!.meta as { checked: boolean; index: number; label: string }
    return `<input type="checkbox" class="task-checkbox" data-task-index="${index}" aria-label="${escapeHtml(label || 'Aufgabe')}"${checked ? ' checked' : ''}> `
  }

  const defaultBlockquote = md.renderer.rules.blockquote_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
  md.renderer.rules.blockquote_open = (tokens, idx, opts, env, self) => {
    const meta = tokens[idx]!.meta as { callout: string; title: string } | null
    if (!meta) return defaultBlockquote(tokens, idx, opts, env, self)
    return `<blockquote class="callout callout-${meta.callout}" data-callout="${meta.callout}"><div class="callout-title">${md.renderInline(meta.title, env)}</div>\n`
  }

  const defaultFence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    if (tokens[idx]!.info.trim().split(/\s+/)[0] === 'notiva')
      return '<div class="widget-placeholder" data-widget></div>\n'
    return defaultFence(tokens, idx, opts, env, self)
  }

  const defaultLink = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
  md.renderer.rules.link_open = (tokens, idx, opts, env, self) => {
    const href = String(tokens[idx]!.attrGet('href') ?? '')
    if (/^https?:|^mailto:/i.test(href)) {
      tokens[idx]!.attrSet('target', '_blank')
      tokens[idx]!.attrSet('rel', 'noopener noreferrer')
    }
    return defaultLink(tokens, idx, opts, env, self)
  }
  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'
  return md
}

const md = createParser()

/* ---------- sanitizing ---------- */

let hooksInstalled = false
/** Set while sanitizing untrusted HTML (sanitize is synchronous, so a flag is safe). */
let blockRemote = false
const REMOTE = /^\s*(https?:|\/\/)/i
function installHooks(): void {
  if (hooksInstalled) return
  hooksInstalled = true
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (blockRemote && ['IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK'].includes(node.tagName)) {
      if (REMOTE.test(node.getAttribute('src') ?? '') || REMOTE.test(node.getAttribute('poster') ?? '')) {
        node.remove()
        return
      }
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      if (/^https?:|^mailto:/i.test(href)) {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      } else node.removeAttribute('target')
    }
    if (node.tagName === 'INPUT' && node.getAttribute('type') !== 'checkbox') node.remove()
  })
}

const SANITIZE_CONFIG = {
  ADD_ATTR: ['target', 'data-target', 'data-tag', 'data-task-index', 'data-callout', 'data-widget'],
  ADD_TAGS: ['details', 'summary'],
  FORBID_TAGS: [
    'style',
    'form',
    'button',
    'textarea',
    'select',
    'iframe',
    'object',
    'embed',
    'base',
    'meta',
    'link',
    'script',
  ],
  FORBID_ATTR: ['srcset', 'action', 'formaction'],
  ALLOW_UNKNOWN_PROTOCOLS: false,
}

const UNTRUSTED_CONFIG = { ...SANITIZE_CONFIG, FORBID_ATTR: [...SANITIZE_CONFIG.FORBID_ATTR, 'style'] }

export function sanitizeHtml(html: string, untrusted = false): string {
  installHooks()
  blockRemote = untrusted
  try {
    return DOMPurify.sanitize(html, untrusted ? UNTRUSTED_CONFIG : SANITIZE_CONFIG) as unknown as string
  } finally {
    blockRemote = false
  }
}

/** Renders Markdown to sanitized HTML. Safe to inject with dangerouslySetInnerHTML. */
export function renderMarkdown(markdown: string, env: RenderEnv = {}): string {
  return sanitizeHtml(md.render(markdown, { ...env }), env.untrusted === true)
}

export function renderInlineMarkdown(markdown: string, env: RenderEnv = {}): string {
  return sanitizeHtml(md.renderInline(markdown, { ...env }))
}

export { toPlainText } from './plainText'
