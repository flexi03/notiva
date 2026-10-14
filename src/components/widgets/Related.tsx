import { Code2, ExternalLink, FileText, Plus } from 'lucide-react'
import { createCodeFolder } from '@/components/code/CodeFolder'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { toIsoDate } from '@/lib/dates'
import type { Page } from '@/lib/workspace'
import { Button } from '@/components/ui'

/** Databases shown first on a module page, in this order. */
const ORDER = ['Kurse', 'Mitschriften', 'Prüfungen', 'Aufgaben', 'Stundenplan']

/**
 * "Alles zu diesem Modul": pages that link here, grouped by their database; Moodle courses with
 * their saved materials. A module page thus collects courses, notes, exams and tasks by itself.
 */
export function Related({ from }: { from: string }) {
  const ws = useWorkspace()
  const run = useAction()
  const openEntry = useApp((s) => s.openEntry)
  const navigate = useApp((s) => s.navigate)
  const page = ws.get(from)
  if (!page) return null
  const databases = ws.databases()
  const dbOf = (p: Page) => databases.find((db) => p.path.startsWith(`${ws.rowFolder(db)}/`))
  const groups = new Map<string, Page[]>()
  for (const p of ws.backlinks(from)) {
    const name = dbOf(p)?.title ?? t('related.other')
    groups.set(name, [...(groups.get(name) ?? []), p])
  }
  const sorted = [...groups.entries()].sort(
    ([a], [b]) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  )
  const notesDb = ws.findDatabase('Mitschriften', from)
  const files = (folder: unknown) =>
    typeof folder === 'string' && folder
      ? ws
          .assets()
          .filter((f) => f.path.startsWith(`${folder}/`))
          .sort((a, b) => a.path.localeCompare(b.path, 'de', { numeric: true }))
      : []

  const newNote = () =>
    run(async () => {
      const path = await ws.createRow(notesDb!.path, `${page.title} – ${toIsoDate(new Date())}`, {
        Modul: [`[[${ws.linkText(from)}]]`],
        Datum: toIsoDate(new Date()),
        Art: 'Vorlesung',
      })
      navigate({ name: 'page', path })
    })

  return (
    <div className="related space-y-4 rounded-panel border border-line p-3" data-interactive>
      {sorted.length === 0 && <p className="text-sm text-ink-3">{t('related.empty')}</p>}
      {sorted.map(([name, pages]) => (
        <section key={name} aria-label={name}>
          <h3 className="mb-1 text-[12.5px] font-semibold text-ink-2">{name}</h3>
          <ul className="space-y-1">
            {pages
              .sort(
                (a, b) =>
                  String(b.data.Datum ?? b.data.Fällig ?? '').localeCompare(
                    String(a.data.Datum ?? a.data.Fällig ?? ''),
                  ) || a.title.localeCompare(b.title),
              )
              .map((p) => {
                const list = files(p.data.Ordner)
                const link =
                  typeof p.data.Link === 'string' && /^https?:/.test(p.data.Link) ? p.data.Link : null
                const meta = [p.data.Semester, p.data.Datum, p.data.Fällig, p.data.Status].filter(
                  (v) => typeof v === 'string' && v,
                ) as string[]
                return (
                  <li key={p.path}>
                    <div className="flex flex-wrap items-center gap-x-2">
                      <button
                        type="button"
                        className="text-left text-sm font-medium hover:underline"
                        onClick={(e) => openEntry(p.path, e)}
                      >
                        {p.title}
                      </button>
                      {meta.length > 0 && <span className="text-[12px] text-ink-3">{meta.join(' · ')}</span>}
                      {link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-[12px] text-accent hover:underline"
                        >
                          {t('related.openMoodle')} <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                    {list.length > 0 && (
                      <ul className="mt-0.5 ml-3 border-l border-line pl-2" aria-label={t('related.files')}>
                        {list.slice(0, 40).map((f) => (
                          <li key={f.path}>
                            <button
                              type="button"
                              className="flex items-center gap-1 text-left text-[13px] text-ink-2 hover:underline"
                              onClick={() => navigate({ name: 'file', path: f.path })}
                            >
                              <FileText size={12} className="shrink-0" />
                              {f.path.slice(String(p.data.Ordner).length + 1)}
                            </button>
                          </li>
                        ))}
                        {list.length > 40 && <li className="text-[12px] text-ink-3">+{list.length - 40}</li>}
                      </ul>
                    )}
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
      <div className="flex flex-wrap gap-2">
        {notesDb && (
          <Button size="sm" icon={<Plus size={13} />} onClick={() => void newNote()}>
            {t('related.newNote')}
          </Button>
        )}
        <Button
          size="sm"
          icon={<Code2 size={13} />}
          onClick={() =>
            void run(async () => {
              const name = await useApp
                .getState()
                .ask({
                  title: t('code.askName'),
                  initial: t('code.defaultName'),
                  confirmLabel: t('code.create'),
                })
              if (name?.trim())
                navigate({ name: 'page', path: await createCodeFolder(ws, from, name.trim()) })
            })
          }
        >
          {t('code.create')}
        </Button>
      </div>
    </div>
  )
}
