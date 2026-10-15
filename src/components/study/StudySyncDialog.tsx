import { useEffect, useMemo, useState } from 'react'
import { syncTimetable } from '@/app/schedule'
import { createStudyFolder, previewStudy, setupHint, studySources, type StudySources } from '@/app/study'
import { announce, withProgress } from '@/app/progress'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { PROGRAMS } from '@/lib/study/catalog'
import { setupData, type StudyChange, type StudySetup } from '@/lib/study/sync'
import { addTerms, termLabel, termOf } from '@/lib/study/terms'
import { OWN_PROGRAM } from '@/lib/university'
import { Button, Dialog, Field, Select, TextInput } from '@/components/ui'
import { OtherUniversity } from './OtherUniversity'

/**
 * "Studium aktualisieren": program and first semester (once), then a preview of what changes in the
 * study folder – nothing is written before the user confirms.
 */
export function StudySyncDialog({ onClose }: { onClose: () => void }) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const [sources, setSources] = useState<StudySources | null>(null)
  const [setup, setSetup] = useState<StudySetup | null>(null)
  // Another university / own program (only when creating the folder).
  const [ownUniversity, setOwnUniversity] = useState('')
  const [ownProgram, setOwnProgram] = useState('')
  const [ownEcts, setOwnEcts] = useState('180')
  useEffect(() => {
    void studySources().then(setSources)
  }, [])
  const preview = useMemo(
    () => (sources ? previewStudy(ws, sources, new Date(), setup ?? undefined) : null),
    [ws, sources, setup],
  )
  const current = termOf(new Date())
  const terms = Array.from({ length: 14 }, (_, i) => termLabel(addTerms(current, -i)))
  const chosen: StudySetup | null = setup ?? (preview?.ok ? preview.setup : null)
  const choose = (patch: Partial<StudySetup>) =>
    setSetup({ program: chosen?.program ?? PROGRAMS[0]!.id, start: chosen?.start ?? terms[4]!, ...patch })

  const changes = preview?.ok ? preview.plan.changes : []
  const creating = Boolean(preview && !preview.ok && preview.reason === 'noFolder')
  const own = chosen?.program === OWN_PROGRAM
  const groups = (['schema', 'module', 'semester', 'course'] as const)
    .map((what) => ({ what, items: changes.filter((c) => c.what === what) }))
    .filter((g) => g.items.length)

  return (
    <Dialog open onClose={onClose} title={t('study.dialogTitle')} size="lg" closeLabel={t('common.close')}>
      {!preview ? null : (
        <div className="space-y-4">
          <p className="text-[13px] text-ink-3">
            {!preview.ok && preview.reason === 'noFolder' ? t('study.createHint') : t('study.setupHint')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('study.program')}>
              <Select
                value={chosen?.program ?? ''}
                onChange={(e) => choose({ program: e.target.value })}
                aria-label={t('study.program')}
              >
                {!chosen && <option value="">–</option>}
                {PROGRAMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.title} (${p.degree}) · ${p.university} · PO ${p.po}`}
                  </option>
                ))}
                <option value={OWN_PROGRAM}>{t('study.own')}</option>
              </Select>
            </Field>
            <Field label={t('study.start')}>
              <Select
                value={chosen?.start ?? ''}
                onChange={(e) => choose({ start: e.target.value })}
                aria-label={t('study.start')}
              >
                {!chosen && <option value="">–</option>}
                {terms.map((term) => (
                  <option key={term} value={term}>
                    {term}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {creating && own && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={t('study.ownUniversity')}>
                <TextInput value={ownUniversity} onChange={(e) => setOwnUniversity(e.target.value)} />
              </Field>
              <Field label={t('study.ownProgram')}>
                <TextInput value={ownProgram} onChange={(e) => setOwnProgram(e.target.value)} />
              </Field>
              <Field label={t('study.ownEcts')}>
                <TextInput
                  value={ownEcts}
                  inputMode="numeric"
                  onChange={(e) => setOwnEcts(e.target.value.replace(/\D/g, ''))}
                />
              </Field>
            </div>
          )}
          {creating && <OtherUniversity what="study" onLeave={onClose} />}
          {preview.ok && (
            <>
              <p className="text-sm font-medium">
                {t('study.summary', {
                  semester: preview.state.semester,
                  term: termLabel(preview.state.current),
                  modules: preview.state.modules.length,
                  courses:
                    preview.state.modules.reduce((s, m) => s + m.courses.length, 0) +
                    preview.state.orga.length +
                    preview.state.other.length,
                })}
              </p>
              {changes.length === 0 ? (
                <p role="status" className="text-sm text-accent">
                  {t('study.upToDate')}
                </p>
              ) : (
                <div
                  className="max-h-[45vh] overflow-y-auto rounded-panel border border-line"
                  aria-label={t('study.dialogTitle')}
                >
                  {groups.map((g) => (
                    <section key={g.what}>
                      <h3 className="sticky top-0 bg-sunken px-3 py-1.5 text-[12.5px] font-semibold text-ink-2">
                        {t(`study.kind.${g.what}`)} ({g.items.length})
                      </h3>
                      <ul className="divide-y divide-line">
                        {g.items.slice(0, 200).map((c, i) => (
                          <ChangeRow key={`${c.path ?? c.title}-${i}`} change={c} />
                        ))}
                      </ul>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {changes.length ? t('common.cancel') : t('common.close')}
        </Button>
        {preview && !preview.ok && preview.reason === 'noFolder' && (
          <Button
            variant="primary"
            disabled={!chosen || (own && (!ownUniversity.trim() || !ownProgram.trim()))}
            onClick={() => {
              onClose()
              const ownStudy = own
                ? {
                    university: ownUniversity.trim(),
                    program: ownProgram.trim(),
                    ects: Number(ownEcts) || 180,
                  }
                : undefined
              void run(() =>
                withProgress(t('study.creating'), () => createStudyFolder(ws, chosen!, 'Studium', ownStudy), {
                  success: ({ imported }) => (imported ? t('study.created') : t('study.createdPlain')),
                }).then(({ dashboard, imported }) => {
                  navigate({ name: 'page', path: dashboard })
                  if (imported) return void setupHint(ws)
                  // No Moodle/eCampus yet: how the modules get in.
                  announce(t('study.noModulesYet'), {
                    state: 'info',
                    sticky: true,
                    key: 'setup',
                    note: t('study.noModulesNote'),
                    action: {
                      label: t('study.connect'),
                      run: () => navigate({ name: 'settings', section: 'study' }),
                    },
                  })
                }),
              )
            }}
          >
            {t('study.create')}
          </Button>
        )}
        {preview?.ok && (changes.length > 0 || setup) && (
          <Button
            variant="primary"
            onClick={() => {
              onClose()
              const count = changes.length
              void run(() =>
                withProgress(
                  t('study.syncing'),
                  async () => {
                    if (setup) {
                      const page = ws.get(preview.dashboard)!
                      await ws.save(preview.dashboard, { data: { ...page.data, ...setupData(setup) } })
                    }
                    await preview.plan.apply()
                    await syncTimetable(ws).catch(() => undefined)
                  },
                  { success: () => t('study.synced', { count }) },
                ).then(() => navigate({ name: 'page', path: preview.dashboard })),
              )
            }}
          >
            {t('study.apply', { count: changes.length })}
          </Button>
        )}
      </div>
    </Dialog>
  )
}

function ChangeRow({ change }: { change: StudyChange }) {
  return (
    <li className="px-3 py-1.5 text-sm">
      <span className="font-medium">{change.title}</span>
      {change.kind === 'create' && <span className="ml-1.5 text-[12px] text-accent">{t('study.new')}</span>}
      {change.detail && <span className="block text-[12.5px] text-ink-3">{change.detail}</span>}
    </li>
  )
}
