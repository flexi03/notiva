import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { StickyNote } from 'lucide-react'
import { t } from '@/i18n'
import { newAnnotationId, type Annotation, type AnnotationColor } from '@/lib/annotations'
import { cx } from '@/components/ui'

export type Tool = 'select' | 'text' | 'pen' | 'note' | 'erase'

/** Darker shades for text written on the page (yellow text on white would be unreadable). */
export const TEXT_COLORS: Record<AnnotationColor, string> = {
  yellow: '#a16207',
  green: '#15803d',
  blue: '#1d4ed8',
  pink: '#be185d',
  red: '#dc2626',
}

export const COLOR_VALUES: Record<AnnotationColor, string> = {
  yellow: '#facc15',
  green: '#4ade80',
  blue: '#60a5fa',
  pink: '#f472b6',
  red: '#ef4444',
}

/**
 * Annotations of one page as SVG in PDF points. In "select" mode it lets clicks through to the
 * text layer (so text stays selectable); pen, note and eraser capture the pointer.
 */
export function AnnotationLayer({
  page,
  size,
  scale,
  annotations,
  tool,
  color,
  onAdd,
  onRemove,
  onOpen,
  onUpdate,
  activeId,
}: {
  page: number
  size: { width: number; height: number }
  scale: number
  annotations: Annotation[]
  tool: Tool
  color: AnnotationColor
  onAdd: (a: Annotation) => void
  onRemove: (id: string) => void
  onOpen: (id: string) => void
  onUpdate: (id: string, patch: Partial<Annotation>) => void
  activeId: string | null
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [stroke, setStroke] = useState<Array<[number, number]> | null>(null)
  /** A text box being written: a new one (`id` null) or an existing one. */
  const [editing, setEditing] = useState<{ id: string | null; x: number; y: number } | null>(null)
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null)
  const [dragPos, setDragPos] = useState<{ id: string; x: number; y: number } | null>(null)
  const mine = annotations.filter((a) => a.page === page)

  const point = (e: PointerEvent): [number, number] => {
    const box = svg.current!.getBoundingClientRect()
    return [(e.clientX - box.left) / scale, (e.clientY - box.top) / scale]
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (tool === 'pen') {
      e.currentTarget.setPointerCapture(e.pointerId)
      setStroke([point(e)])
    } else if (tool === 'text' && e.target === e.currentTarget) {
      const [x, y] = point(e)
      e.preventDefault()
      setEditing({ id: null, x, y: y - 8 })
    } else if (tool === 'note' && e.target === e.currentTarget) {
      const [x, y] = point(e)
      const id = newAnnotationId()
      onAdd({ id, type: 'note', page, x, y, text: '', color })
      onOpen(id)
    }
  }

  const capture = tool === 'pen' || tool === 'note' || tool === 'text'

  const finishText = (value: string) => {
    const text = value.trim()
    const current = editing
    setEditing(null)
    if (!current) return
    if (current.id === null) {
      if (text)
        onAdd({
          id: newAnnotationId(),
          type: 'text',
          page,
          x: current.x,
          y: current.y,
          w: 220,
          size: 12,
          text,
          color,
        })
    } else if (!text) onRemove(current.id)
    else onUpdate(current.id, { text })
  }

  /** Text boxes can be dragged; a click without moving edits them. */
  const startDrag = (e: PointerEvent<HTMLDivElement>, a: Extract<Annotation, { type: 'text' }>) => {
    if (tool === 'erase') return onRemove(a.id)
    if (tool === 'pen' || tool === 'note') return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const [px, py] = point(e)
    drag.current = { id: a.id, dx: px - a.x, dy: py - a.y }
  }
  const moveDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const [px, py] = point(e)
    setDragPos({ id: drag.current.id, x: px - drag.current.dx, y: py - drag.current.dy })
  }
  const endDrag = (a: Extract<Annotation, { type: 'text' }>) => {
    const started = drag.current
    drag.current = null
    if (started && dragPos?.id === a.id && Math.hypot(dragPos.x - a.x, dragPos.y - a.y) > 2)
      onUpdate(a.id, { x: dragPos.x, y: dragPos.y })
    else if (started) setEditing({ id: a.id, x: a.x, y: a.y })
    setDragPos(null)
  }
  return (
    <svg
      ref={svg}
      className={cx(
        'absolute inset-0 z-[2]',
        capture ? 'cursor-crosshair touch-none' : 'pointer-events-none',
      )}
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width / scale} ${size.height / scale}`}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => stroke && setStroke([...stroke, point(e)])}
      onPointerUp={() => {
        if (stroke && stroke.length > 1)
          onAdd({ id: newAnnotationId(), type: 'ink', page, color, width: 2, points: simplify(stroke) })
        setStroke(null)
      }}
      data-testid={`annotations-${page}`}
    >
      {mine.map((a) => {
        const erase =
          tool === 'erase'
            ? { onClick: () => onRemove(a.id), className: 'cursor-pointer pointer-events-auto' }
            : {}
        if (a.type === 'highlight')
          return (
            <g key={a.id} data-annotation={a.id} {...erase} style={{ mixBlendMode: 'multiply' }}>
              {a.rects.map(([x, y, w, h], i) => (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  rx={1.5}
                  fill={COLOR_VALUES[a.color]}
                  fillOpacity={a.id === activeId ? 0.6 : 0.4}
                />
              ))}
            </g>
          )
        if (a.type === 'ink')
          return (
            <polyline
              key={a.id}
              data-annotation={a.id}
              {...erase}
              points={a.points.map((p) => p.join(',')).join(' ')}
              fill="none"
              stroke={COLOR_VALUES[a.color]}
              strokeWidth={tool === 'erase' ? Math.max(a.width, 8) : a.width}
              strokeOpacity={tool === 'erase' ? 0.6 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )
        if (a.type === 'text') {
          if (editing?.id === a.id) return null
          const pos = dragPos?.id === a.id ? dragPos : a
          return (
            <foreignObject
              key={a.id}
              x={pos.x}
              y={pos.y}
              width={a.w}
              height={2000}
              className="overflow-visible"
            >
              <div
                data-annotation={a.id}
                data-testid="text-annotation"
                role="button"
                tabIndex={0}
                aria-label={t('viewer.textBox', { text: a.text })}
                onPointerDown={(e) => startDrag(e, a)}
                onPointerMove={moveDrag}
                onPointerUp={() => endDrag(a)}
                onKeyDown={(e) => e.key === 'Enter' && setEditing({ id: a.id, x: a.x, y: a.y })}
                className={cx(
                  'pointer-events-auto w-fit max-w-full cursor-move rounded-[2px] px-[2px] whitespace-pre-wrap hover:outline hover:outline-1 hover:outline-dashed',
                  a.id === activeId && 'outline outline-1 outline-dashed',
                )}
                style={{
                  color: TEXT_COLORS[a.color],
                  fontSize: a.size,
                  lineHeight: 1.25,
                  fontFamily: 'var(--font-ui)',
                  outlineColor: TEXT_COLORS[a.color],
                }}
              >
                {a.text}
              </div>
            </foreignObject>
          )
        }
        return (
          <foreignObject
            key={a.id}
            x={a.x - 9}
            y={a.y - 9}
            width={18}
            height={18}
            className="overflow-visible"
          >
            <button
              type="button"
              data-annotation={a.id}
              aria-label={t('viewer.noteAt', { text: a.text || t('viewer.emptyNote') })}
              title={a.text}
              onClick={() => (tool === 'erase' ? onRemove(a.id) : onOpen(a.id))}
              className={cx(
                'pointer-events-auto flex size-[18px] items-center justify-center rounded-[4px] shadow-sm',
                a.id === activeId && 'ring-2 ring-accent',
              )}
              style={{ background: COLOR_VALUES[a.color] }}
            >
              <StickyNote size={11} className="text-black/70" />
            </button>
          </foreignObject>
        )
      })}
      {editing && (
        <foreignObject x={editing.x} y={editing.y} width={240} height={400} className="overflow-visible">
          <TextBoxEditor
            initial={editing.id ? textOf(mine, editing.id) : ''}
            color={TEXT_COLORS[mine.find((a) => a.id === editing.id)?.color ?? color]}
            onDone={finishText}
          />
        </foreignObject>
      )}
      {stroke && (
        <polyline
          points={stroke.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke={COLOR_VALUES[color]}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

/** Drops points closer than 1pt to the previous one – keeps ink small in the file. */
function simplify(points: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= 1) out.push(p)
  }
  return out
}

function textOf(list: Annotation[], id: string): string {
  const a = list.find((x) => x.id === id)
  return a && a.type === 'text' ? a.text : ''
}

function TextBoxEditor({
  initial,
  color,
  onDone,
}: {
  initial: string
  color: string
  onDone: (text: string) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    // After the click that placed the box: focus without the browser taking it back.
    const timer = setTimeout(() => ref.current?.focus(), 0)
    return () => clearTimeout(timer)
  }, [])
  return (
    <textarea
      ref={ref}
      defaultValue={initial}
      aria-label={t('viewer.textBoxInput')}
      placeholder={t('viewer.textBoxPlaceholder')}
      rows={Math.max(2, initial.split('\n').length + 1)}
      onBlur={(e) => onDone(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) e.currentTarget.blur()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto w-[220px] resize rounded-[3px] border border-dashed bg-white/90 p-1 outline-none"
      style={{ color, borderColor: color, fontSize: 12, lineHeight: 1.25, fontFamily: 'var(--font-ui)' }}
    />
  )
}
