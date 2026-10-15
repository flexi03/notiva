import type { ReactNode } from 'react'
import {
  CalendarClock,
  CheckSquare,
  ExternalLink,
  FileText,
  GraduationCap,
  Highlighter,
  NotebookPen,
  Plus,
  Sparkles,
  SquareTerminal,
} from 'lucide-react'
import { createCodeFolder } from '@/components/code/CodeFolder'
import { materialFolder } from '@/app/materials'
import { timetableRows } from '@/app/schedule'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { toIsoDate } from '@/lib/dates'
import { activeModules, type ActiveModule } from '@/lib/semesterView'
import { findStudyDashboard } from '@/lib/study/sync'
import { Button, Chip, EmptyState } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

const fileName = (path: string) => path.split('/').pop()!

/** "heute 09:00", "morgen 14:00", "Mi 10:00" */
function when(at: Date, now: Date, locale: string): string {
  const days = Math.round(
    (new Date(at).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000,
  )
  const time = at.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (days === 0) return `${t('semester.today')} ${time}`
  if (days === 1) return `${t('semester.tomorrow')} ${time}`
  return `${at.toLocaleDateString(locale, { weekday: 'short' })} ${time}`
}

const inDays = (date: string, now: Date) =>
  Math.round((Date.parse(`${date}T00:00:00`) - new Date(now).setHours(0, 0, 0, 0)) / 86_400_000)

/**
 * "Mein Semester": one coloured card per module attended now – next session, exam, open tasks,
 * the newest script, new files, notes and the lab, side by side as space allows. Files live on the
 * module page; here is what matters this week.
 */
export function SemesterScreen() {
  const ws = useWorkspace()
  const { navigate } = useApp()
  const dash = findStudyDashboard(ws)
  const now = new Date()
  const modules = dash
    ? activeModules(ws, dash.folder, materialFolder(ws), timetableRows(ws, dash.folder), now)
    : []

  return (
    <>
      <Topbar title={t('semester.title')} />
      <div className="mx-auto max-w-[96rem] px-4 py-8 sm:px-8">
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="mb-1 text-[2rem] font-bold">{t('semester.title')}</h1>
            <p className="text-[13px] text-ink-3">{t('semester.hint')}</p>
          </div>
          {dash && (
            <Button
              size="sm"
              icon={<CalendarClock size={14} />}
              onClick={() => navigate({ name: 'timetable' })}
            >
              {t('nav.timetable')}
            </Button>
          )}
        </div>
        {modules.length === 0 ? (
          <EmptyState
            title={t('semester.empty')}
            action={
              dash && (
                <Button
                  variant="primary"
                  onClick={() => navigate({ name: 'page', path: `${dash.folder}/Module.md` })}
                >
                  {t('semester.toModules')}
                </Button>
              )
            }
          />
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,22rem),1fr))]">
            {modules.map((m) => (
              <ModuleCard key={m.module.path} m={m} now={now} />
            ))}
          </div>
        )}
      </div>
    </>
  )
}

