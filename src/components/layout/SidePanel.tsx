import type { ReactNode } from 'react'
import { ArrowLeftToLine, ArrowRightToLine, X } from 'lucide-react'
import { useApp, type ViewId } from '@/app/store'
import { t } from '@/i18n'
import { cx, IconButton } from '@/components/ui'

/**
 * Frame of a view in a side bar (left instead of the page tree, or right): header with title,
 * actions, "move to the other side" and close, scrolling body.
 */
export function SidePanel({
  view,
  title,
  icon,
  actions,
  children,
  footer,
}: {
  view: ViewId
  title: ReactNode
  icon: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const side = useApp((s) => s.viewSides[view])
  const closeView = useApp((s) => s.closeView)
  const moveView = useApp((s) => s.moveView)
  const label = typeof title === 'string' ? title : undefined
  const other = side === 'left' ? 'right' : 'left'
  return (
    <aside
      aria-label={label}
      data-side={side}
      className={cx(
        'no-print flex h-full w-full flex-col bg-surface',
        side === 'right' &&
          'border-l border-line max-[899px]:fixed max-[899px]:inset-0 max-[899px]:z-30 min-[900px]:w-[26rem] min-[900px]:shrink-0',
      )}
    >
      <header data-titlebar className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="ml-1.5 text-accent" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">{title}</h2>
        {actions}
        <IconButton
          label={side === 'left' ? t('views.moveRight') : t('views.moveLeft')}
          onClick={() => moveView(view, other)}
          className="max-[899px]:hidden"
        >
          {side === 'left' ? <ArrowRightToLine size={16} /> : <ArrowLeftToLine size={16} />}
        </IconButton>
        <IconButton label={t('common.close')} onClick={() => closeView(view)}>
          <X size={17} />
        </IconButton>
      </header>
      {children}
      {footer}
    </aside>
  )
}
