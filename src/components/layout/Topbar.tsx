import { useRef, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  ChevronRight,
  Copy,
  File,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  MoreHorizontal,
  PanelLeft,
  Sparkles,
  Star,
} from 'lucide-react'
import { gitAvailable, useGit } from '@/app/git'
import { unreadCount, useNotifications } from '@/app/notifications'
import { saveAllNow, useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { t } from '@/i18n'
import { cx, IconButton, MenuList, Popover, type MenuItem } from '@/components/ui'
import { electronBridge } from '@/lib/vault'
import { pageMenuItems } from './pageMenu'

/** Top bar: sidebar toggle, breadcrumbs, page actions. */
export function Topbar({ title, actions }: { title?: string; actions?: ReactNode }) {
  const ws = useWorkspace()
  const { route, sidebarOpen, setSidebar } = useApp()
  const pageActions = usePageActions(ws)
  const [menu, setMenu] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const page = route.name === 'page' ? ws.get(route.path) : undefined
  const currentPath = page?.path ?? (route.name === 'file' ? route.path : null)
  // Every folder above the open page or file (PDFs too) – like the Finder's path bar.
  const crumbs = currentPath ? ws.breadcrumbs(currentPath) : []
  const [editing, setEditing] = useState<string | null>(null)

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
      <IconButton
        label={t('nav.back')}
        title={`${t('nav.back')} (⌘[)`}
        onClick={() => history.back()}
        className="max-sm:hidden"
      >
        <ArrowLeft size={16} />
      </IconButton>
      <IconButton
        label={t('nav.forward')}
        title={`${t('nav.forward')} (⌘])`}
        onClick={() => history.forward()}
        className="max-sm:hidden"
      >
        <ArrowRight size={16} />
      </IconButton>
      {editing !== null ? (
        <PathField initial={editing} onDone={() => setEditing(null)} />
      ) : (
        <ol
          className="flex min-w-0 flex-1 cursor-text items-center gap-0.5 text-[14px] text-ink-2"
          aria-label="Breadcrumb"
          title={currentPath ? t('path.hint') : undefined}
          onClick={(e) => {
            // A click beside the crumbs (or on the current name): the whole path, to copy or edit.
            if (currentPath && (e.target === e.currentTarget || (e.target as HTMLElement).dataset.current))
              setEditing(currentPath)
          }}
        >
          {crumbs.map((c) => (
            <li key={c.folder} className="flex min-w-0 items-center gap-0.5 max-sm:hidden">
              <FolderCrumb folder={c.folder} title={c.title} page={c.path} />
              <ChevronRight size={13} className="shrink-0 text-ink-3" />
            </li>
          ))}
          <li className="min-w-0 truncate px-1.5 font-semibold text-ink" data-current="1">
            {page?.title ?? title}
          </li>
          {page && <GitChip path={page.path} />}
        </ol>
      )}
      <UnsavedButton />
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

/**
 * One folder of the path: a click shows what it holds (open one directly), its page, the Finder and
 * the folder path to copy.
 */
function FolderCrumb({ folder, title, page }: { folder: string; title: string; page: string | null }) {
  const ws = useWorkspace()
  const { openPage, navigate, showToast } = useApp()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  const code = electronBridge()?.code
  const items: Array<MenuItem | 'divider'> = [
    ...ws.folderEntries(folder).map((n) => ({
      label: n.title,
      icon: n.file ? <FileText size={14} /> : n.page ? <File size={14} /> : <Folder size={14} />,
      onSelect: () =>
        n.page ? openPage(n.page.path) : n.file ? navigate({ name: 'file', path: n.file }) : undefined,
      disabled: !n.page && !n.file,
    })),
    'divider',
    ...(page
      ? [{ label: t('path.openPage'), icon: <File size={14} />, onSelect: () => openPage(page) }]
      : []),
    ...(code
      ? [
          {
            label: t('tree.showInFolder'),
            icon: <FolderOpen size={14} />,
            onSelect: () => void code.open(folder, 'finder'),
          },
        ]
      : []),
    {
      label: t('path.copyFolder'),
      icon: <Copy size={14} />,
      onSelect: () => void navigator.clipboard.writeText(folder).then(() => showToast(t('path.copied'))),
    },
  ]
  return (
    <>
      <button
        ref={ref}
        type="button"
        title={folder}
        aria-haspopup="menu"
        className="truncate rounded px-1.5 py-0.5 hover:bg-hover hover:text-ink"
        onClick={() => setOpen((o) => !o)}
      >
        {title}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label={folder}>
        <MenuList items={items} onDone={() => setOpen(false)} />
      </Popover>
    </>
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

/** Autosave off: shows how many pages wait for saving – click (or ⌘S) saves them. */
function UnsavedButton() {
  const ws = useWorkspace()
  const count = ws.autosave ? 0 : ws.unsaved().length
  if (!count) return null
  return (
    <button
      type="button"
      onClick={() => void saveAllNow()}
      title={t('autosave.shortcut')}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--git-modified)] px-2.5 py-0.5 text-[12.5px] font-semibold text-[var(--git-modified)] hover:bg-hover"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-[var(--git-modified)]" />
      {t('autosave.unsaved', { count })}
    </button>
  )
}

/** The whole path of the open page or file: copy it, or type another one and open it (Enter). */
function PathField({ initial, onDone }: { initial: string; onDone: () => void }) {
  const ws = useWorkspace()
  const [value, setValue] = useState(initial)
  const [copied, setCopied] = useState(false)
  const open = () => {
    const raw = value.trim().replace(/^\/+/, '')
    const target = ws.get(raw)
      ? raw
      : ws.get(`${raw}.md`)
        ? `${raw}.md`
        : ws.has(raw)
          ? raw
          : ws.resolveLink(raw)
    if (target) {
      useApp.getState().openPage(target)
      onDone()
    } else useApp.getState().showToast(t('path.notFound', { path: raw }))
  }
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1" data-testid="path-field">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          if (!e.relatedTarget?.closest('[data-testid="path-field"]')) onDone()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') open()
          if (e.key === 'Escape') onDone()
        }}
        aria-label={t('path.label')}
        className="h-7 min-w-0 flex-1 rounded-control border border-line bg-surface px-2 font-code text-[12.5px] outline-none focus:border-accent"
      />
      <button
        type="button"
        className="rounded-control px-2 py-1 text-[12px] font-semibold text-accent hover:bg-hover"
        onClick={() =>
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          })
        }
      >
        {copied ? t('path.copied') : t('path.copy')}
      </button>
    </div>
  )
}
