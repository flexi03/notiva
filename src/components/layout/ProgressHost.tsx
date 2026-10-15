import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react'
import { useProgress } from '@/app/progress'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { Button, cx, IconButton } from '@/components/ui'

/** Running actions with progress bars, then a confirmation – bottom left, above everything. */
export function ProgressHost() {
  const { tasks, dismiss } = useProgress()
  // Above the event badge when that sits bottom left.
  const badgeBelow = useApp((s) => s.settings.eventBadge === 'bottom-left')
  if (tasks.length === 0) return null
  return (
    <div
      aria-live="polite"
      className={`no-print fixed ${badgeBelow ? 'bottom-20' : 'bottom-4'} left-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2`}
    >
      {tasks.map((task) => {
        const percent = task.total ? Math.min(100, Math.round((task.done / task.total) * 100)) : null
        return (
          <div
            key={task.id}
            role={task.state === 'error' ? 'alert' : 'status'}
            data-testid="progress-task"
            data-state={task.state}
            className="rounded-panel border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
          >
            <div className="flex items-start gap-2">
              {task.state === 'done' ? (
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              ) : task.state === 'error' ? (
                <CircleAlert size={16} className="mt-0.5 shrink-0 text-danger" aria-hidden />
              ) : task.state === 'info' ? (
                <Info size={16} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {task.state === 'running' ? task.label : task.message}
                </p>
                {task.state === 'running' && task.detail && (
                  <p className="truncate text-[12.5px] text-ink-3">{task.detail}</p>
                )}
                {task.state === 'error' && <p className="text-[12.5px] text-ink-3">{task.label}</p>}
                {task.state !== 'running' && task.note && (
                  <p className="text-[12.5px] whitespace-pre-line text-ink-2">{task.note}</p>
                )}
                {task.state !== 'running' && task.action && (
                  <Button
                    size="sm"
                    variant={task.state === 'info' ? 'primary' : 'secondary'}
                    className="mt-2"
                    onClick={() => {
                      task.action!.run()
                      // Following the hint is not "never show again".
                      useProgress.setState((st) => ({ tasks: st.tasks.filter((x) => x.id !== task.id) }))
                    }}
                  >
                    {task.action.label}
                  </Button>
                )}
              </div>
              {task.state === 'running' && percent !== null && (
                <span className="text-[12px] text-ink-2 tabular-nums">{percent} %</span>
              )}
              {task.state !== 'running' && (
                <IconButton size="sm" label={t('common.close')} onClick={() => dismiss(task.id)}>
                  <X size={13} />
                </IconButton>
              )}
            </div>
            {task.state === 'running' && (
              <div
                role="progressbar"
                aria-label={task.label}
                aria-valuemin={0}
                aria-valuemax={100}
                {...(percent !== null ? { 'aria-valuenow': percent } : {})}
                className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken"
              >
                <div
                  className={cx(
                    'h-full rounded-full bg-accent',
                    percent === null && 'w-1/3 animate-[progress-slide_1.2s_ease-in-out_infinite]',
                  )}
                  style={percent !== null ? { width: `${percent}%`, transition: 'width 200ms' } : undefined}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
