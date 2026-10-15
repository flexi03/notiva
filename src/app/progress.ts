import { create } from 'zustand'

export interface ProgressTask {
  id: number
  label: string
  /** Current step (e.g. file name). */
  detail?: string
  done: number
  /** Unknown total → running bar without percent. */
  total?: number
  state: 'running' | 'done' | 'error' | 'info'
  /** Confirmation or error text at the end. */
  message?: string
  /** Second line under the message (e.g. what is new). */
  note?: string
  /** Button: go to the content or set something up. */
  action?: { label: string; run: () => void }
  /** Stays until closed (hints); others vanish after a few seconds. */
  sticky?: boolean
  /** Same key replaces the older entry (e.g. one setup hint). */
  key?: string
  /** Called when the user closes it (e.g. to not show a hint again). */
  onDismiss?: () => void
  /** When it started (for the remaining time). */
  startedAt?: number
}

interface ProgressState {
  tasks: ProgressTask[]
  /** The list above the status bar is open (errors and hints open it, progress does not). */
  open: boolean
  setOpen(open: boolean): void
  dismiss(id: number): void
}

let counter = 0

export const useProgress = create<ProgressState>((set) => ({
  tasks: [],
  open: false,
  setOpen: (open) => set({ open }),
  dismiss: (id) =>
    set((s) => {
      s.tasks.find((t) => t.id === id)?.onDismiss?.()
      const tasks = s.tasks.filter((t) => t.id !== id)
      return { tasks, open: s.open && tasks.length > 0 }
    }),
}))

export interface TaskHandle {
  update(done: number, total?: number, detail?: string): void
  detail(text: string): void
}

const patch = (id: number, change: Partial<ProgressTask>) =>
  useProgress.setState((s) => ({ tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...change } : t)) }))

/**
 * Runs a longer action with a visible progress bar and ends with a confirmation (or the error) –
 * nobody should wait without seeing that something happens.
 */
export async function withProgress<T>(
  label: string,
  work: (task: TaskHandle) => Promise<T>,
  options: {
    success?: (result: T) => string
    /** What is new / what happened, below the confirmation. */
    note?: (result: T) => string | undefined
    action?: (result: T) => ProgressTask['action'] | undefined
    total?: number
  } = {},
): Promise<T> {
  const id = ++counter
  useProgress.setState((s) => ({
    tasks: [
      ...s.tasks,
      {
        id,
        label,
        done: 0,
        ...(options.total ? { total: options.total } : {}),
        state: 'running',
        startedAt: Date.now(),
      },
    ],
  }))
  const handle: TaskHandle = {
    update: (done, total, detail) =>
      patch(id, {
        done,
        ...(total !== undefined ? { total } : {}),
        ...(detail !== undefined ? { detail } : {}),
      }),
    detail: (detail) => patch(id, { detail }),
  }
  try {
    const result = await work(handle)
    patch(id, {
      state: 'done',
      message: options.success?.(result) ?? label,
      detail: '',
      ...(options.note ? { note: options.note(result) } : {}),
      ...(options.action?.(result) ? { action: options.action(result)! } : {}),
    })
    setTimeout(() => useProgress.getState().dismiss(id), options.action?.(result) ? 12_000 : 5000)
    return result
  } catch (e) {
    // Reason in plain words, the technical text below, and a fix (or "Noch einmal").
    const { explain } = await import('./fixes')
    const { message, note, action } = explain(
      e,
      () => void withProgress(label, work, options).catch(() => undefined),
    )
    patch(id, { state: 'error', message, ...(note ? { note } : {}), ...(action ? { action } : {}) })
    // An error shows itself (reason + fix) – no need to look for it.
    useProgress.setState({ open: true })
    if (e && typeof e === 'object') (e as { reported?: boolean }).reported = true
    throw e
  }
}

/**
 * A message bottom left without a running task: news from a background check ("3 neue Termine")
 * or a hint ("Moodle verbinden"). Same `key` replaces the older one.
 */
export function announce(
  message: string,
  options: Pick<ProgressTask, 'note' | 'action' | 'sticky' | 'key' | 'onDismiss'> & {
    state?: 'done' | 'info'
    /** Open the list above the status bar (errors with a fix – everything else waits there). */
    open?: boolean
  } = {},
): number {
  const id = ++counter
  const { state = 'done', open, ...rest } = options
  useProgress.setState((s) => ({
    tasks: [
      ...s.tasks.filter((t) => !options.key || t.key !== options.key),
      { id, label: message, message, done: 1, state, ...rest },
    ],
    open: s.open || !!open,
  }))
  if (!options.sticky) setTimeout(() => useProgress.getState().dismiss(id), options.action ? 12_000 : 6000)
  return id
}
