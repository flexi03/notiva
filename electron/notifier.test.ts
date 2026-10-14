import { dueChecks, parseNotifySettings } from './notifier'

describe('background check intervals', () => {
  it('reads intervals, keeps the old Moodle interval and allows "only by hand"', () => {
    const s = parseNotifySettings({ intervalMinutes: 30, intervals: { grades: 0, examPlan: '720' } })
    expect(s.intervals).toEqual({ moodle: 30, materials: 60, courseInfo: 60, grades: 0, examPlan: 720 })
    expect(parseNotifySettings({ intervals: { moodle: 1 } }).intervals.moodle).toBe(5)
  })

  it('runs what is due', () => {
    const { intervals } = parseNotifySettings({ intervals: { grades: 0 } })
    const now = 100 * 86_400_000
    expect(dueChecks(intervals, {}, now)).toEqual(['moodle', 'materials', 'courseInfo', 'examPlan'])
    expect(
      dueChecks(
        intervals,
        { moodle: now - 10 * 60_000, materials: now, courseInfo: now, examPlan: now },
        now,
      ),
    ).toEqual([])
    expect(
      dueChecks(
        intervals,
        { moodle: now - 16 * 60_000, materials: now, courseInfo: now, examPlan: now },
        now,
      ),
    ).toEqual(['moodle'])
  })
})
