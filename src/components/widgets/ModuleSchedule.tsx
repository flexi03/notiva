import { useState } from 'react'
import { Bell, CalendarClock, CalendarPlus, FlaskConical, Info, Link2, Search, Sparkles } from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { maybeRepo } from '@/app/repoDetect'
import { repoUrl } from '@/lib/gitUrl'
import { electronBridge } from '@/lib/vault'
import { RepoButton } from '@/components/code/RepoButton'
import { materialFolder } from '@/app/materials'
import { suggestTimetable } from '@/app/schedule'
import { courseIdsOf, materialFolderFor } from '@/lib/study/modules'
import { sessionFiles } from '@/lib/semesterView'
import { useSessionFocus } from '@/app/sessionFocus'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { formatValue } from '@/lib/database'
import {
  isoDay,
  LAB_DATE,
  LAB_PREP,
  labSheets,
  nextWeekday,
  planLabs,
  REMINDERS,
  type LabEntry,
} from '@/lib/labPlan'
import type { Page, Workspace } from '@/lib/workspace'
import { Button, Chip, cx, Select, TextInput } from '@/components/ui'

const str = (v: unknown) => (typeof v === 'string' && v ? v : '')
const DAY_ORDER = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const LAB_TYPES = /praktik|labor/i

/** Rows of `db` that link to the module (relation "Modul"). */
function linked(ws: Workspace, db: Page | null, module: string): Page[] {
  if (!db) return []
  const folder = `${ws.rowFolder(db)}/`
  return ws.backlinks(module).filter((p) => p.path.startsWith(folder))
}

/**
 * On a module page: its weekly sessions from the timetable (day, time, type, room, source – part of
 * the module, editable in place) and, for modules with a lab, the lab dates with their
 * preparation, reminders included. A plan is suggested from the timetable and the lab sheets.
 */
