import type { CSSProperties } from 'react'
import { useEffect, useRef, type ReactNode } from 'react'
import { saveAllNow, useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { routeHash } from '@/lib/route'
import { cx, ErrorBoundary } from '@/components/ui'
import { Sidebar } from './Sidebar'
import { PromptHost } from './PromptHost'
import { PeekHost } from './PeekHost'
import { ScrollRootContext } from './scrollRoot'
import { useGitSync } from '@/app/git'
import { GitPanel } from '@/components/git/GitPanel'
import { DiffSheet } from '@/components/git/DiffView'
import { ActivityBar } from './ActivityBar'
import { AssistantPanel } from '@/components/ai/AssistantPanel'
import { MoodleImportDialog } from '@/components/moodle/MoodleImport'
import { SettingsPanel } from './SettingsPanel'
import { TextContextMenu } from './TextContextMenu'
import { EventBadge } from './EventBadge'
import { StatusBar } from './StatusBar'
import { ShelfPanel } from './ShelfPanel'
import { StudySyncDialog } from '@/components/study/StudySyncDialog'
import { NotificationPanel, openNotification } from '@/components/notifications/NotificationPanel'
import { taskReminders, useNotifications } from '@/app/notifications'
import type { Workspace } from '@/lib/workspace'
import { electronBridge } from '@/lib/vault'
import { moodleAvailable, useMoodle } from '@/app/moodle'
import { autoSyncStudy, setupHint } from '@/app/study'
import { announce } from '@/app/progress'
import { runCommand } from '@/app/commands'
import { ResizeHandle, useStoredWidth } from './ResizeHandle'
import { useRecent } from '@/app/recent'
import { t } from '@/i18n'
import type { NotificationKind } from '@/lib/notifications'
import { syncExamPlan } from '@/app/examPlan'
import { suggestMaterials } from '@/app/materials'
import { useEcampus } from '@/app/ecampus'
import { useUpdateNotices } from '@/app/update'

const saveNow = () => void saveAllNow()

/** Sidebar (drawer on small screens) + main area + global overlays and shortcuts. */
export function AppShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  const ws = useWorkspace()
  const { sidebarOpen, setSidebar, setSearch, setNewPage, route, rightPanel, leftView } = useApp()
  useGitSync()
  useNotificationSync(ws)
  useUpdateNotices()
  // Recently opened files (sidebar, module pages).
  useEffect(() => useRecent.getState().load(ws.vault.name), [ws])
  useEffect(() => {
    if (route.name === 'file') useRecent.getState().touch(route.path)
  }, [route])
  // What is still missing (study folder, Moodle, eCampus) – once per opened folder.
  useEffect(() => {
    const timer = setTimeout(() => void setupHint(ws).catch(() => undefined), 1500)
    return () => clearTimeout(timer)
  }, [ws])
  useEffect(
    () =>
      electronBridge()?.ecampus?.onPolled(() => {
        void useEcampus.getState().refresh()
        if (useApp.getState().settings.studyAutoSync) void autoSyncStudy(ws).catch(() => undefined)
      }),
    [ws],
  )
  // The exam plan is due (interval in the settings): check quietly when the study folder is set up.
  useEffect(() => electronBridge()?.examPlan?.onDue(() => void syncExamPlan(ws).catch(() => undefined)), [ws])
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
      // New materials are suggested (save after confirming), never saved silently.
      if (useApp.getState().settings.moodleAutoSave)
        await suggestMaterials(ws, snapshot).catch(() => undefined)
      if (useApp.getState().settings.studyAutoSync) void autoSyncStudy(ws).catch(() => undefined)
    })
  }, [ws])
  const actions = usePageActions(ws)
  // One width for the left side bar, whatever it shows (pages, assistant, Git …) – drag the edge.
  const [sidebarWidth, setSidebarWidth] = useStoredWidth('sidebar-left', 320, 220, 800)
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
      } else if (mod && e.key === ',') {
        e.preventDefault()
        runCommand('settings', ws, actions, saveNow)
      } else if (mod && (e.key === '[' || (e.altKey && e.key === 'ArrowLeft'))) {
        e.preventDefault()
        history.back()
      } else if (mod && (e.key === ']' || (e.altKey && e.key === 'ArrowRight'))) {
        e.preventDefault()
        history.forward()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSearch, setNewPage, setSidebar, actions, ws])
  // Menu bar (desktop): the same commands.
  useEffect(() => electronBridge()?.onMenu?.((id) => runCommand(id, ws, actions, saveNow)), [ws, actions])

  return (
    <div className="flex h-full flex-col overflow-clip">
      <div className="flex min-h-0 flex-1 overflow-clip" data-sidebar={sidebarOpen ? 'open' : 'closed'}>
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
            'no-print z-30 h-full shrink-0 overflow-clip transition-[width,transform] duration-200',
            sidebarOpen ? 'border-r border-line' : 'min-[900px]:w-0',
            'relative',
            sidebarOpen && 'min-[900px]:w-[var(--sidebar-w)]',
            'max-[899px]:w-[min(22rem,100vw)]',
            'max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:border-r max-[899px]:border-line max-[899px]:shadow-[var(--shadow-pop)]',
            sidebarOpen ? 'max-[899px]:translate-x-0' : 'max-[899px]:-translate-x-full',
          )}
          aria-hidden={!sidebarOpen}
          inert={!sidebarOpen}
          data-left-view={leftView ?? 'pages'}
          style={{ '--sidebar-w': `${sidebarWidth}px` } as CSSProperties}
        >
          {sidebarOpen && (
            <div className="max-[899px]:hidden">
              <ResizeHandle
                side="right"
                width={sidebarWidth}
                onResize={setSidebarWidth}
                label={t('nav.sidebar')}
                reset={320}
              />
            </div>
          )}
          <div className={cx('h-full min-[900px]:w-[var(--sidebar-w)]', 'max-[899px]:w-[min(22rem,100vw)]')}>
            <ErrorBoundary resetKey={leftView ?? 'pages'}>
              {leftView === 'assistant' ? (
                <AssistantPanel />
              ) : leftView === 'git' ? (
                <GitPanel />
              ) : leftView === 'notifications' ? (
                <NotificationPanel />
              ) : leftView === 'settings' ? (
                <SettingsPanel />
              ) : leftView === 'shelf' ? (
                <ShelfPanel />
              ) : (
                <Sidebar />
              )}
            </ErrorBoundary>
          </div>
        </div>
        {/* Hints and toasts live in the content area – never over the side bars or the assistant. */}
        <div className="relative flex min-w-0 flex-1 overflow-clip">
          <main
            ref={mainRef}
            className="min-w-0 flex-1 overflow-y-auto"
            id="main"
            data-route={routeHash(route)}
          >
            <ScrollRootContext value={mainRef}>
              <ErrorBoundary resetKey={routeHash(route)}>{children}</ErrorBoundary>
            </ScrollRootContext>
          </main>
        </div>
        <ErrorBoundary resetKey={rightPanel ?? ''}>
          {rightPanel === 'assistant' && <AssistantPanel />}
          {rightPanel === 'git' && <GitPanel />}
          {rightPanel === 'notifications' && <NotificationPanel />}
          {rightPanel === 'settings' && <SettingsPanel />}
          {rightPanel === 'shelf' && <ShelfPanel />}
        </ErrorBoundary>
        <ActivityBar side="right" />
        <DiffSheet />
        <MoodleImportDialog />
        <StudyDialogHost />
        {overlays}
        <PeekHost />
        <PromptHost />
        <TextContextMenu />
        <EventBadge />
      </div>
      <StatusBar />
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
      if (n) void openNotification(n, ws)
    })
    // What a check found, bottom left: "3 neue Termine · 2 neue Dateien" with a button to see them.
    const offAdded = bridge?.onAdded?.((counts) => {
      const parts = Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([kind, count]) => t(`news.kind.${kind as NotificationKind}`, { count }))
      if (!parts.length) return
      announce(t('news.title'), {
        note: parts.join(' · '),
        action: { label: t('news.show'), run: () => useApp.getState().openView('notifications') },
        key: 'news',
      })
    })
    const remind = () => void useNotifications.getState().add(taskReminders(ws))
    remind()
    const timer = setInterval(remind, 30 * 60_000)
    return () => {
      offChange?.()
      offOpen?.()
      offAdded?.()
      clearInterval(timer)
    }
  }, [ws])
}

/** The study sync preview, opened from a hint ("3 Änderungen im Studium – Ansehen"). */
function StudyDialogHost() {
  const open = useApp((s) => s.studyDialog)
  return open ? <StudySyncDialog onClose={() => useApp.getState().setStudyDialog(false)} /> : null
}
