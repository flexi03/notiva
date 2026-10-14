import { useRef, useState, type PointerEvent } from 'react'
import { StickyNote } from 'lucide-react'
import { t } from '@/i18n'
import { newAnnotationId, type Annotation, type AnnotationColor } from '@/lib/annotations'
import { cx } from '@/components/ui'

export type Tool = 'select' | 'pen' | 'note' | 'erase'

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
  activeId: string | null
}) {
  const svg = useRef<SVGSVGElement>(null)
  const [stroke, setStroke] = useState<Array<[number, number]> | null>(null)
  const mine = annotations.filter((a) => a.page === page)

  const point = (e: PointerEvent): [number, number] => {
    const box = svg.current!.getBoundingClientRect()
    return [(e.clientX - box.left) / scale, (e.clientY - box.top) / scale]
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (tool === 'pen') {
      e.currentTarget.setPointerCapture(e.pointerId)
      setStroke([point(e)])
    } else if (tool === 'note' && e.target === e.currentTarget) {
      const [x, y] = point(e)
      const id = newAnnotationId()
      onAdd({ id, type: 'note', page, x, y, text: '', color })
      onOpen(id)
    }
  }

  const capture = tool === 'pen' || tool === 'note'
  return (
    <svg
      ref={svg}
      aria-hidden={tool === 'select' ? undefined : true}
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
