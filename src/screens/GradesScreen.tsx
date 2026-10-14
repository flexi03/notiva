import { Fragment, useEffect, useMemo, useState } from 'react'
import { ChevronRight, RefreshCw } from 'lucide-react'
import { ecampusAvailable, useEcampus } from '@/app/ecampus'
import { withProgress } from '@/app/progress'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import {
  moduleResults,
  planExamImport,
  resultSummary,
  type ExamRecord,
  type ModuleResult,
} from '@/lib/ecampus'
import { applyMoodleImport, importTargets } from '@/lib/moodle'
import { Button, Checkbox, cx, Dialog, EmptyState } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

const STATUS_CLASS: Record<ExamRecord['status'] | ModuleResult['status'], string> = {
  passed: 'bg-[var(--opt-green)] text-[var(--opt-green-ink)]',
  failed: 'bg-[var(--opt-orange)] text-[var(--opt-orange-ink)]',
  failedFinal: 'bg-[var(--opt-red)] text-[var(--opt-red-ink)]',
  registered: 'bg-[var(--opt-blue)] text-[var(--opt-blue-ink)]',
  open: 'bg-[var(--opt-gray)] text-[var(--opt-gray-ink)]',
  other: 'bg-[var(--opt-gray)] text-[var(--opt-gray-ink)]',
}

