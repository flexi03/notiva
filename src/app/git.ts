import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { blockChanges, lineMarkers, type BlockChange } from '@/lib/diff'
import { electronBridge, type GitBridge, type GitChange, type GitState } from '@/lib/vault'
import type { Page } from '@/lib/workspace'
import { useApp } from './store'

interface GitStore {
  state: GitState | null
  loading: boolean
  error: string | null
  /** Contents at HEAD, per path – valid for `cachedHead`. */
  headCache: Map<string, string | null>
  cachedHead: string | null
  refresh(): Promise<void>
  headText(path: string): Promise<string | null>
  /** File whose diff is shown: against HEAD, or the changes of one commit. */
  diff: { path: string; commit?: string } | null
  showDiff(target: { path: string; commit?: string } | null): void
  /** Runs a git action, shows errors as toast and refreshes afterwards. */
  act<T>(task: (git: GitBridge) => Promise<T>): Promise<T | undefined>
}

const bridge = () => electronBridge()?.git ?? null

/** Git is only available in the desktop app (the browser cannot run git). */
export const gitAvailable = () => bridge() !== null

export const useGit = create<GitStore>((set, get) => ({
  state: null,
  loading: false,
  error: null,
  headCache: new Map(),
  cachedHead: null,
  diff: null,
  showDiff: (diff) => set({ diff }),

  async refresh() {
    const git = bridge()
    if (!git || !useApp.getState().ws) return
    set({ loading: true })
    try {
      const state = await git.state()
      const cacheValid = state.head === get().cachedHead
      set({
        state,
        error: null,
        ...(cacheValid ? {} : { headCache: new Map(), cachedHead: state.head }),
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error) })
    } finally {
      set({ loading: false })
    }
  },

  async headText(path) {
    const git = bridge()
    if (!git || !get().state?.head) return null
    const cache = get().headCache
    if (cache.has(path)) return cache.get(path) ?? null
    const text = await git.show('HEAD', path).catch(() => null)
    cache.set(path, text)
    return text
  },

  async act(task) {
    const git = bridge()
    if (!git) return undefined
    try {
      return await task(git)
    } catch (error) {
      useApp.getState().showToast(error instanceof Error ? error.message : String(error))
      return undefined
    } finally {
      await get().refresh()
      await useApp.getState().ws?.reload()
    }
  },
}))

/** Keeps git status fresh: after saves (debounced), on window focus and on file changes. */
export function useGitSync(): void {
  const ws = useApp((s) => s.ws)
  useEffect(() => {
    if (!ws || !gitAvailable()) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void useGit.getState().refresh(), 700)
    }
    void useGit.getState().refresh()
    const unsubscribe = ws.subscribe(later)
    window.addEventListener('focus', later)
    return () => {
      clearTimeout(timer)
      unsubscribe()
      window.removeEventListener('focus', later)
    }
  }, [ws])
}

export function changeOf(path: string): GitChange | undefined {
  return useGit.getState().state?.changes.find((c) => c.path === path)
}

export interface PageGitChanges {
  blocks: Array<BlockChange | undefined>
  properties: boolean
  deletedAtEnd: boolean
}

/**
 * Change markers for the blocks of a page (like the gutter in VS Code): compares the file on disk
 * with its version at HEAD. Returns null when git is unavailable or the page is unchanged.
 */
export function usePageGitChanges(page: Page, blocks: string[]): PageGitChanges | null {
  const change = useGit((s) => s.state?.changes.find((c) => c.path === page.path))
  const head = useGit((s) => s.state?.head ?? null)
  const ws = useApp((s) => s.ws)
  const [texts, setTexts] = useState<{ key: string; head: string; file: string } | null>(null)
  const key = change ? `${page.path}|${page.mtime}|${head}|${change.status}|${change.from ?? ''}` : ''

  useEffect(() => {
    if (!change || !ws) return
    let cancelled = false
    void (async () => {
      const [headText, file] = await Promise.all([
        change.status === 'untracked' || change.status === 'added'
          ? Promise.resolve('')
          : useGit.getState().headText(change.from ?? page.path),
        ws.vault.read(page.path).catch(() => null),
      ])
      if (!cancelled && file !== null) setTexts({ key, head: headText ?? '', file })
    })()
    return () => {
      cancelled = true
    }
  }, [key, change, ws, page.path])

  if (!change || !texts || texts.key !== key) return null
  return blockChanges(lineMarkers(texts.head, texts.file), texts.file, page.body, blocks)
}
