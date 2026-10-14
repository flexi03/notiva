import { useRef, useState, type ReactNode } from 'react'
import { Bell, ChevronRight, GitBranch, MoreHorizontal, PanelLeft, Sparkles, Star } from 'lucide-react'
import { gitAvailable, useGit } from '@/app/git'
import { unreadCount, useNotifications } from '@/app/notifications'
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
        {page && <GitChip path={page.path} />}
      </ol>
      {actions}
      <AssistantToggle />
      <GitToggle />
      <NotificationToggle />
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

/** On phones there is no activity bar: the assistant gets a button in the top bar. */
function AssistantToggle() {
  const open = useApp((s) => s.rightPanel === 'assistant' || (s.sidebarOpen && s.leftView === 'assistant'))
  const toggle = useApp((s) => s.toggleView)
  return (
    <IconButton
      label={t('ai.toggle')}
      onClick={() => toggle('assistant')}
      active={open}
      className="min-[900px]:hidden"
    >
      <Sparkles size={16} />
    </IconButton>
  )
}

/** "Geändert"/"Neu" next to the title when the page differs from the last commit. */
function GitChip({ path }: { path: string }) {
  const change = useGit((s) => s.state?.changes.find((c) => c.path === path))
  const showDiff = useGit((s) => s.showDiff)
  if (!change) return null
  const isNew = change.status === 'untracked' || change.status === 'added'
  return (
    <li className="shrink-0">
      <button
        type="button"
        onClick={() => showDiff({ path })}
        title={t('git.showDiff', { path })}
        className={cx(
          'rounded-full border px-2 py-0.5 text-[12px] font-semibold hover:bg-hover',
          isNew
            ? 'border-[var(--git-added)] text-[var(--git-added)]'
            : 'border-[var(--git-modified)] text-[var(--git-modified)]',
        )}
      >
        {isNew ? t('git.pageNew') : t('git.pageChanged')}
      </button>
    </li>
  )
}

function GitToggle() {
  const open = useApp((s) => s.rightPanel === 'git' || (s.sidebarOpen && s.leftView === 'git'))
  const toggle = useApp((s) => s.toggleView)
  if (!gitAvailable()) return null
  return (
    <IconButton
      label={t('git.toggle')}
      onClick={() => toggle('git')}
      active={open}
      className="min-[900px]:hidden"
    >
      <GitBranch size={16} />
    </IconButton>
  )
}

function NotificationToggle() {
  const open = useApp(
    (s) => s.rightPanel === 'notifications' || (s.sidebarOpen && s.leftView === 'notifications'),
  )
  const toggle = useApp((s) => s.toggleView)
  const unread = useNotifications((s) => unreadCount(s.list))
  return (
    <IconButton
      label={unread ? t('notify.toggleUnread', { count: unread }) : t('notify.toggle')}
      onClick={() => toggle('notifications')}
      active={open}
      className="relative min-[900px]:hidden"
    >
      <Bell size={16} />
      {unread > 0 && <span aria-hidden className="absolute top-1 right-1 size-2 rounded-full bg-accent" />}
    </IconButton>
  )
}
