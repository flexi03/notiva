import { railScale, readingProgress, scrollTargetFor, viewportBox } from '../minimap'
import { taskProgress } from '../blocks'

describe('railScale', () => {
  it('fits long pages into the available height and caps short ones', () => {
    expect(railScale(10000, 500)).toBe(0.05)
    expect(railScale(1000, 500)).toBe(0.2)
    expect(railScale(0, 500)).toBe(0.2)
  })
})

describe('readingProgress', () => {
  it('maps the scroll position to 0–100', () => {
    expect(readingProgress(0, 2000, 500)).toBe(0)
    expect(readingProgress(750, 2000, 500)).toBe(50)
    expect(readingProgress(1500, 2000, 500)).toBe(100)
    expect(readingProgress(9999, 2000, 500)).toBe(100)
  })
  it('counts a page without scrolling as fully read', () => {
    expect(readingProgress(0, 400, 500)).toBe(100)
  })
})

describe('viewportBox', () => {
  it('maps the visible area into minimap coordinates', () => {
    expect(viewportBox(100, 500, 100, 2000, 0.1)).toEqual({ top: 0, height: 50 })
    expect(viewportBox(1100, 500, 100, 2000, 0.1)).toEqual({ top: 100, height: 50 })
  })
  it('clips at both ends of the content', () => {
    expect(viewportBox(0, 500, 200, 2000, 0.1)).toEqual({ top: 0, height: 30 })
    expect(viewportBox(1900, 500, 100, 2000, 0.1)).toEqual({ top: 180, height: 20 })
  })
})

describe('scrollTargetFor', () => {
  it('centres the clicked position and never scrolls above the top', () => {
    expect(scrollTargetFor(100, 0.1, 50, 400)).toBe(850)
    expect(scrollTargetFor(0, 0.1, 50, 400)).toBe(0)
  })
})

describe('taskProgress', () => {
  it('counts open and done tasks, also nested and in callouts', () => {
    expect(taskProgress('- [ ] a\n- [x] b\n  - [X] c\n\n> [!todo] Liste\n> - [ ] d\n')).toEqual({
      done: 2,
      total: 4,
    })
  })
  it('ignores checkboxes inside code blocks', () => {
    expect(taskProgress('```md\n- [ ] nicht zählen\n```\n\n- [x] zählen\n')).toEqual({ done: 1, total: 1 })
    expect(taskProgress('Kein Task')).toEqual({ done: 0, total: 0 })
  })
})
