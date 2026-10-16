import { memo, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { t } from '@/i18n'
import { useApp, useWorkspace } from '@/app/store'
import { renderMarkdown } from '@/lib/markdown'
import { dirname, isSafePath, joinPath, normalizePath } from '@/lib/path'
import { cx } from '@/components/ui'

interface MarkdownViewProps {
  markdown: string
  /** Path of the page (for relative links/images and link proximity). */
  from?: string
  className?: string
  onToggleTask?: (index: number) => void
  /** Content not from the vault (AI answers): remote media is not loaded. */
  untrusted?: boolean
}

const objectUrls = new Map<string, string>()

/** Rendered, sanitized Markdown with app navigation for wiki links, tags and vault images. */
export const MarkdownView = memo(function MarkdownView({
  markdown,
  from,
  className,
  onToggleTask,
  untrusted,
}: MarkdownViewProps) {
  const ws = useWorkspace()
  const { openPage, navigate } = useApp()
  const ref = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () =>
      renderMarkdown(markdown, {
        resolveLink: (target) => ws.resolveLink(target, from),
        ...(untrusted ? { untrusted } : {}),
      }),
    // ws.version: re-render when pages appear/disappear (missing links)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [markdown, from, ws, ws.version, untrusted],
  )

  // Vault images (relative paths) are loaded through the vault and shown as blob URLs.
  useEffect(() => {
    const root = ref.current
    if (!root) return
    for (const img of root.querySelectorAll<HTMLImageElement>('img')) {
      const src = img.getAttribute('src') ?? ''
      if (/^(https?:|data:|blob:)/i.test(src)) continue
      let decoded: string
      try {
        decoded = decodeURIComponent(src)
      } catch {
        continue
      }
      const path = normalizePath(
        decoded.startsWith('/') ? decoded : joinPath(from ? dirname(from) : '', decoded),
      )
      if (!isSafePath(path)) continue
      const cached = objectUrls.get(path)
      if (cached) {
        img.src = cached
        continue
      }
      void ws.vault
        .readBinary(path)
        .then((data) => {
          const type = path.endsWith('.svg') ? 'image/svg+xml' : undefined
          const url = URL.createObjectURL(new Blob([data as BlobPart], type ? { type } : {}))
          objectUrls.set(path, url)
          img.src = url
        })
        .catch(() => img.classList.add('opacity-40'))
    }
  }, [html, from, ws])

  // Code blocks get a copy button (e.g. SQL commands in notes next to a lab PDF).
  useEffect(() => {
    const root = ref.current
    if (!root) return
    for (const pre of root.querySelectorAll<HTMLPreElement>('pre')) {
      if (pre.querySelector('button[data-copy]')) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.copy = ''
      button.className = 'code-copy'
      button.title = t('editor.copyCode')
      button.setAttribute('aria-label', t('editor.copyCode'))
      button.textContent = t('editor.copy')
      pre.classList.add('relative')
      pre.append(button)
    }
  }, [html])

  const onClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    const copy = target.closest<HTMLButtonElement>('button[data-copy]')
    if (copy) {
      e.preventDefault()
      e.stopPropagation()
      const code = copy.parentElement?.querySelector('code') ?? copy.parentElement
      const text = Array.from(code?.childNodes ?? [])
        .filter((n) => !(n instanceof HTMLElement && n.dataset.copy !== undefined))
        .map((n) => n.textContent ?? '')
        .join('')
        .replace(/\n$/, '')
      const done = () => {
        copy.textContent = t('editor.copied')
        setTimeout(() => (copy.textContent = t('editor.copy')), 1500)
      }
      // Clipboard API, else the classic way (e.g. when the window has no focus permission).
      void (navigator.clipboard?.writeText(text) ?? Promise.reject(new Error('no clipboard')))
        .then(done)
        .catch(() => {
          const area = document.createElement('textarea')
          area.value = text
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.append(area)
          area.select()
          if (document.execCommand('copy')) done()
          area.remove()
        })
      return
    }
    const checkbox = target.closest<HTMLInputElement>('input.task-checkbox')
    if (checkbox) {
      e.preventDefault()
      e.stopPropagation()
      onToggleTask?.(Number(checkbox.dataset.taskIndex))
      return
    }
    const link = target.closest<HTMLAnchorElement>('a')
    if (!link) return
    if (link.classList.contains('wikilink')) {
      e.preventDefault()
      e.stopPropagation()
      const resolved = ws.resolveLink(link.dataset.target ?? '', from)
      if (resolved) openPage(resolved)
      // A missing file ("Blatt.pdf") never becomes a new, empty page.
      else if (
        /\.[a-z0-9]{1,8}$/i.test(link.dataset.target ?? '') &&
        !/\.md$/i.test(link.dataset.target ?? '')
      )
        useApp
          .getState()
          .showToast(t('link.fileMissing', { name: (link.dataset.target ?? '').split('/').pop() ?? '' }))
      else {
        const title = link.dataset.target ?? ''
        void ws.createPage({ folder: from ? dirname(from) : '', title }).then(openPage)
      }
    } else if (link.classList.contains('tag')) {
      e.preventDefault()
      e.stopPropagation()
      navigate({ name: 'tag', tag: link.dataset.tag ?? '' })
    } else {
      e.stopPropagation()
    }
  }

  return (
    <div
      ref={ref}
      className={cx('md', className)}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
