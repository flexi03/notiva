import { useEffect, useRef, type ReactNode } from 'react'
import { saveAllNow, useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { routeHash } from '@/lib/route'
import { cx, ErrorBoundary } from '@/components/ui'
import { Sidebar } from './Sidebar'
import { ToastHost } from './Toast'
import { ProgressHost } from './ProgressHost'
import { PromptHost } from './PromptHost'
import { PeekHost } from './PeekHost'
import { ScrollRootContext } from './scrollRoot'
import { useGitSync } from '@/app/git'
import { GitPanel } from '@/components/git/GitPanel'
import { DiffSheet } from '@/components/git/DiffView'
import { ActivityBar } from './ActivityBar'
import { AssistantPanel } from '@/components/ai/AssistantPanel'
import { MoodleImportDialog } from '@/components/moodle/MoodleImport'
import { NotificationPanel, openNotification } from '@/components/notifications/NotificationPanel'
import { taskReminders, useNotifications } from '@/app/notifications'
import type { Workspace } from '@/lib/workspace'
import { electronBridge } from '@/lib/vault'
import { moodleAvailable, useMoodle } from '@/app/moodle'
import { syncMaterials } from '@/app/materials'

/** Sidebar (drawer on small screens) + main area + global overlays and shortcuts. */
export function AppShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  const ws = useWorkspace()
  const { sidebarOpen, setSidebar, setSearch, setNewPage, route, rightPanel, leftView } = useApp()
  useGitSync()
  useNotificationSync(ws)
  // Unsaved changes (autosave off): ask before the window closes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (ws.unsaved().length) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [ws])
  useEffect(() => {
    if (!moodleAvailable()) return
    void useMoodle.getState().refresh()
    // After every Moodle check (also in the background): fresh data, new documents into the vault.
    return electronBridge()?.moodle?.onPolled(async () => {
      const snapshot = await electronBridge()!.moodle!.snapshot()
      if (!snapshot) return
      useMoodle.setState({ snapshot })
      if (useApp.getState().settings.moodleAutoSave) void syncMaterials(ws, snapshot).catch(() => undefined)
    })
  }, [ws])
  const actions = usePageActions(ws)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 's' && !e.shiftKey) {
        e.preventDefault()
        void saveAllNow()
      } else if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearch(true)
      } else if (mod && e.key.toLowerCase() === 'n' && !e.shiftKey) {
        e.preventDefault()
        setNewPage({ folder: '' })
      } else if (mod && e.key === '\\') {
        e.preventDefault()
        setSidebar(!useApp.getState().sidebarOpen)
      } else if (mod && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        useApp.getState().toggleView('assistant')
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault()
        useApp.getState().toggleView('git')
      } else if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        void actions.openToday()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearch, setNewPage, setSidebar, actions])

  return (
    <div className="flex h-full" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
      {sidebarOpen && (
        <div
          className="no-print fixed inset-0 z-30 bg-[rgb(10_14_20/0.35)] min-[900px]:hidden"
          onClick={() => setSidebar(false)}
          aria-hidden
        />
      )}
      <ActivityBar side="left" />
      {/* Desktop: collapsing shrinks the width (a negative margin would slide it over the bar). */}
      <div
        className={cx(
          'no-print z-30 h-full shrink-0 overflow-hidden transition-[width,transform] duration-200',
          sidebarOpen ? 'border-r border-line' : 'min-[900px]:w-0',
          sidebarOpen && (leftView ? 'w-[24rem]' : 'w-[17rem]'),
          leftView ? 'max-[899px]:w-[min(26rem,100vw)]' : 'max-[899px]:w-[17rem]',
          'max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:border-r max-[899px]:border-line max-[899px]:shadow-[var(--shadow-pop)]',
          sidebarOpen ? 'max-[899px]:translate-x-0' : 'max-[899px]:-translate-x-full',
        )}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        data-left-view={leftView ?? 'pages'}
      >
        <div className={cx('h-full', leftView ? 'w-[24rem] max-[899px]:w-[min(26rem,100vw)]' : 'w-[17rem]')}>
          <ErrorBoundary resetKey={leftView ?? 'pages'}>
            {leftView === 'assistant' ? (
              <AssistantPanel />
            ) : leftView === 'git' ? (
              <GitPanel />
            ) : leftView === 'notifications' ? (
              <NotificationPanel />
            ) : (
              <Sidebar />
            )}
          </ErrorBoundary>
        </div>
      </div>
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto" id="main" data-route={routeHash(route)}>
        <ScrollRootContext value={mainRef}>
          <ErrorBoundary resetKey={routeHash(route)}>{children}</ErrorBoundary>
        </ScrollRootContext>
      </main>
      <ErrorBoundary resetKey={rightPanel ?? ''}>
        {rightPanel === 'assistant' && <AssistantPanel />}
        {rightPanel === 'git' && <GitPanel />}
        {rightPanel === 'notifications' && <NotificationPanel />}
      </ErrorBoundary>
      <ActivityBar side="right" />
      <DiffSheet />
      <MoodleImportDialog />
      {overlays}
      <PeekHost />
      <PromptHost />
      <ToastHost />
      <ProgressHost />
    </div>
  )
}

/**
 * Keeps the notification center current: loads it, follows changes from the main process (Moodle
 * polling), reacts to clicked system banners and adds reminders for the vault's own tasks.
 */
function useNotificationSync(ws: Workspace): void {
  useEffect(() => {
    const store = useNotifications.getState()
    void store.load()
    const bridge = electronBridge()?.notifications
    const offChange = bridge?.onChange(() => void useNotifications.getState().load())
    const offOpen = bridge?.onOpen((id) => {
      useApp.getState().openView('notifications')
      const n = id ? useNotifications.getState().list.find((x) => x.id === id) : undefined
      if (n) openNotification(n, ws)
    })
    const remind = () => void useNotifications.getState().add(taskReminders(ws))
    remind()
    const timer = setInterval(remind, 30 * 60_000)
    return () => {
      offChange?.()
      offOpen?.()
      clearInterval(timer)
    }
  }, [ws])
}
