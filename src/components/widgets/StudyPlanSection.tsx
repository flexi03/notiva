import { useState } from 'react'
import { CalendarCheck2, X } from 'lucide-react'
import { useDone } from '@/app/hooks/useDone'
import {
  declinePlan,
  moduleFiles,
  modulePages,
  modulePlan,
  nextExam,
  planSuggestions,
  remindLater,
  savePlan,
  today,
  type ModuleRef,
} from '@/app/studyPlan'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import {
  ALL_DAYS,
  daysUntil,
  defaultPlan,
  planFrom,
  planTopics,
  studyDays,
  WEEKDAYS,
  type StudyPlanSettings,
  type Topic,
} from '@/lib/studyPlan'
import { Button, Checkbox, cx, TextInput } from '@/components/ui'

/**
 * On a module page: the study plan – suggested before an exam (start, remind later, no), set up
 * with your study days, and then today's portion to tick off and the next days.
 */
export function StudyPlanSection({ module }: { module: ModuleRef }) {
  const ws = useWorkspace()
  const run = useAction()
  const [editing, setEditing] = useState<StudyPlanSettings | null>(null)
  const plan = modulePlan(ws, module)
  const day = today()
  const exam = nextExam(ws, module, day)
  const { folder, files } = moduleFiles(ws, module)
  const topics = plan?.topics ?? planTopics(files, folder)
  const suggested = !plan && planSuggestions(ws, day).some((s) => s.module.path === module.path)
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const date = (iso: string, opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit' }) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, opts)
  const startEditing = () => setEditing(plan?.settings ?? defaultPlan(exam ?? day, day))

  if (editing)
    return (
      <PlanForm
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={(s) =>
          void run(async () => {
            await savePlan(ws, module, s)
            setEditing(null)
          })
        }
      />
    )

  if (!plan)
    return (
      <section aria-label={t('studyPlan.title')} data-testid="study-plan">
        {suggested && exam ? (
          <div className="rounded-control border border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-2.5">
            <p className="mb-2 flex items-start gap-2 text-[13px]">
              <CalendarCheck2 size={15} className="mt-0.5 shrink-0 text-accent" />
              {t('studyPlan.recommend', {
                days: daysUntil(exam, day),
                date: date(exam),
                count: topics.length,
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={startEditing}>
                {t('studyPlan.start')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => remindLater(ws, module))}>
                {t('studyPlan.later')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void run(() => declinePlan(ws, module))}>
                {t('studyPlan.no')}
              </Button>
            </div>
          </div>
        ) : (
          topics.length > 0 && (
            <Button size="sm" variant="ghost" icon={<CalendarCheck2 size={13} />} onClick={startEditing}>
              {t('studyPlan.start')}
            </Button>
          )
        )}
      </section>
    )

  return <ActivePlan module={module} settings={plan.settings} topics={plan.topics} onEdit={startEditing} />
}

function ActivePlan({
  module,
  settings,
  topics,
  onEdit,
}: {
  module: ModuleRef
  settings: StudyPlanSettings
  topics: Topic[]
  onEdit: () => void
}) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const { done, toggle } = useDone(module)
  const day = today()
  const plan = planFrom(topics, done, settings, day)
  const todays = plan[0]?.date === day ? plan[0].topics : []
  const left = studyDays(settings, day).length
  const count = topics.filter((x) => done.has(x.key)).length
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const label = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale, {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    })

  return (
    <section aria-label={t('studyPlan.title')} data-testid="study-plan">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
          <CalendarCheck2 size={13} /> {t('studyPlan.title')}
        </h3>
        <span className="text-[12px] text-ink-3" data-testid="study-plan-progress">
          {t('studyPlan.progress', { done: count, total: topics.length, days: left })}
        </span>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          {t('studyPlan.edit')}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void run(() => savePlan(ws, module, null))}>
          {t('studyPlan.stop')}
        </Button>
      </div>
      {!topics.length ? (
        <p className="text-[13px] text-ink-3">{t('studyPlan.noTopics', { module: module.title })}</p>
      ) : count === topics.length ? (
        <p className="text-[13px] text-ink-3">{t('studyPlan.allDone')}</p>
      ) : !left ? (
        <p className="text-[13px] text-danger">{t('studyPlan.noDays')}</p>
      ) : (
        <>
          <h4 className="mb-0.5 text-[12px] text-ink-3">{t('studyPlan.today')}</h4>
          {todays.length ? (
            <ul className="space-y-0.5" data-testid="study-plan-today">
              {todays.map((topic) => (
                <TopicRow
                  key={topic.key}
                  topic={topic}
                  done={done.has(topic.key)}
                  onToggle={() => toggle(topic.key)}
                />
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink-3">{t('studyPlan.noToday')}</p>
          )}
          {plan.some((d) => d.date !== day && d.topics.length) && (
            <>
              <h4 className="mt-2 mb-0.5 text-[12px] text-ink-3">{t('studyPlan.next')}</h4>
              <ul className="space-y-0.5 text-[13px]">
                {plan
                  .filter((d) => d.date !== day && d.topics.length)
                  .slice(0, 5)
                  .map((d) => (
                    <li key={d.date} className="flex gap-2">
                      <span className="w-20 shrink-0 text-ink-3 tabular-nums">{label(d.date)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {d.topics.map((x, i) => (
                          <button
                            key={x.key}
                            type="button"
                            className="hover:underline"
                            onClick={() => navigate({ name: 'file', path: x.path })}
                          >
                            {i > 0 && ', '}
                            {x.key.replace(/\.[^.]+$/, '')}
                          </button>
                        ))}
                      </span>
                    </li>
                  ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}

/** One topic: tick it off, open the file. Also used by "Heute". */
export function TopicRow({ topic, done, onToggle }: { topic: Topic; done: boolean; onToggle: () => void }) {
  const navigate = useApp((s) => s.navigate)
  return (
    <li className="flex items-center gap-2 text-[13px]">
      <Checkbox label={t('studyPlan.doneFor', { name: topic.key })} checked={done} onChange={onToggle} />
      <button
        type="button"
        className={cx('min-w-0 flex-1 truncate text-left hover:underline', done && 'text-ink-3 line-through')}
        onClick={() => navigate({ name: 'file', path: topic.path })}
      >
        {topic.key.replace(/\.[^.]+$/, '')}
      </button>
    </li>
  )
}

/** Start, exam, study days (presets or each weekday), days off, days for old exams. */
function PlanForm({
  initial,
  onSave,
  onCancel,
}: {
  initial: StudyPlanSettings
  onSave: (s: StudyPlanSettings) => void
  onCancel: () => void
}) {
  const [s, setS] = useState(initial)
  const [skipDay, setSkipDay] = useState('')
  const names = t('studyPlan.dayNames').split(',')
  const same = (a: readonly number[]) =>
    a.length === s.weekdays.length && a.every((d) => s.weekdays.includes(d))
  const valid = s.start && s.exam && s.start < s.exam && s.weekdays.length > 0
  return (
    <section
      aria-label={t('studyPlan.setup')}
      data-testid="study-plan-form"
      className="space-y-2 text-[13px]"
    >
      <h3 className="text-[12.5px] font-semibold text-ink-2">{t('studyPlan.setup')}</h3>
      <div className="flex flex-wrap gap-3">
        <label className="flex items-center gap-2">
          {t('studyPlan.from')}
          <TextInput
            type="date"
            value={s.start}
            onChange={(e) => setS({ ...s, start: e.target.value })}
            className="w-40"
          />
        </label>
        <label className="flex items-center gap-2">
          {t('studyPlan.exam')}
          <TextInput
            type="date"
            value={s.exam}
            onChange={(e) => setS({ ...s, exam: e.target.value })}
            className="w-40"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('studyPlan.days')}>
        <span className="mr-1">{t('studyPlan.days')}</span>
        {names.map((n, i) => (
          <button
            key={n}
            type="button"
            aria-pressed={s.weekdays.includes(i)}
            onClick={() =>
              setS({
                ...s,
                weekdays: s.weekdays.includes(i)
                  ? s.weekdays.filter((d) => d !== i)
                  : [...s.weekdays, i].sort(),
              })
            }
            className={cx(
              'h-7 min-w-9 rounded-full border px-2 text-[12.5px]',
              s.weekdays.includes(i)
                ? 'border-accent bg-accent text-on-accent'
                : 'border-line hover:bg-hover',
            )}
          >
            {n}
          </button>
        ))}
        <Button
          size="sm"
          variant={same(WEEKDAYS) ? 'primary' : 'ghost'}
          onClick={() => setS({ ...s, weekdays: [...WEEKDAYS] })}
        >
          {t('studyPlan.weekdays')}
        </Button>
        <Button
          size="sm"
          variant={same(ALL_DAYS) ? 'primary' : 'ghost'}
          onClick={() => setS({ ...s, weekdays: [...ALL_DAYS] })}
        >
          {t('studyPlan.everyDay')}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1">{t('studyPlan.skip')}</span>
        {s.skip.map((d) => (
          <span
            key={d}
            className="inline-flex items-center gap-1 rounded-full border border-line px-2 tabular-nums"
          >
            {d}
            <button
              type="button"
              aria-label={`${d} ×`}
              onClick={() => setS({ ...s, skip: s.skip.filter((x) => x !== d) })}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <TextInput
          type="date"
          aria-label={t('studyPlan.skipAdd')}
          value={skipDay}
          onChange={(e) => setSkipDay(e.target.value)}
          className="h-8 w-40"
        />
        <Button
          size="sm"
          variant="ghost"
          disabled={!skipDay || s.skip.includes(skipDay)}
          onClick={() => {
            setS({ ...s, skip: [...s.skip, skipDay].sort() })
            setSkipDay('')
          }}
        >
          {t('studyPlan.skipAdd')}
        </Button>
      </div>
      <label className="flex items-center gap-2">
        {t('studyPlan.examDays')}
        <TextInput
          type="number"
          min={0}
          max={14}
          value={s.examDays}
          onChange={(e) => setS({ ...s, examDays: Math.max(0, Math.min(14, Number(e.target.value) || 0)) })}
          className="w-20"
        />
      </label>
      <div className="flex gap-2">
        <Button variant="primary" disabled={!valid} onClick={() => onSave(s)}>
          {t('studyPlan.save')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </section>
  )
}

/** "Heute": the portion of every study plan for that day, to tick off right there. */
export function StudyPlanDay({ date }: { date: string }) {
  const ws = useWorkspace()
  const day = today()
  if (date < day) return null
  const plans = modulePages(ws).flatMap((module) => {
    const plan = modulePlan(ws, module)
    if (!plan) return []
    const portion = planFrom(plan.topics, plan.done, plan.settings, day).find((d) => d.date === date)
    return portion?.topics.length ? [{ module, topics: portion.topics }] : []
  })
  if (!plans.length) return null
  return (
    <div className="mt-3 border-t border-line pt-2" data-testid="day-study">
      <h3 className="mb-1 flex items-center gap-1.5 px-2 text-[12.5px] font-semibold text-ink-2">
        <CalendarCheck2 size={13} /> {t('studyPlan.learnToday')}
      </h3>
      {plans.map(({ module, topics }) => (
        <ModulePortion key={module.path} module={module} topics={topics} />
      ))}
    </div>
  )
}

function ModulePortion({ module, topics }: { module: ModuleRef; topics: Topic[] }) {
  const { done, toggle } = useDone(module)
  const openPage = useApp((s) => s.openPage)
  return (
    <div className="px-2">
      <button
        type="button"
        className="text-[12px] text-ink-3 hover:underline"
        onClick={() => openPage(module.path)}
      >
        {module.title}
      </button>
      <ul className="space-y-0.5">
        {topics.map((topic) => (
          <TopicRow
            key={topic.key}
            topic={topic}
            done={done.has(topic.key)}
            onToggle={() => toggle(topic.key)}
          />
        ))}
      </ul>
    </div>
  )
}
