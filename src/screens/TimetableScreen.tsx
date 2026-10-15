import { useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles, Table2 } from 'lucide-react'
import { suggestTimetable, timetableRows } from '@/app/schedule'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { DAYS } from '@/lib/schedule'
import { moduleColor } from '@/lib/semesterView'
import { findStudyDashboard } from '@/lib/study/sync'
import { Button, EmptyState, IconButton } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

interface Block {
  key: string
  title: string
  sub: string
  day: number
  start: number
  end: number
  color: string
  path?: string
  exam?: boolean
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
const startOfWeek = (d: Date) => {
  const s = new Date(d)
  s.setHours(0, 0, 0, 0)
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7))
  return s
}
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * The week at a glance: lectures, exercises and labs from "Stundenplan", exams from "Prüfungen" –
 * each in its module's colour. A click opens the module. Times from Moodle are suggested, never
 * entered silently.
 */
export function TimetableScreen() {
  const ws = useWorkspace()
  const { navigate, openEntry } = useApp()
  const run = useAction()
  const dash = findStudyDashboard(ws)
  const [offset, setOffset] = useState(0)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const now = new Date()
  const monday = startOfWeek(now)
  monday.setDate(monday.getDate() + offset * 7)

  if (!dash) return <EmptyState title={t('timetable.noStudy')} />
  const modules = ws.get(`${dash.folder}/Module.md`)?.database ? ws.rows(`${dash.folder}/Module.md`) : []
  const moduleByTitle = new Map(modules.map((m) => [m.title, ws.get(m.path)!]))
  const blocks: Block[] = []
  for (const r of timetableRows(ws, dash.folder)) {
    const day = DAYS.indexOf(r.day as (typeof DAYS)[number])
    if (day < 0 || !r.start) continue
    const module = r.module ? moduleByTitle.get(r.module) : undefined
    blocks.push({
      key: r.path,
      title: r.module ?? r.title,
      sub: [r.type, r.room].filter(Boolean).join(' · '),
      day,
      start: minutes(r.start),
      end: r.end ? minutes(r.end) : minutes(r.start) + 90,
      color: module ? moduleColor(module) : 'gray',
      path: module?.path ?? r.path,
    })
  }
  const examDb = `${dash.folder}/Prüfungen.md`
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d
  })
  if (ws.get(examDb)?.database)
    for (const e of ws.rows(examDb)) {
      const day = weekDays.findIndex((d) => iso(d) === e.data.Datum)
      if (day < 0) continue
      const start = typeof e.data.Beginn === 'string' ? minutes(e.data.Beginn) : 9 * 60
      blocks.push({
        key: e.path,
        title: e.title,
        sub: [t('semester.exam'), typeof e.data.Raum === 'string' ? e.data.Raum : '']
          .filter(Boolean)
          .join(' · '),
        day,
        start,
        end: start + 90,
        color: 'red',
        path: e.path,
        exam: true,
      })
    }
  const days = blocks.some((b) => b.day === 5) ? 6 : 5
  const from = Math.min(8 * 60, ...blocks.map((b) => Math.floor(b.start / 60) * 60))
  const to = Math.max(18 * 60, ...blocks.map((b) => Math.ceil(b.end / 60) * 60))
  const hours = Array.from({ length: (to - from) / 60 }, (_, i) => from / 60 + i)
  const px = 0.9 // pixels per minute
  const todayIndex = offset === 0 ? (now.getDay() + 6) % 7 : -1
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  return (
    <>
      <Topbar title={t('nav.timetable')} />
      <div className="mx-auto max-w-[90rem] px-4 py-8 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h1 className="mr-auto text-[2rem] font-bold">{t('nav.timetable')}</h1>
          <IconButton label={t('timetable.prevWeek')} onClick={() => setOffset((o) => o - 1)}>
            <ChevronLeft size={16} />
          </IconButton>
          <Button size="sm" variant={offset === 0 ? 'primary' : 'ghost'} onClick={() => setOffset(0)}>
            {t('timetable.thisWeek')}
          </Button>
          <IconButton label={t('timetable.nextWeek')} onClick={() => setOffset((o) => o + 1)}>
            <ChevronRight size={16} />
          </IconButton>
          <Button
            size="sm"
            icon={<Sparkles size={14} />}
            onClick={() => void run(() => suggestTimetable(ws, true))}
          >
            {t('timetable.suggest')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Table2 size={14} />}
            onClick={() => navigate({ name: 'page', path: `${dash.folder}/Stundenplan.md` })}
          >
            {t('timetable.edit')}
          </Button>
        </div>
        <p className="mb-3 text-[13px] text-ink-3">
          {weekDays[0]!.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} –{' '}
          {weekDays[days - 1]!.toLocaleDateString(locale, {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })}
          {' · '}
          {t('timetable.hint')}
        </p>
        {blocks.length === 0 ? (
          <EmptyState title={t('timetable.empty')}>{t('timetable.emptyHint')}</EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-panel border border-line bg-surface">
            <div
              className="grid min-w-[44rem]"
              style={{ gridTemplateColumns: `3.5rem repeat(${days}, minmax(0, 1fr))` }}
            >
              <div className="border-b border-line" />
              {weekDays.slice(0, days).map((d, i) => (
                <div
                  key={i}
                  className={`border-b border-l border-line px-2 py-1.5 text-[13px] font-semibold ${i === todayIndex ? 'text-accent' : ''}`}
                >
                  {d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit' })}
                </div>
              ))}
              <div className="relative" style={{ height: (to - from) * px }}>
                {hours.map((h) => (
                  <span
                    key={h}
                    className="absolute right-1.5 -translate-y-1/2 text-[11px] text-ink-3 tabular-nums"
                    style={{ top: (h * 60 - from) * px }}
                  >
                    {h > from / 60 ? `${h}:00` : ''}
                  </span>
                ))}
              </div>
              {weekDays.slice(0, days).map((_, day) => (
                <div key={day} className="relative border-l border-line" style={{ height: (to - from) * px }}>
                  {hours.map((h) => (
                    <div
                      key={h}
                      className="absolute inset-x-0 border-t border-line/60"
                      style={{ top: (h * 60 - from) * px }}
                    />
                  ))}
                  {day === todayIndex && nowMinutes > from && nowMinutes < to && (
                    <div
                      className="absolute inset-x-0 z-10 border-t-2 border-danger"
                      style={{ top: (nowMinutes - from) * px }}
                      aria-label={t('timetable.now')}
                    />
                  )}
                  {blocks
                    .filter((b) => b.day === day)
                    .map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={(e) =>
                          b.exam ? openEntry(b.path!, e) : b.path && navigate({ name: 'page', path: b.path })
                        }
                        className="absolute inset-x-1 overflow-hidden rounded-control px-1.5 py-1 text-left text-[12px] leading-tight shadow-sm hover:brightness-95"
                        style={{
                          top: (b.start - from) * px,
                          height: Math.max(22, (b.end - b.start) * px - 2),
                          background: `var(--opt-${b.color})`,
                          color: `var(--opt-${b.color}-ink)`,
                          borderLeft: `3px solid var(--opt-${b.color}-ink)`,
                        }}
                      >
                        <span className="block truncate font-semibold">{b.title}</span>
                        <span className="block truncate opacity-80">
                          {`${Math.floor(b.start / 60)}:${String(b.start % 60).padStart(2, '0')}`}
                          {b.sub && ` · ${b.sub}`}
                        </span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
