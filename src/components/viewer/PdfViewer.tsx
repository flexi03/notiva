import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react'
import type { PDFDocumentProxy } from '@/lib/pdfjs'
import { pdfjs } from '@/lib/pdfjs'
import { scrollIntoContainer } from '@/lib/scroll'

export interface PdfViewerHandle {
  scrollToPage(page: number, smooth?: boolean): void
  /** The scrolling element (to remember and restore the position). */
  element(): HTMLDivElement | null
  /** the element holding all pages (for a quick CSS zoom while pinching) */
  content(): HTMLDivElement | null
}

interface PageSize {
  width: number
  height: number
}

/**
 * Continuous PDF view: every page as a canvas plus pdf.js' text layer (selectable text). Pages
 * render only near the viewport. `overlay` draws on top of a page (highlights, notes, ink) in page
 * coordinates scaled to the shown size.
 */
export const PdfViewer = forwardRef<
  PdfViewerHandle,
  {
    doc: PDFDocumentProxy
    /** 1 = fit to width */
    zoom: number
    onPage?: (page: number) => void
    overlay?: (page: number, size: PageSize, scale: number) => ReactNode
    /** Extra class for the scroll container. */
    className?: string
    label: string
  }
>(function PdfViewer({ doc, zoom, onPage, overlay, className, label }, ref) {
  const scroller = useRef<HTMLDivElement>(null)
  const [sizes, setSizes] = useState<PageSize[] | null>(null)
  const [width, setWidth] = useState(800)

  // Page sizes (in PDF points) – needed up front so the scroll height is right.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const list: PageSize[] = []
      for (let n = 1; n <= doc.numPages; n++) {
        const page = await doc.getPage(n)
        const vp = page.getViewport({ scale: 1 })
        list.push({ width: vp.width, height: vp.height })
      }
      if (!cancelled) setSizes(list)
    })()
    return () => {
      cancelled = true
    }
  }, [doc])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const observer = new ResizeObserver(() => setWidth(el.clientWidth))
    observer.observe(el)
    setWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const maxWidth = sizes ? Math.max(...sizes.map((s) => s.width)) : 600
  const scale = (Math.max(200, width - 32) / maxWidth) * zoom

  useImperativeHandle(ref, () => ({
    element: () => scroller.current,
    content: () => (scroller.current?.firstElementChild as HTMLDivElement | null) ?? null,
    scrollToPage(page, smooth = false) {
      const el = scroller.current?.querySelector<HTMLElement>(`[data-page="${page}"]`)
      scrollIntoContainer(el, 'start', smooth ? 'smooth' : 'auto')
    },
  }))

  // Current page = the one covering the middle of the viewport.
  useEffect(() => {
    const el = scroller.current
    if (!el || !onPage) return
    let last = 0
    const update = () => {
      const middle = el.getBoundingClientRect().top + el.clientHeight / 3
      for (const pageEl of el.querySelectorAll<HTMLElement>('[data-page]')) {
        const box = pageEl.getBoundingClientRect()
        if (box.top <= middle && box.bottom >= middle) {
          const n = Number(pageEl.dataset.page)
          if (n !== last) onPage((last = n))
          return
        }
      }
    }
    el.addEventListener('scroll', update, { passive: true })
    update()
    return () => el.removeEventListener('scroll', update)
  }, [onPage, sizes])

  return (
    <div
      ref={scroller}
      role="document"
      aria-label={label}
      tabIndex={0}
      className={className ?? 'h-full overflow-auto bg-sunken'}
    >
      {/* w-max: zoomed in wider than the window, the left edge stays reachable. */}
      <div className="flex w-max min-w-full flex-col items-center gap-4 px-4 py-4">
        {sizes?.map((size, i) => (
          <PdfPage key={i} doc={doc} number={i + 1} size={size} scale={scale} root={scroller}>
            {overlay?.(i + 1, { width: size.width * scale, height: size.height * scale }, scale)}
          </PdfPage>
        ))}
      </div>
    </div>
  )
})

function PdfPage({
  doc,
  number,
  size,
  scale,
  root,
  children,
}: {
  doc: PDFDocumentProxy
  number: number
  size: PageSize
  scale: number
  root: React.RefObject<HTMLDivElement | null>
  children?: ReactNode
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const text = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = box.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setVisible(!!entry?.isIntersecting), {
      root: root.current,
      rootMargin: '800px 0px',
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [root])

  useEffect(() => {
    if (!visible) return
    let cancelled = false
    let task: { cancel(): void; promise: Promise<void> } | null = null
    void (async () => {
      const lib = await pdfjs()
      const page = await doc.getPage(number)
      if (cancelled || !canvas.current || !text.current) return
      const viewport = page.getViewport({ scale })
      const ratio = Math.min(window.devicePixelRatio || 1, 3)
      // Draw off-screen and swap when done: while zooming, the old image stays (stretched) instead
      // of a blank page.
      const off = document.createElement('canvas')
      off.width = Math.floor(viewport.width * ratio)
      off.height = Math.floor(viewport.height * ratio)
      task = page.render({
        canvas: off,
        viewport,
        transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
      })
      const ok = await task.promise.then(
        () => true,
        () => false,
      )
      if (cancelled || !ok || !canvas.current || !text.current) return
      const c = canvas.current
      c.width = off.width
      c.height = off.height
      c.getContext('2d')?.drawImage(off, 0, 0)
      text.current.replaceChildren()
      const layer = new lib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: text.current,
        viewport,
      })
      await layer.render().catch(() => undefined)
    })()
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [visible, doc, number, scale])

  const width = size.width * scale
  const height = size.height * scale
  return (
    <div
      ref={box}
      data-page={number}
      data-scale={scale}
      className="relative shrink-0 bg-white shadow-[var(--shadow-pop)]"
      style={{
        width,
        height,
        ['--scale-factor' as string]: scale,
        ['--total-scale-factor' as string]: scale,
      }}
    >
      <canvas ref={canvas} aria-hidden className="absolute inset-0" style={{ width, height }} />
      <div ref={text} className="textLayer" />
      {children}
    </div>
  )
}
