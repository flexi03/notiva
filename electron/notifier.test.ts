// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dueChecks, NotificationStore, parseNotifySettings } from './notifier'

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

describe('notification store', () => {
  it('keeps quiet notes (as read) without reporting them as news', async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'notiva-notify-')), 'n.json')
    const banners: string[] = []
    const store = new NotificationStore(
      file,
      (added) => banners.push(...added.map((n) => n.id)),
      () => {},
    )
    const quiet = {
      id: 'quiet:course:1:2026-10-20T10:00:00.000Z',
      kind: 'aside' as const,
      title: '1 neue Datei',
      time: '2026-10-20T10:00:00.000Z',
      quiet: true,
    }
    expect(await store.add([quiet])).toEqual([])
    expect(banners).toEqual([])
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual([{ ...quiet, read: true }])
  })
})
