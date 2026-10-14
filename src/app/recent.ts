import { create } from 'zustand'

/** Recently opened files (PDFs, slides …) per vault – on this device only. */
interface RecentState {
  vault: string
  files: Array<{ path: string; time: number }>
  load(vault: string): void
  touch(path: string): void
}

const key = (vault: string) => `notiva:recent:${vault}`

export const useRecent = create<RecentState>((set, get) => ({
  vault: '',
  files: [],
  load(vault) {
    let files: RecentState['files'] = []
    try {
      const raw = JSON.parse(localStorage.getItem(key(vault)) ?? '[]') as unknown
      if (Array.isArray(raw))
        files = raw
          .filter(
            (f): f is { path: string; time: number } =>
              typeof f?.path === 'string' && typeof f?.time === 'number',
          )
          .slice(0, 50)
    } catch {
      /* private mode */
    }
    set({ vault, files })
  },
  touch(path) {
    const files = [{ path, time: Date.now() }, ...get().files.filter((f) => f.path !== path)].slice(0, 50)
    set({ files })
    try {
      localStorage.setItem(key(get().vault), JSON.stringify(files))
    } catch {
      /* private mode */
    }
  },
}))
