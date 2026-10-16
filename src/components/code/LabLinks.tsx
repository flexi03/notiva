import { CalendarClock, Link2, Package } from 'lucide-react'
import { labNumber, labTasksOf, linkRepoToTask, moduleOfPath, reposOf, suggestedTask } from '@/app/labLinks'
import { applyStructure, hubName, hubsOf, planStructure, taskNumber } from '@/app/labHubs'
import { loadClones, useClones } from '@/app/clones'
import { announce } from '@/app/progress'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { formatValue } from '@/lib/database'
import { LAB_DATE } from '@/lib/labPlan'
import type { Page } from '@/lib/workspace'
import { Button, Chip, cx } from '@/components/ui'

const due = (p: Page) => formatValue({ name: 'Fällig', type: 'date' }, String(p.data.Fällig ?? ''))

/**
 * In a lab folder: its sessions (P01, P02 …) – each with its date, preparation and repositories,
 * past ones included (faded). "Nach Praktika ordnen" creates the session pages, moves numbered
 * repositories there and links the dates – after showing what it would do.
 */
export function LabDates({ lab }: { lab: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const clones = useClones((s) => s[lab.path.slice(0, -3)]) ?? []
  const module = moduleOfPath(ws, lab.path)
  if (!module) return null
  const folder = lab.path.slice(0, -3)
  const tasks = labTasksOf(ws, module.path)
  const hubs = hubsOf(ws, folder)
  const repos = clones.map((c) => {
    const page = ws.get(`${folder}/${c.name}.md`)
    return { name: c.name, n: labNumber(`${c.name} ${page?.title ?? ''}`) }
  })
  const plan = planStructure(ws, folder, module.path, repos)
  const work = plan.hubs.length + plan.repos.length + plan.tasks.length
  const numbers = [
    ...new Set([...hubs.keys(), ...tasks.flatMap((p) => (taskNumber(p) ? [taskNumber(p)!] : []))]),
  ].sort((a, b) => a - b)
  const today = new Date().toISOString().slice(0, 10)
  const short = (p: Page) => p.title.replace(`${module.title} – `, '')

  const organise = () =>
    run(async () => {
      const lines = [
        ...plan.hubs.map((n) => t('structure.hub', { name: hubName(n) })),
        ...plan.repos.map((r) => t('structure.repo', { name: r.name, hub: hubName(r.n) })),
        ...(plan.tasks.length ? [t('structure.tasks', { count: plan.tasks.length })] : []),
      ]
      const ok = await useApp.getState().ask({
        title: t('structure.title', { name: lab.title }),
        label: lines.map((l) => `• ${l}`).join('\n'),
        confirmLabel: t('structure.apply'),
        confirm: true,
      })
      if (ok === null) return
      const n = await applyStructure(ws, folder, plan)
      await loadClones(folder)
      announce(t('structure.done', { count: n }))
    })

  return (
    <div data-testid="lab-dates-folder">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="flex flex-1 items-center gap-1.5 text-[12.5px] font-semibold text-ink-2">
          <CalendarClock size={13} /> {t('lab.sessions')}
        </h3>
        {work > 0 && (
          <Button size="sm" variant="primary" icon={<Link2 size={13} />} onClick={() => void organise()}>
            {t('structure.button', { count: work })}
          </Button>
        )}
      </div>
      {numbers.length === 0 ? (
        <p className="text-[13px] text-ink-3">{t('lab.noDates')}</p>
      ) : (
        <ul className="space-y-1">
          {numbers.map((n) => {
            const own = tasks.filter((p) => taskNumber(p) === n)
            const date = own.find((p) => p.data.Art === LAB_DATE)
            const past = !!date && String(date.data.Fällig ?? '').slice(0, 10) < today
            const hub = hubs.get(n)
            return (
              <li
                key={n}
                className={cx('flex flex-wrap items-center gap-2 text-[13px]', past && 'opacity-60')}
              >
                <button
                  type="button"
                  disabled={!hub}
                  onClick={() => hub && navigate({ name: 'page', path: hub.path })}
                  className="w-12 shrink-0 text-left font-semibold text-accent enabled:hover:underline disabled:text-ink-2"
                >
                  {hubName(n)}
                </button>
                <span className="min-w-0 flex-1 truncate">
                  {own.map((p) => (
                    <button
                      key={p.path}
                      type="button"
                      className="mr-2 inline-flex items-center gap-1 hover:underline"
                      onClick={(e) => useApp.getState().openEntry(p.path, e)}
                    >
                      <Chip color={p.data.Art === LAB_DATE ? 'orange' : 'blue'}>
                        {p.data.Art === LAB_DATE ? t('lab.date') : t('lab.prep')}
                      </Chip>
                      <span className="tabular-nums text-ink-2">{due(p)}</span>
                    </button>
                  ))}
                  {!own.length && <span className="text-ink-3">{short(hub ?? lab)}</span>}
                </span>
                {own
                  .flatMap((p) => reposOf(ws, p))
                  .filter((r, i, a) => a.findIndex((x) => x.path === r.path) === i)
                  .map((r) => (
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
            )
          })}
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
