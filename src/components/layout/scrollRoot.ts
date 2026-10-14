import { createContext, useContext, type RefObject } from 'react'

/** The element that scrolls the current page: the main area, or the side panel's body. */
export const ScrollRootContext = createContext<RefObject<HTMLElement | null> | null>(null)

export function useScrollRoot(): RefObject<HTMLElement | null> | null {
  return useContext(ScrollRootContext)
}
