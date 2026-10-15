import { useState, type ReactNode } from 'react'
import { Bell, Files, GitBranch, Settings, Sparkles, Trash2 } from 'lucide-react'
import { unreadCount, useNotifications } from '@/app/notifications'
import { useGit } from '@/app/git'
import { SyncButton } from './SyncButton'
import { electronBridge } from '@/lib/vault'
import { isPlace, useApp, VIEWS, type Side, type ViewId } from '@/app/store'
import { t } from '@/i18n'
import { cx } from '@/components/ui'

const DRAG_TYPE = 'application/x-notiva-view'

/** Label, shortcut label and icon of each movable view. */
export function viewInfo(view: ViewId): { label: string; icon: (size: number) => ReactNode } {
  if (view === 'assistant') return { label: t('ai.toggle'), icon: (size) => <Sparkles size={size} /> }
  if (view === 'notifications') return { label: t('notify.toggle'), icon: (size) => <Bell size={size} /> }
  if (view === 'trash') return { label: t('nav.trash'), icon: (size) => <Trash2 size={size} /> }
  if (view === 'settings') return { label: t('nav.settings'), icon: (size) => <Settings size={size} /> }
  return { label: t('git.toggle'), icon: (size) => <GitBranch size={size} /> }
}

/**
 * Activity bar like VS Code's, on the left (pages + the views placed there) and on the right.
 * View icons can be dragged to the other bar; the side is remembered on this device.
 */
export function ActivityBar({ side }: { side: Side }) {
  const sides = useApp((s) => s.viewSides)
  const dragging = useApp((s) => s.draggingView)
  const moveView = useApp((s) => s.moveView)
  const [over, setOver] = useState(false)
  const views = VIEWS.filter((v) => sides[v] === side)
  const target = dragging !== null && sides[dragging] !== side
  // The right bar only exists when it holds something – or while a view is dragged to it.
  if (side === 'right' && views.length === 0 && !target) return null

  return (
    <nav
      aria-label={side === 'left' ? t('nav.activityLeft') : t('nav.activity')}
      data-activity={side}
      onDragOver={(e) => {
        if (!target || !e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        const view = e.dataTransfer.getData(DRAG_TYPE) as ViewId
        setOver(false)
        if (VIEWS.includes(view)) moveView(view, side)
      }}
      className={cx(
        'no-print flex w-11 shrink-0 flex-col items-center gap-1 bg-sunken py-2 transition-colors max-[899px]:hidden',
        side === 'left' ? 'border-r border-line' : 'border-l border-line',
        target &&
          'bg-[color-mix(in_srgb,var(--accent)_8%,var(--bg-sunken))] outline-2 -outline-offset-2 outline-dashed outline-[color-mix(in_srgb,var(--accent)_45%,transparent)]',
        target && over && 'bg-[color-mix(in_srgb,var(--accent)_18%,var(--bg-sunken))]',
      )}
    >
      {side === 'left' && <PagesItem />}
      {views.map((view) => (
        <ViewItem key={view} view={view} side={side} />
      ))}
      {/* Sync sits next to the notifications (desktop app). */}
      {electronBridge() && sides.notifications === side && <SyncButton />}
      {target && (
        <span className="mt-1 px-1 text-center text-[10px] leading-tight text-ink-3" aria-hidden>
          {t('views.dropHere')}
        </span>
      )}
    </nav>
  )
}

function PagesItem() {
  const active = useApp((s) => s.sidebarOpen && s.leftView === null)
  return (
    <BarButton
      label={t('nav.pages')}
      active={active}
      side="left"
      onClick={() => {
        const { sidebarOpen, leftView, setSidebar } = useApp.getState()
        if (sidebarOpen && leftView === null) setSidebar(false)
        else useApp.setState({ leftView: null, sidebarOpen: true })
      }}
    >
      <Files size={19} />
    </BarButton>
  )
}

function ViewItem({ view, side }: { view: ViewId; side: Side }) {
  const active = useApp((s) =>
    isPlace(view)
      ? s.route.name === view
      : (view === 'settings' || view === 'trash') && s.route.name === view
        ? true
        : side === 'left'
          ? s.sidebarOpen && s.leftView === view
          : s.rightPanel === view,
  )
  const toggle = useApp((s) => s.toggleView)
  const setDragging = useApp((s) => s.setDraggingView)
  const changes = useGit((s) => s.state?.changes.length ?? 0)
  const unread = useNotifications((s) => unreadCount(s.list))
  const { label, icon } = viewInfo(view)
  return (
    <BarButton
      label={label}
      title={`${label} – ${t('views.dragHint')}`}
      active={active}
      side={side}
      badge={view === 'git' ? changes : view === 'notifications' ? unread : 0}
      onClick={() => toggle(view)}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, view)
        e.dataTransfer.effectAllowed = 'move'
        // Defer: changing the DOM inside dragstart cancels the drag in Chromium.
        setTimeout(() => setDragging(view))
      }}
      onDragEnd={() => setDragging(null)}
    >
      {icon(19)}
    </BarButton>
  )
}

function BarButton({
  label,
  title,
  active,
  side,
  badge = 0,
  children,
  ...rest
}: {
  label: string
  title?: string
  active: boolean
  side: Side
  badge?: number
  children: ReactNode
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'>) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      aria-pressed={active}
      {...rest}
      className={cx(
        'relative flex size-9 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-hover hover:text-ink',
        active &&
          cx(
            'bg-surface text-accent',
            side === 'left'
              ? 'shadow-[inset_2px_0_0_var(--accent)]'
              : 'shadow-[inset_-2px_0_0_var(--accent)]',
          ),
      )}
    >
      {children}
      {badge > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-on-accent"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
