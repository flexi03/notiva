/**
 * Scrolls `el` into view inside its nearest scrollable container only. `scrollIntoView` also moves
 * every ancestor – including the app's frame – which let the whole UI slide out of the window.
 */
export function scrollIntoContainer(
  el: HTMLElement | null | undefined,
  block: 'start' | 'center' | 'nearest' = 'nearest',
  behavior: ScrollBehavior = 'auto',
): void {
  if (!el) return
  let box = el.parentElement
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  if (!box) return
  const outer = box.getBoundingClientRect()
  const inner = el.getBoundingClientRect()
  const offset = inner.top - outer.top + box.scrollTop
  let top = box.scrollTop
  if (block === 'start') top = offset - 8
  else if (block === 'center') top = offset - (box.clientHeight - inner.height) / 2
  else if (inner.top < outer.top) top = offset - 8
  else if (inner.bottom > outer.bottom) top = offset + inner.height - box.clientHeight + 8
  box.scrollTo({ top: Math.max(0, top), behavior })
}