function ModuleCard({ m, now }: { m: ActiveModule; now: Date }) {
  const ws = useWorkspace()
  const { navigate, openEntry } = useApp()
  const run = useAction()
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const status = typeof m.module.data.Status === 'string' ? m.module.data.Status : ''
  const grade = typeof m.module.data.Note === 'number' ? m.module.data.Note : undefined
  const tries = typeof m.module.data.Versuche === 'number' ? m.module.data.Versuche : 0
  const lab = m.code.length > 0 || m.belegung.some((b) => b === 'Praktikum' || b === 'Übung')
  const notesDb = ws.findDatabase('Mitschriften', m.module.path)
  const examDays = m.nextExam ? inDays(m.nextExam.date, now) : undefined

  const newNote = () =>
    run(async () => {
      const path = await ws.createRow(notesDb!.path, `${m.module.title} – ${toIsoDate(now)}`, {
        Modul: [`[[${ws.linkText(m.module.path)}]]`],
        Datum: toIsoDate(now),
        Art: 'Vorlesung',
      })
      navigate({ name: 'page', path })
    })

  return (
    <section
      aria-label={m.module.title}
      className="flex flex-col overflow-hidden rounded-panel border border-line bg-surface"
      style={{ borderTop: `4px solid var(--opt-${m.color}-ink)` }}
      data-color={m.color}
    >
      <header className="px-3 pt-2.5 pb-2" style={{ background: `var(--opt-${m.color})` }}>
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left text-[1.05rem] leading-snug font-bold hover:underline"
            style={{ color: `var(--opt-${m.color}-ink)` }}
            onClick={() => navigate({ name: 'page', path: m.module.path })}
          >
            {m.module.title}
          </button>
          {grade !== undefined && (
            <span className="shrink-0 rounded-full bg-surface px-2 text-[12.5px] font-semibold tabular-nums">
              {grade.toLocaleString(locale, { minimumFractionDigits: 1 })}
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {m.belegung.map((b) => (
            <Chip key={b}>{b}</Chip>
          ))}
          {status && <span className="text-[12px] text-ink-2">{status}</span>}
          {tries > 1 && (
            <span className="text-[12px] text-ink-2">· {t('semester.tries', { count: tries })}</span>
          )}
        </div>
      </header>

      <ul className="flex-1 space-y-1.5 px-3 py-2.5 text-[13px]">
        <Info icon={<CalendarClock size={14} />} label={t('semester.next')}>
          {m.nextSession ? (
            <button
              type="button"
              className="text-left hover:underline"
              onClick={() => navigate({ name: 'timetable' })}
            >
              <span className="font-medium">{when(m.nextSession.at, now, locale)}</span>
              {m.nextSession.end && `–${m.nextSession.end}`}
              {m.nextSession.type && ` · ${m.nextSession.type}`}
              {m.nextSession.room && <span className="text-ink-3"> · {m.nextSession.room}</span>}
            </button>
          ) : (
            <span className="text-ink-3">{t('semester.noSession')}</span>
          )}
        </Info>
        {m.nextExam && (
          <Info icon={<GraduationCap size={14} />} label={t('semester.exam')}>
            <button
              type="button"
              className="text-left hover:underline"
              onClick={(e) => openEntry(m.nextExam!.page.path, e)}
            >
              {new Date(`${m.nextExam.date}T00:00:00`).toLocaleDateString(locale, {
                day: '2-digit',
                month: '2-digit',
              })}
              <span
                className={
                  examDays !== undefined && examDays <= 14 ? ' font-semibold text-danger' : ' text-ink-3'
                }
              >
                {' '}
                · {t('semester.inDays', { count: examDays ?? 0 })}
              </span>
            </button>
          </Info>
        )}
        {m.openTasks.length > 0 && (
          <Info icon={<CheckSquare size={14} />} label={t('semester.tasks')}>
            <button
              type="button"
              className="text-left hover:underline"
              onClick={(e) => openEntry(m.openTasks[0]!.path, e)}
            >
              {m.openTasks[0]!.title}
              {typeof m.openTasks[0]!.data.Fällig === 'string' && (
                <span className="text-ink-3">
                  {' '}
                  ·{' '}
                  {new Date(`${m.openTasks[0]!.data.Fällig}T00:00:00`).toLocaleDateString(locale, {
                    day: '2-digit',
                    month: '2-digit',
                  })}
                </span>
              )}
              {m.openTasks.length > 1 && <span className="text-ink-3"> +{m.openTasks.length - 1}</span>}
            </button>
          </Info>
        )}
        {m.latestLecture && (
          <Info icon={<FileText size={14} />} label={t('semester.script')}>
            <button
              type="button"
              className="min-w-0 truncate text-left hover:underline"
              title={m.latestLecture}
              onClick={() => navigate({ name: 'file', path: m.latestLecture! })}
            >
              {fileName(m.latestLecture)}
            </button>
          </Info>
        )}
        {m.recentCount > 0 && (
          <Info
            icon={<Sparkles size={14} className="text-accent" />}
            label={t('semester.newFiles', { count: m.recentCount })}
          >
            <span className="flex min-w-0 flex-col">
              {m.recent.map((f) => (
                <button
                  key={f.path}
                  type="button"
                  className="truncate text-left hover:underline"
                  title={f.path}
                  onClick={() => navigate({ name: 'file', path: f.path })}
                >
                  {fileName(f.path)}
                </button>
              ))}
            </span>
          </Info>
        )}
        {(m.notes.length > 0 || m.annotated.length > 0) && (
          <Info icon={<NotebookPen size={14} />} label={t('semester.yours')}>
            <span className="text-ink-2">
              {m.notes.length > 0 && (
                <button
                  type="button"
                  className="hover:underline"
                  onClick={(e) => openEntry(m.notes[0]!.path, e)}
                >
                  {t('semester.notesCount', { count: m.notes.length })}
                </button>
              )}
              {m.notes.length > 0 && m.annotated.length > 0 && ' · '}
              {m.annotated.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:underline"
                  onClick={() => navigate({ name: 'file', path: m.annotated[0]!.pdf })}
                >
                  <Highlighter size={12} /> {t('semester.annotatedCount', { count: m.annotated.length })}
                </button>
              )}
            </span>
          </Info>
        )}
      </ul>

      <footer className="flex flex-wrap gap-1.5 border-t border-line px-3 py-2">
        {lab && (
          <Button
            size="sm"
            variant="primary"
            icon={<SquareTerminal size={14} />}
            onClick={() =>
              void run(async () =>
                navigate({
                  name: 'page',
                  path: m.code[0]?.path ?? (await createCodeFolder(ws, m.module.path, 'Praktikum')),
                }),
              )
            }
          >
            {t('semester.lab')}
          </Button>
        )}
        {notesDb && (
          <Button size="sm" icon={<Plus size={13} />} onClick={() => void newNote()}>
            {t('semester.newNote')}
          </Button>
        )}
        {m.courses.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<ExternalLink size={13} />}
            onClick={() => navigate({ name: 'moodle', course: m.courses[m.courses.length - 1]! })}
          >
            Moodle
          </Button>
        )}
      </footer>
    </section>
  )
}

function Info({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-ink-3" aria-hidden>
        {icon}
      </span>
      <span className="sr-only">{label}: </span>
      <span className="min-w-0 flex-1">{children}</span>
    </li>
  )
}
