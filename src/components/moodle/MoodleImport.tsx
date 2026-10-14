import { useEffect, useMemo, useState } from 'react'
import { useMoodle } from '@/app/moodle'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { formatDate } from '@/lib/dates'
import {
  applyMoodleImport,
  importTargets,
  planMoodleImport,
  type MoodleSnapshot,
  type PlanItem,
} from '@/lib/moodle'
import { electronBridge } from '@/lib/vault'
import { Button, Checkbox, Dialog, Select, Spinner } from '@/components/ui'

/**
 * Fetches Moodle and shows what would change in the study dashboard – the user picks what to take
 * over. Nothing is written before "Übernehmen".
 */
export function MoodleImportDialog() {
  const open = useMoodle((s) => s.importOpen)
  const setOpen = useMoodle((s) => s.setImportOpen)
  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      title={t('moodle.import.title')}
      size="lg"
      closeLabel={t('common.close')}
    >
      {open && <ImportBody onDone={() => setOpen(false)} />}
    </Dialog>
  )
}

function ImportBody({ onDone }: { onDone: () => void }) {
  const ws = useWorkspace()
  const run = useAction()
  const showToast = useApp((s) => s.showToast)
  const [snapshot, setSnapshot] = useState<MoodleSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const targets = useMemo(() => importTargets(ws), [ws])
  const [folder, setFolder] = useState(targets[0]?.folder ?? '')
  const [skipped, setSkipped] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)

  useEffect(() => {
    let cancelled = false
    electronBridge()!
      .moodle!.fetch()
      .then((s) => !cancelled && setSnapshot(s))
      .catch((e: unknown) => {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message.replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, '')
              : String(e),
          )
      })
    return () => {
      cancelled = true
    }
  }, [])

  const target = targets.find((x) => x.folder === folder)
  // Planned once per fetch/target: `ws` keeps its identity when files change, so applying the
  // import doesn't re-plan underneath the open dialog.
  const plan = useMemo(
    () => (snapshot && target ? planMoodleImport(ws, snapshot, target) : []),
    [snapshot, target, ws],
  )
  const chosen = plan.filter((p) => !skipped.has(p.key))

  if (error)
    return (
      <p role="alert" className="text-sm text-danger">
        {error}
      </p>
    )
  if (!snapshot) return <Spinner label={t('moodle.import.loading')} />
  if (!target) return <p className="text-sm text-ink-2">{t('moodle.import.noTarget')}</p>

  const groups: Array<[string, PlanItem[]]> = [
    [t('moodle.import.newModules'), plan.filter((p) => p.kind === 'create' && p.what === 'module')],
    [t('moodle.import.newTasks'), plan.filter((p) => p.kind === 'create' && p.what === 'task')],
    [t('moodle.import.updates'), plan.filter((p) => p.kind === 'update')],
  ]
  const toggle = (key: string, on: boolean) =>
    setSkipped((s) => {
      const next = new Set(s)
      if (on) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        {t('moodle.import.summary', {
          courses: snapshot.courses.length,
          events: snapshot.events.length,
          site: snapshot.site,
        })}
      </p>
      {targets.length > 1 && (
        <label className="flex items-center gap-2 text-sm">
          <span className="font-semibold">{t('moodle.import.target')}</span>
          <Select
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
            aria-label={t('moodle.import.target')}
          >
            {targets.map((x) => (
              <option key={x.folder} value={x.folder}>
                {x.folder || ws.vault.name}
              </option>
            ))}
          </Select>
        </label>
      )}
      {plan.length === 0 ? (
        <p role="status" className="text-sm text-accent">
          {t('moodle.import.upToDate')}
        </p>
      ) : (
        groups
          .filter(([, items]) => items.length > 0)
          .map(([title, items]) => (
            <section key={title} aria-label={title}>
              <h3 className="mb-1.5 text-sm font-semibold">
                {title} <span className="font-normal text-ink-3">({items.length})</span>
              </h3>
              <ul className="divide-y divide-line rounded-panel border border-line">
                {items.map((item) => (
                  <li key={item.key}>
                    <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2 hover:bg-hover">
                      <Checkbox
                        checked={!skipped.has(item.key)}
                        onChange={(on) => toggle(item.key, on)}
                        label={item.title}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{item.title}</span>
                        <span className="block text-[12.5px] text-ink-3">{detail(item)}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onDone}>
          {plan.length === 0 ? t('common.close') : t('common.cancel')}
        </Button>
        {plan.length > 0 && (
          <Button
            variant="primary"
            disabled={chosen.length === 0 || applying}
            onClick={() => {
              setApplying(true)
              void run(async () => {
                await applyMoodleImport(ws, chosen)
                showToast(t('moodle.import.done', { count: chosen.length }))
                onDone()
              }).finally(() => setApplying(false))
            }}
          >
            {t('moodle.import.apply', { count: chosen.length })}
          </Button>
        )}
      </div>
    </div>
  )
}

function detail(item: PlanItem): string {
  const values = item.kind === 'create' ? item.values : item.changes
  const parts: string[] = []
  if (typeof values.Fällig === 'string')
    parts.push(
      `${item.kind === 'update' ? t('moodle.import.newDate') : t('moodle.import.due')} ${formatDate(new Date(`${values.Fällig}T12:00:00`), 'DD.MM.YYYY')}`,
    )
  const modul = Array.isArray(values.Modul) ? values.Modul[0] : undefined
  if (typeof modul === 'string') parts.push(modul.replace(/^\[\[|\]\]$/g, ''))
  if (item.kind === 'update' && values.Fällig === undefined) parts.push(t('moodle.import.linkOnly'))
  return parts.join(' · ')
}
