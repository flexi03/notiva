import { create } from 'zustand'

/** Asks the terminal area of a folder to open a web page beside its terminal (e.g. a lab link). */
interface DockRequests {
  web: { folder: string; url: string; n: number } | null
  openWeb(folder: string, url: string): void
  done(): void
}

export const useDockRequests = create<DockRequests>((set, get) => ({
  web: null,
  openWeb: (folder, url) => set({ web: { folder, url, n: (get().web?.n ?? 0) + 1 } }),
  done: () => set({ web: null }),
}))
