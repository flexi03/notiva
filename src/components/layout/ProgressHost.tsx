import { useEffect, useState } from 'react'
import { CheckCircle2, CircleAlert, Info, Loader2, X } from 'lucide-react'
import { useProgress, type ProgressTask } from '@/app/progress'
import { t } from '@/i18n'
import { duration } from '@/lib/schedule'
import { Button, cx, IconButton } from '@/components/ui'

/** "12 / 40 · noch ~2 Min." – count and remaining time once the speed is known. */
export function progressText(task: ProgressTask, now: number): string {
  if (!task.total) return ''
  const count = `${task.done} / ${task.total}`
  const elapsed = now - (task.startedAt ?? now)
  if (task.done <= 0 || elapsed < 2500 || task.done >= task.total) return count
  const left = ((task.total - task.done) * elapsed) / task.done
  return `${count} · ${t('progress.left', { time: duration(Math.max(left, 1000)) })}`
}

/** The current time, ticking every second while `active` (for the remaining time). */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

/**
 * In the status bar: the running task (bar, count, remaining time) or the latest message. A click
 * opens the list with all of them – it never covers the content by itself, except for errors and
 * hints that wait for the user.
 */
export function ProgressSummary() {
  const { tasks, open, setOpen } = useProgress()
  const running = tasks.find((x) => x.state === 'running')
  const now = useNow(!!running)
  if (!tasks.length) return null
  // What matters most: running, then an error, then the latest result; hints are counted.
  const results = tasks.filter((x) => !x.sticky)
  const errors = tasks.filter((x) => x.state === 'error')
  const hints = tasks.filter((x) => x.sticky && x.state !== 'error')
  const task = running ?? errors[errors.length - 1] ?? results[results.length - 1] ?? hints[hints.length - 1]!
  const percent = task.total ? Math.min(100, Math.round((task.done / task.total) * 100)) : null
  return (
    <button
      type="button"
      aria-expanded={open}
      data-testid="progress-summary"
      onClick={() => setOpen(!open)}
      title={t('progress.show')}
      className={cx(
        'inline-flex h-full max-w-[min(32rem,50vw)] min-w-0 items-center gap-1.5 rounded-control px-1.5 hover:bg-hover',
        task.state === 'error' ? 'text-danger' : 'text-ink-2',
      )}
    >
      {task.state === 'running' ? (
        <Loader2 size={13} className="shrink-0 animate-spin text-accent" aria-hidden />
      ) : task.state === 'error' ? (
        <CircleAlert size={13} className="shrink-0" aria-hidden />
      ) : (
        <CheckCircle2 size={13} className="shrink-0 text-accent" aria-hidden />
      )}
      <span className="truncate">{task.state === 'running' ? task.label : task.message}</span>
      {task.state === 'running' && percent !== null && (
        <>
          <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-line" aria-hidden>
            <span className="block h-full bg-accent" style={{ width: `${percent}%` }} />
          </span>
          <span className="shrink-0 tabular-nums">{progressText(task, now)}</span>
        </>
      )}
      {hints.length > 0 && task.sticky !== true && (
        <span className="shrink-0 rounded-full bg-accent px-1.5 font-semibold text-on-accent tabular-nums">
          {t('progress.hints', { count: hints.length })}
        </span>
      )}
    </button>
  )
}

/** The list of running actions and messages – opened from the status bar, above it on the right. */
export function ProgressHost() {
  const { tasks, dismiss, open, setOpen } = useProgress()
  const now = useNow(open && tasks.some((x) => x.state === 'running'))
  if (tasks.length === 0 || !open) return null
  return (
    <div
      aria-live="polite"
      // Below open dialogs (z-45): a hint must never cover a dialog's buttons.
      className="no-print absolute right-2 bottom-full z-[44] mb-1 flex max-h-[70vh] w-[min(24rem,calc(100vw-1rem))] flex-col gap-2 overflow-y-auto"
    >
      <div className="flex justify-end">
        <IconButton
          size="sm"
          label={t('progress.hide')}
          onClick={() => setOpen(false)}
          className="bg-surface shadow"
        >
          <X size={13} />
        </IconButton>
      </div>
      {tasks.map((task) => {
        const percent = task.total ? Math.min(100, Math.round((task.done / task.total) * 100)) : null
        return (
          <div
            key={task.id}
            role={task.state === 'error' ? 'alert' : 'status'}
            data-testid="progress-task"
            data-state={task.state}
            className="pointer-events-auto rounded-panel border border-line bg-surface p-3 shadow-[var(--shadow-pop)]"
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
                <span className="text-[12px] text-ink-2 tabular-nums">
                  {percent} %{task.total ? ` · ${progressText(task, now)}` : ''}
                </span>
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
