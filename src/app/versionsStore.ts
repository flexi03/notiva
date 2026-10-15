import { create } from 'zustand'

/** How many newer Moodle versions wait for a decision (badge in the Moodle screen). */
export const usePendingVersions = create<{ count: number }>(() => ({ count: 0 }))
