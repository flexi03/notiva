import { CalendarClock, Link2, Package } from 'lucide-react'
import {
  connectLabTasks,
  labTasksOf,
  linkRepoToTask,
  linksTo,
  moduleOfPath,
  reposOf,
  suggestedTask,
} from '@/app/labLinks'
import { announce } from '@/app/progress'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { formatValue } from '@/lib/database'
import { LAB_DATE } from '@/lib/labPlan'
import type { Page } from '@/lib/workspace'
import { Button, Chip } from '@/components/ui'

const due = (p: Page) => formatValue({ name: 'Fällig', type: 'date' }, String(p.data.Fällig ?? ''))

/** In a lab folder: the module's lab dates and preparations – with the repository each belongs to. */
export function LabDates({ lab }: { lab: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const openEntry = useApp((s) => s.openEntry)
  const navigate = useApp((s) => s.navigate)
  const module = moduleOfPath(ws, lab.path)
  if (!module) return null
  const tasks = labTasksOf(ws, module.path)
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = tasks.filter(
    (p) => String(p.data.Fällig ?? '').slice(0, 10) >= today && p.data.Status !== 'Erledigt',
  )
  const loose = tasks.filter((p) => !linksTo(ws, p, lab.path)).length
  return (
    <div data-testid="lab-dates-folder">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
          <CalendarClock size={13} /> {t('lab.dates')}
        </h3>
        {loose > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Link2 size={13} />}
            onClick={() =>
              void run(async () => {
                const n = await connectLabTasks(ws, module.path, lab.path)
                announce(t('lab.connected', { count: n }))
              })
            }
          >
            {t('lab.connect', { count: loose })}
          </Button>
        )}
      </div>
      {tasks.length === 0 ? (
        <p className="text-[13px] text-ink-3">{t('lab.noDates')}</p>
      ) : (
        <ul className="space-y-0.5">
          {(upcoming.length ? upcoming : tasks).slice(0, 8).map((p) => (
            <li key={p.path} className="flex flex-wrap items-center gap-2 text-[13px]">
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
              <span className="text-[12px] text-ink-3 tabular-nums">{due(p)}</span>
              {reposOf(ws, p).map((r) => (
                <button
                  key={r.path}
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 text-[11.5px] hover:bg-hover"
                  onClick={() => navigate({ name: 'page', path: r.path })}
                >
                  <Package size={10} /> {r.title}
                </button>
              ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** On a repository's page: the lab date it belongs to – suggested by its number, or chosen. */
export function RepoTask({ repo }: { repo: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const openEntry = useApp((s) => s.openEntry)
  const module = moduleOfPath(ws, repo.path)
  if (!module) return null
  const target =
    typeof repo.data.termin === 'string' ? /\[\[([^\]|#]+)/.exec(repo.data.termin)?.[1] : undefined
  const linkedPath = target ? ws.resolveLink(target, repo.path) : null
  const linked = linkedPath ? ws.get(linkedPath) : undefined
  const dates = labTasksOf(ws, module.path).filter((p) => p.data.Art === LAB_DATE)
  const suggestion = linked ? null : suggestedTask(ws, repo, module.path)
  const short = (p: Page) => p.title.replace(`${module.title} – `, '')
  const pick = () =>
    run(async () => {
      const chosen = await useApp.getState().ask({
        title: t('repo.pickTitle', { name: repo.title }),
        confirmLabel: t('repo.taskPick'),
        choices: dates.map((p) => ({ value: p.path, label: `${short(p)} · ${due(p)}` })),
        ...(suggestion ? { initial: suggestion.path } : {}),
      })
      const task = chosen ? ws.get(chosen) : undefined
      if (!task) return
      await linkRepoToTask(ws, repo, task, module.path)
      announce(t('repo.taskLinked', { task: short(task) }))
    })
  return (
    <div className="flex flex-wrap items-center gap-2 text-[13px]" data-testid="repo-task">
      <CalendarClock size={14} className="shrink-0 text-accent" />
      <span className="font-semibold">{t('repo.task')}:</span>
      {linked ? (
        <>
          <button type="button" className="hover:underline" onClick={(e) => openEntry(linked.path, e)}>
            {short(linked)} · {due(linked)}
          </button>
          {dates.length > 1 && (
            <Button size="sm" variant="ghost" onClick={() => void pick()}>
              {t('repo.taskChange')}
            </Button>
          )}
        </>
      ) : (
        <>
          <span className="text-ink-3">{t('repo.taskNone')}</span>
          {suggestion && (
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                void run(async () => {
                  await linkRepoToTask(ws, repo, suggestion, module.path)
                  announce(t('repo.taskLinked', { task: short(suggestion) }))
                })
              }
            >
              {t('repo.taskSuggest', { task: short(suggestion), date: due(suggestion) })}
            </Button>
          )}
          {dates.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => void pick()}>
              {t('repo.taskPick')}
            </Button>
          )}
        </>
      )}
    </div>
  )
}
