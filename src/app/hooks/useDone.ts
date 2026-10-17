import { useState } from 'react'
import { doneOf, setDone, type ModuleRef } from '@/app/studyPlan'
import { useAction, useWorkspace } from '@/app/store'

/**
 * What of a module is done (`vorbereitet:`) and a toggle that ticks at once – the module page is
 * saved behind it. Shared by exam preparation, study plan and "Heute".
 */
export function useDone(module: ModuleRef) {
  const ws = useWorkspace()
  const run = useAction()
  const [override, setOverride] = useState<Set<string> | null>(null)
  const done = override ?? doneOf(module)
  const toggle = (key: string) => {
    const on = !done.has(key)
    const next = new Set(done)
    if (on) next.add(key)
    else next.delete(key)
    setOverride(next)
    void run(() => setDone(ws, module, key, on)).finally(() => setOverride(null))
  }
  return { done, toggle }
}
