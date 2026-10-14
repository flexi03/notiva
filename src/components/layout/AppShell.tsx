import { useEffect, useRef, type ReactNode } from 'react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { routeHash } from '@/lib/route'
import { cx } from '@/components/ui'
import { Sidebar } from './Sidebar'
import { ToastHost } from './Toast'
import { PromptHost } from './PromptHost'
import { PeekHost } from './PeekHost'
import { ScrollRootContext } from './scrollRoot'
import { useGitSync } from '@/app/git'
import { GitPanel } from '@/components/git/GitPanel'
import { DiffSheet } from '@/components/git/DiffView'
import { ActivityBar } from './ActivityBar'
import { AssistantPanel } from '@/components/ai/AssistantPanel'
import { MoodleImportDialog } from '@/components/moodle/MoodleImport'
import { moodleAvailable, useMoodle } from '@/app/moodle'

/** Sidebar (drawer on small screens) + main area + global overlays and shortcuts. */
export function AppShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  const ws = useWorkspace()
  const { sidebarOpen, setSidebar, setSearch, setNewPage, route, rightPanel, leftView } = useApp()
  useGitSync()
  useEffect(() => {
    if (moodleAvailable()) void useMoodle.getState().refresh()
  }, [])
  const actions = usePageActions(ws)
  const mainRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
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
      <div
        className={cx(
          'no-print z-30 h-full shrink-0 border-r border-line transition-[margin,transform] duration-200',
          leftView ? 'w-[24rem] max-[899px]:w-[min(26rem,100vw)]' : 'w-[17rem]',
          'max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:shadow-[var(--shadow-pop)]',
          sidebarOpen
            ? 'max-[899px]:translate-x-0'
            : cx(
                'max-[899px]:-translate-x-full',
                leftView ? 'min-[900px]:-ml-[24rem]' : 'min-[900px]:-ml-[17rem]',
              ),
        )}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        data-left-view={leftView ?? 'pages'}
      >
        {leftView === 'assistant' ? <AssistantPanel /> : leftView === 'git' ? <GitPanel /> : <Sidebar />}
      </div>
      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto" id="main" data-route={routeHash(route)}>
        <ScrollRootContext value={mainRef}>{children}</ScrollRootContext>
      </main>
      {rightPanel === 'assistant' && <AssistantPanel />}
      {rightPanel === 'git' && <GitPanel />}
      <ActivityBar side="right" />
      <DiffSheet />
      <MoodleImportDialog />
      {overlays}
      <PeekHost />
      <PromptHost />
      <ToastHost />
    </div>
  )
}
