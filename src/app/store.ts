import { create } from 'zustand'
import { useSyncExternalStore } from 'react'
import { parseRoute, routeHash, type Route } from '@/lib/route'
import { DEFAULT_SETTINGS, parseSettings, type Settings } from '@/lib/settings'
import type { Workspace } from '@/lib/workspace'
import { setLanguage } from '@/i18n'

export interface Toast {
  id: number
  message: string
  action?: { label: string; run: () => void }
}

export interface PromptRequest {
  title: string
  label?: string
  initial?: string
  confirmLabel: string
  /** confirm-only dialog (no text field) */
  confirm?: boolean
  danger?: boolean
  resolve: (value: string | null) => void
}

interface AppState {
  ws: Workspace | null
  settings: Settings
  route: Route
  sidebarOpen: boolean
  searchOpen: boolean
  newPageOpen: { folder: string } | null
  /** Page shown in the side panel over the current screen. */
  peek: string | null
  /** View in the right side bar (like VS Code's secondary side bar). */
  rightPanel: RightPanel | null
  toast: Toast | null
  prompt: PromptRequest | null
  /** Asks for a text value with the app's dialog. Resolves null on cancel. */
  ask(request: Omit<PromptRequest, 'resolve'>): Promise<string | null>
  setWorkspace(ws: Workspace | null): Promise<void>
  navigate(route: Route): void
  openPage(path: string): void
  /**
   * Opens a database entry or card: in the side panel (setting `openEntries`), or as a full page
   * when the setting says so or ⌘/Ctrl/Shift is held.
   */
  openEntry(path: string, event?: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }): void
  closePeek(): void
  /** Opens the view, or closes it when it is already open. */
  toggleRightPanel(panel: RightPanel): void
  setRightPanel(panel: RightPanel | null): void
  syncRoute(): void
  updateSettings(patch: Partial<Settings>): void
  setSidebar(open: boolean): void
  setSearch(open: boolean): void
  setNewPage(state: { folder: string } | null): void
  showToast(message: string, action?: Toast['action']): void
  dismissToast(): void
}

export type RightPanel = 'assistant' | 'git'

let toastId = 0

export const useApp = create<AppState>((set, get) => ({
  ws: null,
  settings: DEFAULT_SETTINGS,
  route: typeof location !== 'undefined' ? parseRoute(location.hash) : { name: 'home' },
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 900 : true,
  searchOpen: false,
  newPageOpen: null,
  peek: null,
  rightPanel: null,
  toast: null,
  prompt: null,

  ask(request) {
    return new Promise((resolve) => {
      get().prompt?.resolve(null)
      set({
        prompt: {
          ...request,
          resolve: (value) => {
            set({ prompt: null })
            resolve(value)
          },
        },
      })
    })
  },
  async setWorkspace(ws) {
    const settings = ws ? parseSettings(await ws.readMeta('settings.json')) : DEFAULT_SETTINGS
    setLanguage(settings.language)
    set({ ws, settings })
  },
  navigate(route) {
    const hash = routeHash(route)
    if (location.hash !== hash) location.hash = hash
    set({ route, searchOpen: false, peek: null })
    if (window.innerWidth < 900) set({ sidebarOpen: false })
  },
  openPage(path) {
    get().navigate({ name: 'page', path })
  },
  openEntry(path, event) {
    const full = event && (event.metaKey || event.ctrlKey || event.shiftKey)
    if (full || get().settings.openEntries === 'page') get().openPage(path)
    else set({ peek: path })
  },
  closePeek: () => set({ peek: null }),
  toggleRightPanel: (panel) => set({ rightPanel: get().rightPanel === panel ? null : panel }),
  setRightPanel: (rightPanel) => set({ rightPanel }),
  syncRoute() {
    set({ route: parseRoute(location.hash), peek: null })
  },
  updateSettings(patch) {
    const settings = parseSettings({ ...get().settings, ...patch })
    setLanguage(settings.language)
    set({ settings })
    void get().ws?.writeMeta('settings.json', settings)
  },
  setSidebar: (sidebarOpen) => set({ sidebarOpen }),
  setSearch: (searchOpen) => set({ searchOpen }),
  setNewPage: (newPageOpen) => set({ newPageOpen }),
  showToast(message, action) {
    const id = ++toastId
    set({ toast: { id, message, ...(action ? { action } : {}) } })
    setTimeout(() => {
      if (get().toast?.id === id) set({ toast: null })
    }, 5000)
  },
  dismissToast: () => set({ toast: null }),
}))

/** The open workspace; re-renders on every change. Only use below <AppShell>, where it exists. */
export function useWorkspace(): Workspace {
  const ws = useApp((s) => s.ws)
  if (!ws) throw new Error('useWorkspace outside an open vault')
  useSyncExternalStore(
    (cb) => ws.subscribe(cb),
    () => ws.version,
  )
  return ws
}

/** Runs an async action and shows its error as a toast instead of failing silently. */
export function useAction() {
  const showToast = useApp((s) => s.showToast)
  return <T>(task: () => Promise<T>): Promise<T | undefined> =>
    task().catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : String(error))
      return undefined
    })
}