export function ModuleSchedule({ module }: { module: Page }) {
  const ws = useWorkspace()
  const folder = materialFolderFor(materialFolder(ws), { name: module.title }, module.title)
  const files = ws
    .assets()
    .map((f) => f.path)
    .filter((p) => p.startsWith(`${folder}/`))
  const run = useAction()
  const openEntry = useApp((s) => s.openEntry)
  const timetableDb = ws.findDatabase('Stundenplan', module.path)
  const tasksDb = ws.findDatabase('Aufgaben', module.path)
  const sessions = linked(ws, timetableDb, module.path).sort(
    (a, b) =>
      DAY_ORDER.indexOf(str(a.data.Tag)) - DAY_ORDER.indexOf(str(b.data.Tag)) ||
      str(a.data.Beginn).localeCompare(str(b.data.Beginn)),
  )
  const labTasks = linked(ws, tasksDb, module.path)
    .filter((p) => p.data.Art === LAB_DATE || p.data.Art === LAB_PREP)
    .sort((a, b) => str(a.data.Fällig).localeCompare(str(b.data.Fällig)))
  const labSession = sessions.find((s) => LAB_TYPES.test(str(s.data.Typ)))
  const belegung = Array.isArray(module.data.Belegung) ? module.data.Belegung.map(String) : []
  const hasLab = !!labSession || belegung.includes('Praktikum') || labTasks.length > 0
  const [planning, setPlanning] = useState(false)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'

  const newSession = () =>
    run(async () => {
      const path = await ws.createRow(timetableDb!.path, `${module.title} – ${t('related.session')}`, {
        Modul: [`[[${ws.linkText(module.path)}]]`],
        Typ: 'Vorlesung',
      })
      openEntry(path)
    })

  const now = new Date()
  const today = isoDay(now)
  const upcoming = labTasks.filter(
    (p) => str(p.data.Fällig).slice(0, 10) >= today && p.data.Status !== 'Erledigt',
  )
  const due = (p: Page) => formatValue({ name: 'Fällig', type: 'date' }, str(p.data.Fällig))

  return (
    <>
      <SessionFocus module={module} labTasks={labTasks} />
      <ModuleLinks module={module} />
      <section aria-label={t('schedule.title')}>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
            <CalendarClock size={13} /> {t('schedule.title')}
          </h3>
          {timetableDb && (
            <Button
              size="sm"
              variant="ghost"
              icon={<CalendarPlus size={13} />}
              onClick={() => void newSession()}
            >
              {t('related.newSession')}
            </Button>
          )}
          {timetableDb && (
            <Button
              size="sm"
              variant="ghost"
              icon={<Search size={13} />}
              onClick={() => void run(() => suggestTimetable(ws, true))}
            >
              {t('related.findTimes')}
            </Button>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t('schedule.none')}</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2" data-testid="module-sessions">
            {sessions.map((s) => {
              const day = str(s.data.Tag)
              const next = day ? nextWeekday(day, now) : null
              const source = str(s.data.Quelle)
              return (
                <li key={s.path}>
                  <button
                    type="button"
                    onClick={(e) => openEntry(s.path, e)}
                    title={source ? t('timetable.source', { source }) : t('schedule.edit')}
                    className="flex w-full items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 text-left hover:bg-hover"
                  >
                    <span className="w-7 shrink-0 text-[13px] font-bold text-accent">{day || '?'}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-medium tabular-nums">
                        {str(s.data.Beginn) || '–'}
                        {str(s.data.Ende) && `–${str(s.data.Ende)}`} · {str(s.data.Typ) || s.title}
                      </span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {[
                          str(s.data.Raum),
                          next &&
                            t('schedule.next', {
                              date: next.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }),
                            }),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    {source && <Info size={13} className="shrink-0 text-ink-3" aria-label={source} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {hasLab && tasksDb && (
        <section aria-label={t('lab.title')}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
              <FlaskConical size={13} /> {t('lab.title')}
            </h3>
            <Button
              size="sm"
              variant={planning ? 'secondary' : 'ghost'}
              icon={<CalendarPlus size={13} />}
              onClick={() => setPlanning((v) => !v)}
            >
              {t('lab.plan')}
            </Button>
          </div>
          {labTasks.length === 0 && !planning && (
            <div className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-line p-2.5 text-[13px] text-ink-2">
              <Sparkles size={14} className="shrink-0 text-accent" />
              <span className="flex-1">
                {labSession
                  ? t('lab.suggest', {
                      day: str(labSession.data.Tag),
                      time: str(labSession.data.Beginn),
                    })
                  : t('lab.suggestNoTime')}
              </span>
              <Button size="sm" variant="primary" onClick={() => setPlanning(true)}>
                {t('lab.review')}
              </Button>
            </div>
          )}
          {planning && (
            <LabPlanner
              ws={ws}
              module={module}
              tasksDb={tasksDb}
              labSession={labSession}
              files={files}
              existing={new Set(labTasks.map((p) => p.title))}
              onDone={() => setPlanning(false)}
            />
          )}
          {upcoming.length > 0 && (
            <ul className="mt-1 space-y-1" data-testid="lab-dates">
              {upcoming.slice(0, 6).map((p) => (
                <li key={p.path} className="flex items-center gap-2 text-[13.5px]">
                  <Chip color={p.data.Art === LAB_DATE ? 'orange' : 'blue'}>
                    {p.data.Art === LAB_DATE ? t('lab.date') : t('lab.prep')}
                  </Chip>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    onClick={(e) => openEntry(p.path, e)}
                  >
                    {p.title.replace(`${module.title} – `, '')}
                  </button>
                  <span className="shrink-0 text-[12px] text-ink-3 tabular-nums">{due(p)}</span>
                  {str(p.data.Erinnerung) && str(p.data.Erinnerung) !== 'Keine' && (
                    <Bell size={12} className="shrink-0 text-ink-3" aria-label={str(p.data.Erinnerung)} />
                  )}
                </li>
              ))}
              {upcoming.length > 6 && (
                <li className="text-[12px] text-ink-3">{t('lab.more', { count: upcoming.length - 6 })}</li>
              )}
            </ul>
          )}
          {labTasks.length > 0 && upcoming.length === 0 && !planning && (
            <p className="text-[13px] text-ink-3">{t('lab.allDone')}</p>
          )}
        </section>
      )}
    </>
  )
}

/** Form: first date, time, rhythm, count, preparation and reminders → preview → "Eintragen". */
function LabPlanner({
  ws,
  module,
  tasksDb,
  labSession,
  files,
  existing,
  onDone,
}: {
  ws: Workspace
  module: Page
  tasksDb: Page
  labSession: Page | undefined
  files: string[]
  existing: Set<string>
  onDone: () => void
}) {
  const run = useAction()
  const sheets = labSheets(files)
  const numbers = Object.keys(sheets).map(Number)
  // Groups ("Praktikum (a)") usually alternate weekly – every other week.
  const groups = /\([a-d]\)|gruppe/i.test(labSession?.title ?? '')
  const [first, setFirst] = useState(() => isoDay(nextWeekday(str(labSession?.data.Tag) || 'Mo', new Date())))
  const [start, setStart] = useState(str(labSession?.data.Beginn))
  const [every, setEvery] = useState(groups ? 2 : 1)
  const [count, setCount] = useState(numbers.length ? Math.max(...numbers) : 6)
  const [prepDays, setPrepDays] = useState(1)
  const [remind, setRemind] = useState<string>('1 Tag vorher')
  const [remindPrep, setRemindPrep] = useState<string>('2 Std. vorher')
  const plan = planLabs({ module: module.title, first, start, everyWeeks: every, count, prepDays, sheets })
  const fresh = plan.filter((e) => !existing.has(e.title))
  const label = 'text-[12px] font-semibold text-ink-2'

  const apply = () =>
    run(async () => {
      // The task database learns the lab kinds and the reminder (once).
      const def = ws.get(tasksDb.path)?.database
      if (def)
        await ws.updateDatabase(tasksDb.path, (d) => ({
          ...d,
          properties: [
            ...d.properties.map((p) =>
              p.name === 'Art' && p.type === 'select'
                ? {
                    ...p,
                    options: [
                      ...(p.options ?? []),
                      ...[LAB_DATE, LAB_PREP]
                        .filter((v) => !(p.options ?? []).some((o) => o.value === v))
                        .map((value) => ({
                          value,
                          color: (value === LAB_DATE ? 'orange' : 'blue') as 'orange' | 'blue',
                        })),
                    ],
                  }
                : p,
            ),
            ...(d.properties.some((p) => p.name === 'Erinnerung')
              ? []
              : [
                  {
                    name: 'Erinnerung',
                    type: 'select' as const,
                    options: REMINDERS.map((value) => ({ value, color: 'gray' as const })),
                  },
                ]),
          ],
        }))
      for (const e of fresh)
        await createLabTask(ws, tasksDb.path, module, e, e.kind === LAB_DATE ? remind : remindPrep)
      const { announce } = await import('@/app/progress')
      announce(t('lab.added', { count: fresh.length }))
      onDone()
    })

  return (
    <div
      className="mt-1 space-y-3 rounded-panel border border-line bg-sunken/50 p-3"
      data-testid="lab-planner"
    >
      <p className="text-[12.5px] text-ink-3">
        {labSession
          ? t('lab.from', { name: labSession.title, sheets: numbers.length })
          : t('lab.fromNothing', { sheets: numbers.length })}
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <label className="space-y-1">
          <span className={label}>{t('lab.first')}</span>
          <TextInput type="date" value={first} onChange={(e) => e.target.value && setFirst(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className={label}>{t('lab.time')}</span>
          <TextInput type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="space-y-1">
          <span className={label}>{t('lab.every')}</span>
          <Select value={every} onChange={(e) => setEvery(Number(e.target.value))}>
            <option value={1}>{t('lab.weekly')}</option>
            <option value={2}>{t('lab.biweekly')}</option>
            <option value={3}>{t('lab.threeWeeks')}</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className={label}>{t('lab.count')}</span>
          <TextInput
            type="number"
            min={1}
            max={30}
            value={count}
            onChange={(e) => setCount(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
          />
        </label>
        <label className="space-y-1">
          <span className={label}>{t('lab.prepDays')}</span>
          <Select value={prepDays} onChange={(e) => setPrepDays(Number(e.target.value))}>
            <option value={0}>{t('lab.noPrep')}</option>
            <option value={1}>{t('lab.daysBefore', { count: 1 })}</option>
            <option value={2}>{t('lab.daysBefore', { count: 2 })}</option>
            <option value={3}>{t('lab.daysBefore', { count: 3 })}</option>
            <option value={7}>{t('lab.daysBefore', { count: 7 })}</option>
          </Select>
        </label>
        <label className="space-y-1">
          <span className={label}>{t('lab.remind')}</span>
          <Select value={remind} onChange={(e) => setRemind(e.target.value)}>
            {REMINDERS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </Select>
        </label>
        {prepDays > 0 && (
          <label className="space-y-1">
            <span className={label}>{t('lab.remindPrep')}</span>
            <Select value={remindPrep} onChange={(e) => setRemindPrep(e.target.value)}>
              {REMINDERS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </label>
        )}
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto text-[13px]" aria-label={t('lab.preview')}>
        {plan.map((e) => (
          <li key={e.title} className={cx('flex gap-2', existing.has(e.title) && 'text-ink-3 line-through')}>
            <span className="w-28 shrink-0 tabular-nums">
              {formatValue({ name: 'Fällig', type: 'date' }, e.due)}
            </span>
            <span className="min-w-0 flex-1 truncate">
              {e.title.replace(`${module.title} – `, '')}
              {e.sheet && (
                <span className="text-ink-3"> · {e.sheet.slice(e.sheet.lastIndexOf('/') + 1)}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!fresh.length} onClick={() => void apply()}>
          {t('lab.apply', { count: fresh.length })}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  )
}

async function createLabTask(ws: Workspace, db: string, module: Page, e: LabEntry, reminder: string) {
  const path = await ws.createRow(db, e.title, {
    Modul: [`[[${ws.linkText(module.path)}]]`],
    Fällig: e.due,
    Art: e.kind,
    Status: 'Offen',
    Erinnerung: reminder,
  })
  if (e.sheet)
    await ws.save(path, {
      body: `${e.kind === LAB_PREP ? t('lab.prepBody') : t('lab.dateBody')}\n\n- [[${ws.linkText(e.sheet)}]]\n`,
    })
}

/**
 * Came from "Als Nächstes" in the status bar: the files that likely belong to this session, the
 * most likely one first (lab sheet planned for the day, file named after the date, lecture/lab
 * folder, recently saved).
 */
function SessionFocus({ module, labTasks }: { module: Page; labTasks: Page[] }) {
  const ws = useWorkspace()
  const focus = useSessionFocus()
  const navigate = useApp((s) => s.navigate)
  // The session was deleted meanwhile: nothing to highlight.
  if (focus.module !== module.path || !focus.start || (focus.source && !ws.get(focus.source))) return null
  const date = new Date(focus.start)
  const day = isoDay(date)
  const folder = materialFolderFor(materialFolder(ws), { name: module.title }, module.title)
  // Sheets linked from the lab tasks of that day.
  const sheets = labTasks
    .filter((p) => str(p.data.Fällig).slice(0, 10) === day)
    .flatMap((p) => [...p.body.matchAll(/\[\[([^\]|#]+)/g)].map((m) => ws.resolveLink(m[1]!, p.path)))
    .filter((p): p is string => !!p)
  const ranked = sessionFiles(
    ws.assets().filter((f) => f.path.startsWith(`${folder}/`)),
    { ...(focus.type ? { type: focus.type } : {}), date },
    new Date(),
    sheets,
  )
  const when = date.toLocaleString(getLanguage() === 'de' ? 'de-DE' : 'en-US', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
  return (
    <section
      aria-label={t('focus.title')}
      data-testid="session-focus"
      className="rounded-panel border-2 border-accent bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] p-3"
    >
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="flex-1 text-[13px] font-semibold">
          {t('focus.title')} · {focus.type ?? ''} {when}
        </h3>
        <button
          type="button"
          className="text-[12px] text-ink-3 hover:text-ink"
          onClick={() => useSessionFocus.setState({ module: null })}
        >
          {t('common.close')}
        </button>
      </div>
      {ranked.length === 0 ? (
        <p className="text-[13px] text-ink-3">{t('focus.none')}</p>
      ) : (
        <ol className="space-y-1">
          {ranked.map((f, i) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => navigate({ name: 'file', path: f.path })}
                className={cx(
                  'flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-hover',
                  i === 0 && 'bg-surface font-semibold shadow-sm',
                )}
              >
                <span className="min-w-0 flex-1 truncate text-[13.5px]">
                  {f.path.slice(f.path.lastIndexOf('/') + 1)}
                </span>
                <span className="shrink-0 text-[11.5px] font-normal text-ink-3">
                  {i === 0 ? t('focus.likely') : t('focus.possible')} · {t(`focus.reason.${f.reason}`)}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * The module's links from Moodle (its courses): Git projects (ProjectBase …) first, each with
 * "Repository ins Praktikum holen"; the others folded away.
 */
function ModuleLinks({ module }: { module: Page }) {
  const snapshot = useMoodle((s) => s.snapshot)
  const courses = courseIdsOf(module.data)
  const links = (snapshot?.materials ?? []).filter((m) => m.kind === 'url' && courses.includes(m.courseId))
  // Same link in several terms: once.
  const unique = links.filter((m, i) => links.findIndex((x) => x.url === m.url) === i)
  if (!unique.length) return null
  const repos = unique.filter((m) => repoUrl(m.url) || maybeRepo(m.url, m.title))
  const others = unique.filter((m) => !repos.includes(m))
  const open = (url: string) => {
    const bridge = electronBridge()
    if (bridge) void bridge.openExternal(url)
    else window.open(url, '_blank', 'noopener')
  }
  const row = (m: (typeof unique)[number]) => (
    <li key={m.id} className="flex flex-wrap items-center gap-x-2 text-[13.5px]">
      <Link2 size={12} className="shrink-0 text-ink-3" />
      <button
        type="button"
        className="min-w-0 truncate text-left text-accent hover:underline"
        title={m.url}
        onClick={() => open(m.url)}
      >
        {m.title}
      </button>
      <RepoButton link={m.url} title={m.title} module={module.path} />
    </li>
  )
  return (
    <section aria-label={t('links.title')}>
      <h3 className="mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
        <Link2 size={13} /> {t('links.title')}
      </h3>
      {repos.length > 0 && <ul className="space-y-0.5">{repos.map(row)}</ul>}
      {others.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[12.5px] text-ink-3 hover:text-ink">
            {t('links.more', { count: others.length })}
          </summary>
          <ul className="mt-1 space-y-0.5">{others.map(row)}</ul>
        </details>
      )}
    </section>
  )
}
