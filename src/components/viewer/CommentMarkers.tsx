import { MessageSquare } from 'lucide-react'
import type { Annotation } from '@/lib/annotations'
import { COLOR_VALUES } from './AnnotationLayer'
import { MarkdownView } from '@/components/editor/MarkdownView'
import { cx } from '@/components/ui'

/**
 * Comments of highlights on the page itself: a small flag at the right margin, at the height of the
 * marked text, connected to it by a line – it scrolls with the page. Click: open it in the panel;
 * the active one shows the whole (formatted) comment.
 */
export function CommentMarkers({
  page,
  size,
  scale,
  annotations,
  activeId,
  onOpen,
}: {
  page: number
  size: { width: number; height: number }
  scale: number
  annotations: Annotation[]
  activeId: string | null
  onOpen: (id: string) => void
}) {
  const comments = annotations.filter(
    (a): a is Extract<Annotation, { type: 'highlight' }> =>
      a.type === 'highlight' && a.page === page && !!a.comment?.trim() && a.rects.length > 0,
  )
  if (!comments.length) return null
  const flagWidth = Math.min(220, size.width * 0.32)
  return (
    <div className="pointer-events-none absolute inset-0 z-[3]" data-testid={`comments-${page}`}>
      <svg className="absolute inset-0" width={size.width} height={size.height} aria-hidden>
        {comments.map((a) => {
          const last = a.rects[a.rects.length - 1]!
          const x = (last[0] + last[2]) * scale
          const y = (last[1] + last[3] / 2) * scale
          return (
            <line
              key={a.id}
              x1={x}
              y1={y}
              x2={size.width - flagWidth - 6}
              y2={y}
              stroke={COLOR_VALUES[a.color]}
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          )
        })}
      </svg>
      {comments.map((a) => {
        const last = a.rects[a.rects.length - 1]!
        const y = (last[1] + last[3] / 2) * scale
        const active = a.id === activeId
        return (
          <button
            key={a.id}
            type="button"
            data-comment={a.id}
            onClick={() => onOpen(a.id)}
            style={{
              top: Math.max(0, y - 12),
              right: 4,
              width: flagWidth,
              borderLeftColor: COLOR_VALUES[a.color],
            }}
            className={cx(
              'pointer-events-auto absolute rounded-control border border-l-4 border-line bg-surface/95 px-2 py-1 text-left text-[11.5px] shadow-[var(--shadow-pop)]',
              active
                ? 'z-10 max-h-80 overflow-y-auto'
                : 'max-h-7 overflow-hidden opacity-90 hover:opacity-100',
            )}
          >
            {active ? (
              <MarkdownView markdown={a.comment!} untrusted className="md text-[12px]" />
            ) : (
              <span className="flex items-center gap-1 truncate">
                <MessageSquare size={11} className="shrink-0" aria-hidden />
                <span className="truncate">{a.comment!.replace(/[`*#>]/g, '').split('\n')[0]}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
