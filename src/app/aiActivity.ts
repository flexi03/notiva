import { create } from 'zustand'

/** How many AI requests run right now (local model, assistant …) – the glow at the bottom shows it. */
export const useAiActivity = create<{ count: number; label: string | null }>(() => ({
  count: 0,
  label: null,
}))

/** Runs `work` while the AI glow is on. */
export async function withAi<T>(label: string, work: () => Promise<T>): Promise<T> {
  useAiActivity.setState((s) => ({ count: s.count + 1, label }))
  try {
    return await work()
  } finally {
    useAiActivity.setState((s) => ({ count: Math.max(0, s.count - 1), label: s.count > 1 ? s.label : null }))
  }
}
