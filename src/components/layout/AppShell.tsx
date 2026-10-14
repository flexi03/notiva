import { useEffect, type ReactNode } from 'react'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { cx } from '@/components/ui'
import { Sidebar } from './Sidebar'
import { ToastHost } from './Toast'
import { PromptHost } from './PromptHost'

/** Sidebar (drawer on small screens) + main area + global overlays and shortcuts. */
export function AppShell({ children, overlays }: { children: ReactNode; overlays?: ReactNode }) {
  const ws = useWorkspace()
  const { sidebarOpen, setSidebar, setSearch, setNewPage } = useApp()
  const actions = usePageActions(ws)

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
      <aside
        className={cx(
          'no-print z-30 h-full w-[17rem] shrink-0 border-r border-line transition-[margin,transform] duration-200',
          'max-[899px]:fixed max-[899px]:inset-y-0 max-[899px]:left-0 max-[899px]:shadow-[var(--shadow-pop)]',
          sidebarOpen ? 'max-[899px]:translate-x-0' : 'max-[899px]:-translate-x-full min-[900px]:-ml-[17rem]',
        )}
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
      >
        <Sidebar />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto" id="main">
        {children}
      </main>
      {overlays}
      <PromptHost />
      <ToastHost />
    </div>
  )
}