/** "Noten & Leistungen": all exam results from eCampus, with import into the module database. */
export function GradesScreen() {
  const { status, snapshot, busy, error, refresh, fetchNow, importOpen, setImportOpen } = useEcampus()
  const navigate = useApp((s) => s.navigate)
  useEffect(() => {
    if (ecampusAvailable()) void refresh()
  }, [refresh])

  const records = snapshot?.records ?? []
  const results = useMemo(() => moduleResults(records), [records])
  const { credits, average, passed } = resultSummary(results)
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (key: string) =>
    setOpen((s) => {
      const next = new Set(s)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'

  return (
    <>
      <Topbar title={t('grades.title')} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-10 sm:px-10">
        <div className="mb-6 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[2rem] font-bold">{t('grades.title')}</h1>
            {snapshot && (
              <p className="text-[13px] text-ink-3">
                {t('grades.source', { time: new Date(snapshot.fetchedAt).toLocaleString(locale) })}
              </p>
            )}
          </div>
          {status?.connected && (
            <>
              <Button
                icon={<RefreshCw size={15} className={busy ? 'animate-spin' : ''} />}
                disabled={busy}
                onClick={() => void fetchNow()}
              >
                {t('moodle.screen.refresh')}
              </Button>
              <Button variant="primary" disabled={!records.length} onClick={() => setImportOpen(true)}>
                {t('grades.import')}
              </Button>
            </>
          )}
        </div>
        {error && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {error}
          </p>
        )}
        {!ecampusAvailable() ? (
          <EmptyState title={t('ecampus.desktopOnly')} />
        ) : !status?.connected ? (
          <EmptyState
            title={t('grades.notConnected')}
            action={
              <Button variant="primary" onClick={() => navigate({ name: 'settings' })}>
                {t('grades.connect')}
              </Button>
            }
          />
        ) : (
          <>
            <dl className="mb-6 grid grid-cols-3 gap-3">
              {[
                [
                  t('grades.average'),
                  average
                    ? average.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
                    : '–',
                ],
                [t('grades.credits'), credits.toLocaleString(locale)],
                [t('grades.passed'), String(passed)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-panel border border-line bg-surface p-3">
                  <dt className="text-[12.5px] text-ink-3">{label}</dt>
                  <dd className="text-2xl font-bold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="overflow-x-auto rounded-panel border border-line">
              <table className="w-full text-sm" aria-label={t('grades.table')}>
                <thead className="bg-sunken text-left text-[12.5px] text-ink-2">
                  <tr>
                    <th className="px-3 py-2">{t('grades.module')}</th>
                    <th className="px-3 py-2 text-right">{t('grades.grade')}</th>
                    <th className="px-3 py-2">{t('grades.status')}</th>
                    <th className="px-3 py-2 text-right">ECTS</th>
                    <th className="px-3 py-2 text-right">{t('grades.tries')}</th>
                    <th className="px-3 py-2">{t('grades.passedIn')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {results.map((m) => {
                    const expanded = open.has(m.key)
                    return (
                      <Fragment key={m.key}>
                        <tr>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="flex items-start gap-1 text-left"
                              aria-expanded={expanded}
                              onClick={() => toggle(m.key)}
                            >
                              <ChevronRight
                                size={14}
                                className={cx(
                                  'mt-0.5 shrink-0 text-ink-3 transition-transform',
                                  expanded && 'rotate-90',
                                )}
                              />
                              <span>
                                <span className="font-medium">{m.title}</span>
                                {m.number && (
                                  <span className="ml-1.5 text-[12px] text-ink-3">{m.number}</span>
                                )}
                              </span>
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {m.status === 'passed' ? (m.gradeText ?? '') : ''}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cx(
                                'rounded-full px-2 py-0.5 text-[12px] whitespace-nowrap',
                                STATUS_CLASS[m.status],
                              )}
                            >
                              {t(`grades.state.${m.status}`)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {m.status === 'passed' ? (m.credits ?? '') : ''}
                          </td>
                          <td
                            className={cx(
                              'px-3 py-2 text-right tabular-nums',
                              m.status !== 'passed' && m.failedTries >= 2 && 'font-semibold text-danger',
                            )}
                          >
                            {m.tries || ''}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-ink-2">
                            {m.status === 'passed' ? m.semester : ''}
                          </td>
                        </tr>
                        {expanded &&
                          m.attempts.map((a) => (
                            <tr key={a.id} className="bg-sunken/50 text-[13px]">
                              <td className="py-1.5 pr-3 pl-9 text-ink-2">
                                {a.attempt ? t('grades.attempt', { n: a.attempt }) : a.title}
                                {a.remark && <span className="ml-1.5 text-ink-3">({a.remark})</span>}
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums">{a.gradeText ?? ''}</td>
                              <td className="px-3 py-1.5">
                                <span
                                  className={cx(
                                    'rounded-full px-2 py-0.5 text-[12px] whitespace-nowrap',
                                    STATUS_CLASS[a.status],
                                  )}
                                >
                                  {a.statusText}
                                </span>
                              </td>
                              <td className="px-3 py-1.5 text-right tabular-nums text-ink-3">
                                {a.credits || ''}
                              </td>
                              <td className="px-3 py-1.5 text-right text-ink-3 tabular-nums">
                                {a.date ? new Date(`${a.date}T12:00:00`).toLocaleDateString(locale) : ''}
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap text-ink-2">{a.semester}</td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {importOpen && <GradesImportDialog records={records} onClose={() => setImportOpen(false)} />}
    </>
  )
}

function GradesImportDialog({ records, onClose }: { records: ExamRecord[]; onClose: () => void }) {
  const ws = useWorkspace()
  const run = useAction()
  const modulesDb = importTargets(ws).find((x) => x.modules)?.modules
  const plan = useMemo(
    () => (modulesDb ? planExamImport(ws, records, modulesDb) : []),
    [ws, records, modulesDb],
  )
  const [skipped, setSkipped] = useState(new Set<string>())
  const chosen = plan.filter((p) => !skipped.has(p.key))
  const detail = (values: Record<string, unknown>) =>
    Object.entries(values)
      .filter(([k]) => k !== 'pruefung')
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(' · ')
  return (
    <Dialog open onClose={onClose} title={t('grades.importTitle')} size="lg" closeLabel={t('common.close')}>
      {!modulesDb ? (
        <p className="text-sm">{t('moodle.import.noTarget')}</p>
      ) : plan.length === 0 ? (
        <p role="status" className="text-sm text-accent">
          {t('grades.upToDate')}
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-panel border border-line">
          {plan.map((p) => (
            <li key={p.key}>
              <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-hover">
                <Checkbox
                  checked={!skipped.has(p.key)}
                  onChange={(on) =>
                    setSkipped((s) => {
                      const next = new Set(s)
                      if (on) next.delete(p.key)
                      else next.add(p.key)
                      return next
                    })
                  }
                  label={p.title}
                  className="mt-0.5"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm">
                    {p.title}{' '}
                    <span className="text-[12px] text-ink-3">
                      {p.kind === 'create' ? t('grades.newModule') : ''}
                    </span>
                  </span>
                  <span className="block text-[12.5px] text-ink-3">
                    {detail(p.kind === 'create' ? p.values : p.changes)}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {plan.length ? t('common.cancel') : t('common.close')}
        </Button>
        {plan.length > 0 && (
          <Button
            variant="primary"
            disabled={!chosen.length}
            onClick={() => {
              onClose()
              void run(() =>
                withProgress(t('moodle.import.applying'), () => applyMoodleImport(ws, chosen), {
                  success: () => t('grades.imported', { count: chosen.length }),
                }),
              )
            }}
          >
            {t('moodle.import.apply', { count: chosen.length })}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
