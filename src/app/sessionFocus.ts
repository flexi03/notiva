import { create } from 'zustand'

/**
 * The session the user came from (click on "Als Nächstes" in the status bar): the module page then
 * highlights the files that likely belong to it.
 */
export const useSessionFocus = create<{
  module: string | null
  /** the timetable row (or exam) it came from – gone (deleted) → no highlight */
  source?: string
  type?: string
  start?: number
}>(() => ({ module: null }))
