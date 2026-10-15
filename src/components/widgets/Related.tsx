import { AlertTriangle, CalendarPlus, Code2, ExternalLink, FileText, Plus, Search } from 'lucide-react'
import { createCodeFolder } from '@/components/code/CodeFolder'
import { useRecent } from '@/app/recent'
import { useMoodle } from '@/app/moodle'
import { materialFolder } from '@/app/materials'
import { suggestTimetable } from '@/app/schedule'
import { MATERIAL_CATEGORIES } from '@/lib/moodle'
import { courseIdsOf, materialFolderFor } from '@/lib/study/modules'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { toIsoDate } from '@/lib/dates'
import type { Page } from '@/lib/workspace'
import { Button } from '@/components/ui'

/** Databases shown first on a module page, in this order. */
const ORDER = ['Mitschriften', 'Prüfungen', 'Aufgaben', 'Stundenplan']

/**
 * "Alles zu diesem Modul": its materials ("Unterlagen/<Modul>"), what Moodle says about its courses
 * (description, news, cancellations – from the last fetch) and the pages that link here (notes,
 * exams, tasks, timetable). The module is the centre; there are no course pages.
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

  const courses = courseIdsOf(page.data)
  const moduleFolder = materialFolderFor(materialFolder(ws), { name: page.title }, page.title)
  const moduleFiles = files(moduleFolder)

  const newNote = () =>
    run(async () => {
      const path = await ws.createRow(notesDb!.path, `${page.title} – ${toIsoDate(new Date())}`, {
        Modul: [`[[${ws.linkText(from)}]]`],
        Datum: toIsoDate(new Date()),
        Art: 'Vorlesung',
      })
      navigate({ name: 'page', path })
    })

  const timetableDb = ws.findDatabase('Stundenplan', from)
  const newSession = () =>
    run(async () => {
      const path = await ws.createRow(timetableDb!.path, `${page.title} – ${t('related.session')}`, {
        Modul: [`[[${ws.linkText(from)}]]`],
        Typ: 'Vorlesung',
      })
      openEntry(path)
    })

  return (
    <div className="related space-y-4 rounded-panel border border-line p-3" data-interactive>
      {moduleFiles.length > 0 && (
        <section aria-label={t('related.files')}>
          <h3 className="mb-1 text-[12.5px] font-semibold text-ink-2">{t('related.files')}</h3>
          <CourseFiles folder={moduleFolder} files={moduleFiles.map((f) => f.path)} />
        </section>
      )}
      {courses.length > 0 && <ModuleMoodle courses={courses} />}
      {sorted.length === 0 && moduleFiles.length === 0 && courses.length === 0 && (
        <p className="text-sm text-ink-3">{t('related.empty')}</p>
      )}
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
                const link =
                  typeof p.data.Link === 'string' && /^https?:/.test(p.data.Link) ? p.data.Link : null
                const str = (v: unknown) => (typeof v === 'string' && v ? v : '')
                // Timetable rows: day, time, type and room – and where the time was found.
                const time = str(p.data.Beginn)
                  ? `${str(p.data.Beginn)}${str(p.data.Ende) ? `–${str(p.data.Ende)}` : ''}`
                  : ''
                const meta = [
                  p.data.Semester,
                  p.data.Datum,
                  p.data.Fällig,
                  p.data.Status,
                  p.data.Tag,
                  time,
                  p.data.Typ,
                  p.data.Raum,
                ].filter((v) => typeof v === 'string' && v) as string[]
                const source = str(p.data.Quelle)
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
                      {source && (
                        <span className="text-[12px] text-ink-3 italic" title={source}>
                          {t('timetable.source', {
                            source: source.length > 60 ? `${source.slice(0, 60)}…` : source,
                          })}
                        </span>
                      )}
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
        {timetableDb && (
          <Button size="sm" icon={<CalendarPlus size={13} />} onClick={() => void newSession()}>
            {t('related.newSession')}
          </Button>
        )}
        {timetableDb && courses.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            icon={<Search size={13} />}
            onClick={() => void run(() => suggestTimetable(ws, true))}
          >
            {t('related.findTimes')}
          </Button>
        )}
        <Button
          size="sm"
          icon={<Code2 size={13} />}
          onClick={() =>
            void run(async () => {
              const name = await useApp.getState().ask({
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

/**
 * What Moodle says about the module's courses (newest term first): link, cancellations and news,
 * the description – from the last fetch, nothing is copied into the vault.
 */
