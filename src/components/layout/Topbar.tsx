import { useRef, useState, type ReactNode } from 'react'
import { ChevronRight, MoreHorizontal, PanelLeft, Sparkles, Star } from 'lucide-react'
import { useAssistant } from '@/app/assistant'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import { cx, IconButton, MenuList, Popover } from '@/components/ui'
import { pageMenuItems } from './pageMenu'

/** Top bar: sidebar toggle, breadcrumbs, page actions. */
export function Topbar({ title, actions }: { title?: string; actions?: ReactNode }) {
  const ws = useWorkspace()
  const { route, sidebarOpen, setSidebar, openPage } = useApp()
  const pageActions = usePageActions(ws)
  const [menu, setMenu] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const page = route.name === 'page' ? ws.get(route.path) : undefined
  const crumbs = page ? ws.breadcrumbs(page.path) : []

  return (
    <header
      data-titlebar
      className="no-print sticky top-0 z-20 flex h-12 items-center gap-1 border-b border-transparent bg-paper/90 px-2 backdrop-blur"
    >
      <IconButton
        label={t('nav.toggleSidebar')}
        onClick={() => setSidebar(!sidebarOpen)}
        active={sidebarOpen}
      >
        <PanelLeft size={17} />
      </IconButton>
      <ol className="flex min-w-0 flex-1 items-center gap-0.5 text-[14px] text-ink-2" aria-label="Breadcrumb">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-0.5 max-sm:hidden">
            {c.path ? (
              <button
                type="button"
                className="truncate rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink"
                onClick={() => openPage(c.path!)}
              >
                {c.title}
              </button>
            ) : (
              <span className="truncate px-1.5">{c.title}</span>
            )}
            <ChevronRight size={13} className="shrink-0 text-ink-3" />
          </li>
        ))}
        <li className="min-w-0 truncate px-1.5 font-semibold text-ink">{page?.title ?? title}</li>
      </ol>
      {actions}
      <AssistantToggle />
      {page && (
        <>
          <IconButton
            label={pageActions.isFavorite(page.path) ? t('page.unfavorite') : t('page.favorite')}
            onClick={() => pageActions.toggleFavorite(page.path)}
          >
            <Star size={16} className={cx(pageActions.isFavorite(page.path) && 'fill-marker text-ink')} />
          </IconButton>
          <IconButton ref={moreRef} label={t('common.more')} onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal size={17} />
          </IconButton>
          <Popover
            anchor={moreRef}
            open={menu}
            onClose={() => setMenu(false)}
            align="end"
            label={t('common.more')}
          >
            <MenuList
              items={pageMenuItems(page.path, ws, pageActions, { print: true })}
              onDone={() => setMenu(false)}
            />
          </Popover>
        </>
      )}
    </header>
  )
}

function AssistantToggle() {
  const { open, setOpen } = useAssistant()
  return (
    <IconButton label={t('ai.toggle')} onClick={() => setOpen(!open)} active={open}>
      <Sparkles size={16} />
    </IconButton>
  )
}
