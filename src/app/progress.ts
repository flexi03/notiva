import { create } from 'zustand'

export interface ProgressTask {
  id: number
  label: string
  /** Current step (e.g. file name). */
  detail?: string
  done: number
  /** Unknown total → running bar without percent. */
  total?: number
  state: 'running' | 'done' | 'error'
  /** Confirmation or error text at the end. */
  message?: string
}

interface ProgressState {
  tasks: ProgressTask[]
  dismiss(id: number): void
}

let counter = 0

export const useProgress = create<ProgressState>((set) => ({
  tasks: [],
  dismiss: (id) => set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
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
  options: { success?: (result: T) => string; total?: number } = {},
): Promise<T> {
  const id = ++counter
  useProgress.setState((s) => ({
    tasks: [
      ...s.tasks,
      { id, label, done: 0, ...(options.total ? { total: options.total } : {}), state: 'running' },
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
    patch(id, { state: 'done', message: options.success?.(result) ?? label, detail: '' })
    setTimeout(() => useProgress.getState().dismiss(id), 5000)
    return result
  } catch (e) {
    patch(id, {
      state: 'error',
      message:
        e instanceof Error
          ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
          : String(e),
    })
    throw e
  }
}