function ModuleMoodle({ courses }: { courses: string[] }) {
  const snapshot = useMoodle((s) => s.snapshot)
  const navigate = useApp((s) => s.navigate)
  if (!snapshot) return null
  const known = courses
    .map((id) => snapshot.courses.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => !!c)
    .reverse()
  if (!known.length) return null
  return (
    <section aria-label={t('related.moodle')}>
      <h3 className="mb-1 text-[12.5px] font-semibold text-ink-2">{t('related.moodle')}</h3>
      <ul className="space-y-2">
        {known.map((c, i) => {
          const info = snapshot.info?.[c.id]
          const news = (info?.announcements ?? []).slice(0, 3)
          return (
            <li key={c.id}>
              <div className="flex flex-wrap items-center gap-x-2">
                <button
                  type="button"
                  className="text-left text-sm font-medium hover:underline"
                  onClick={() => navigate({ name: 'moodle', course: c.id })}
                >
                  {c.name}
                </button>
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-[12px] text-accent hover:underline"
                  >
                    {t('related.openMoodle')} <ExternalLink size={11} />
                  </a>
                )}
              </div>
              {news.map((n) => (
                <p key={n.id} className="ml-3 flex gap-1 text-[12.5px] text-ink-2">
                  {n.important && <AlertTriangle size={12} className="mt-0.5 shrink-0 text-danger" />}
                  <span>
                    <span className="font-medium">{n.title}</span>
                    {n.modified && (
                      <span className="text-ink-3">
                        {' '}
                        · {new Date(n.modified).toLocaleDateString('de-DE')}
                      </span>
                    )}
                  </span>
                </p>
              ))}
              {info?.summary?.text && (
                <details className="ml-3" open={i === 0 && !news.length}>
                  <summary className="cursor-pointer text-[12.5px] text-ink-3">
                    {t('related.description')}
                  </summary>
                  <p className="text-[12.5px] whitespace-pre-line text-ink-2">
                    {info.summary.text.slice(0, 1200)}
                  </p>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * Files of a module: recently opened first, then by kind (lecture, lab & exercises, other) – the
 * folders Notiva saves Moodle files into. Each group can be collapsed.
 */
function CourseFiles({ folder, files }: { folder: string; files: string[] }) {
  const navigate = useApp((s) => s.navigate)
  const recentAll = useRecent((s) => s.files)
  const recent = recentAll.filter((r) => files.includes(r.path)).slice(0, 3)
  const groups = new Map<string, string[]>()
  for (const f of files) {
    const rest = f.slice(folder.length + 1)
    const head = rest.includes('/') ? rest.slice(0, rest.indexOf('/')) : ''
    const group = (MATERIAL_CATEGORIES as readonly string[]).includes(head) ? head : t('related.otherFiles')
    groups.set(group, [...(groups.get(group) ?? []), f])
  }
  const order = [...MATERIAL_CATEGORIES, t('related.otherFiles')]
  const item = (f: string) => (
    <li key={f}>
      <button
        type="button"
        className="flex items-center gap-1 text-left text-[13px] text-ink-2 hover:underline"
        onClick={() => navigate({ name: 'file', path: f })}
      >
        <FileText size={12} className="shrink-0" />
        {f.split('/').pop()}
      </button>
    </li>
  )
  return (
    <div className="mt-0.5 ml-3 space-y-1 border-l border-line pl-2" aria-label={t('related.files')}>
      {recent.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-ink-3">{t('related.recent')}</p>
          <ul>{recent.map((r) => item(r.path))}</ul>
        </div>
      )}
      {order
        .filter((g) => groups.has(g))
        .map((g) => (
          <details key={g} open={g === 'Vorlesung' || groups.size === 1}>
            <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
              {g} ({groups.get(g)!.length})
            </summary>
            <ul>{groups.get(g)!.slice(0, 80).map(item)}</ul>
          </details>
        ))}
    </div>
  )
}
