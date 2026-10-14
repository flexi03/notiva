import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { IconButton } from '@/components/ui'

/** Frame of a view in the right side bar: header with title and actions, scrolling body. */
export function SidePanel({
  title,
  icon,
  actions,
  children,
  footer,
}: {
  title: ReactNode
  icon: ReactNode
  actions?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  const setRightPanel = useApp((s) => s.setRightPanel)
  const label = typeof title === 'string' ? title : undefined
  return (
    <aside
      aria-label={label}
      className="no-print flex h-full w-full flex-col border-l border-line bg-surface max-[899px]:fixed max-[899px]:inset-0 max-[899px]:z-30 min-[900px]:w-[26rem] min-[900px]:shrink-0"
    >
      <header data-titlebar className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        <span className="ml-1.5 text-accent" aria-hidden>
          {icon}
        </span>
        <h2 className="min-w-0 flex-1 truncate px-1 text-[14px] font-semibold">{title}</h2>
        {actions}
        <IconButton label={t('common.close')} onClick={() => setRightPanel(null)}>
          <X size={17} />
        </IconButton>
      </header>
      {children}
      {footer}
    </aside>
  )
}
