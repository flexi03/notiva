import { BookOpen, Code2, FileText, NotebookPen, Sparkles } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import { activeModules } from '@/lib/semesterView'
import { findStudyDashboard } from '@/lib/study/sync'
import { Button, Chip, EmptyState } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

const name = (path: string) => path.split('/').pop()!

/**
 * "Mein Semester": only the modules attended now – each with its courses, new files, lecture and
 * lab files, PDFs with own notes, notes and code folders.
 */
export function SemesterScreen() {
  const ws = useWorkspace()
  const { navigate, openEntry } = useApp()
  const dash = findStudyDashboard(ws)
  const modules = dash ? activeModules(ws, dash.folder) : []
  const locale = getLanguage() === 'de' ? 'de-DE' : 'en-US'
  const fileButton = (path: string, extra?: string) => (
    <li key={path}>
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-1.5 rounded-control px-1 py-0.5 text-left text-[13px] hover:bg-hover"
        onClick={() => navigate({ name: 'file', path })}
        title={path}
      >
        <FileText size={13} className="shrink-0 text-ink-3" />
        <span className="min-w-0 flex-1 truncate">{name(path)}</span>
        {extra && <span className="shrink-0 text-[11.5px] text-ink-3">{extra}</span>}
      </button>
    </li>
  )
  const allNew = modules
    .flatMap((m) => m.recent.map((r) => ({ ...r, module: m.module.title })))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 15)

  return (
    <>
      <Topbar title={t('semester.title')} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-8 sm:px-10">
        <h1 className="mb-1 text-[2rem] font-bold">{t('semester.title')}</h1>
        <p className="mb-6 text-[13px] text-ink-3">{t('semester.hint')}</p>
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
          <div className="space-y-6">
            {allNew.length > 0 && (
              <section aria-label={t('semester.new')} className="rounded-panel border border-line p-3">
                <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                  <Sparkles size={14} className="text-accent" /> {t('semester.new')}
                </h2>
                <ul>
                  {allNew.map((f) =>
                    fileButton(f.path, `${f.module} · ${new Date(f.mtime).toLocaleDateString(locale)}`),
                  )}
                </ul>
              </section>
            )}
            {modules.map((m) => (
              <section
                key={m.module.path}
                aria-label={m.module.title}
                className="rounded-panel border border-line p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="text-left text-lg font-bold hover:underline"
                    onClick={() => navigate({ name: 'page', path: m.module.path })}
                  >
                    {m.module.title}
                  </button>
                  {m.belegung.map((b) => (
                    <Chip key={b}>{b}</Chip>
                  ))}
                  {typeof m.module.data.Status === 'string' && (
                    <span className="text-[12.5px] text-ink-3">{m.module.data.Status}</span>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {m.courses.map((c) => (
                    <div key={c.course.path} className="min-w-0">
                      <button
                        type="button"
                        className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 hover:underline"
                        onClick={(e) => openEntry(c.course.path, e)}
                      >
                        <BookOpen size={13} /> {c.course.title}
                      </button>
                      {Object.keys(c.groups).length === 0 && (
                        <p className="text-[12.5px] text-ink-3">{t('semester.noFiles')}</p>
                      )}
                      {['Vorlesung', 'Praktikum & Übung', 'Sonstiges']
                        .filter((g) => c.groups[g]?.length)
                        .map((g) => (
                          <details key={g} open={g !== 'Sonstiges'} className="mb-1">
                            <summary className="cursor-pointer text-[12.5px] text-ink-2">
                              {g} ({c.groups[g]!.length})
                            </summary>
                            <ul className="ml-2">{c.groups[g]!.slice(0, 60).map((f) => fileButton(f))}</ul>
                          </details>
                        ))}
                    </div>
                  ))}
                  <div className="min-w-0 space-y-2">
                    {m.annotated.length > 0 && (
                      <div>
                        <h3 className="mb-0.5 text-[12.5px] font-semibold text-ink-2">
                          {t('semester.annotated')}
                        </h3>
                        <ul>{m.annotated.map((a) => fileButton(a.pdf))}</ul>
                      </div>
                    )}
                    {m.notes.length > 0 && (
                      <div>
                        <h3 className="mb-0.5 text-[12.5px] font-semibold text-ink-2">
                          {t('semester.notes')}
                        </h3>
                        <ul>
                          {m.notes.map((n) => (
                            <li key={n.path}>
                              <button
                                type="button"
                                className="flex items-center gap-1.5 text-[13px] hover:underline"
                                onClick={(e) => openEntry(n.path, e)}
                              >
                                <NotebookPen size={13} className="text-ink-3" /> {n.title}
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {m.code.map((c) => (
                      <button
                        key={c.path}
                        type="button"
                        className="flex items-center gap-1.5 text-[13px] hover:underline"
                        onClick={() => navigate({ name: 'page', path: c.path })}
                      >
                        <Code2 size={13} className="text-ink-3" /> {c.title}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
