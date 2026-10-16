import { useEffect, useState } from 'react'
import { Code2, ExternalLink, FileText, FolderInput, Plus } from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { useCourseChoices } from '@/app/courseChoices'
import { createCodeFolder } from '@/components/code/CodeFolder'
import { useRecent } from '@/app/recent'
import { loadMaterialMap, materialFolder } from '@/app/materials'
import { reindexMaterials } from '@/app/reindex'
import { planSort } from '@/lib/materialVersions'
import { LAB_DATE, LAB_PREP } from '@/lib/labPlan'
import { ModuleSchedule } from './ModuleSchedule'
import { MATERIAL_CATEGORIES } from '@/lib/moodle'
import { courseIdsOf, isTermFolder, materialFolderFor, termFolder } from '@/lib/study/modules'
import { parseTerm, termIndex, termOf } from '@/lib/study/terms'
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
    // Sessions and lab dates have their own section above (ModuleSchedule).
    if (name === 'Stundenplan' || p.data.Art === LAB_DATE || p.data.Art === LAB_PREP) continue
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
  // A module page (row of "Module"): sessions and lab dates first.
  const isModule = dbOf(page)?.title === 'Module'
  const moduleFolder = materialFolderFor(materialFolder(ws), { name: page.title }, page.title)
  const moduleFiles = files(moduleFolder)
  // Loose files in the module folder (older versions saved them there): sort into categories.
  const loose = planSort(
    moduleFiles.map((f) => f.path),
    materialFolder(ws),
  ).length

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
      {isModule && <ModuleSchedule module={page} />}
      {moduleFiles.length > 0 && (
        <section aria-label={t('related.files')}>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="flex-1 text-[12.5px] font-semibold text-ink-2">{t('related.files')}</h3>
            {loose > 0 && (
              <Button
                size="sm"
                variant="ghost"
                icon={<FolderInput size={13} />}
                title={t('related.sortHint')}
                onClick={() => void run(() => reindexMaterials(ws, { moodle: false, folder: moduleFolder }))}
              >
                {t('related.sort', { count: loose })}
              </Button>
            )}
          </div>
          <CourseFiles
            folder={moduleFolder}
            files={moduleFiles.map((f) => f.path)}
            courses={courses}
            passed={page.data.Status === 'Bestanden'}
          />
        </section>
      )}
      {!isModule && sorted.length === 0 && moduleFiles.length === 0 && courses.length === 0 && (
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
 * Files of a module: recently opened first, then by kind (lecture, lab & exercises, other) – the
 * folders Notiva saves Moodle files into. Each group can be collapsed.
 */
/**
 * Files of the module by status, then by Moodle course (a new lecturer, a new term – not the same
 * material): "Aktuell" (this term's courses, else the newest), "Ältere Semester" (older terms and
 * courses marked "later"), files without a known course; courses not counted are hidden. A passed
 * module shows everything as "Bestanden – zum Nachschlagen". Within a course: lecture, lab &
 * exercises, other – names in natural order.
 */
function CourseFiles({
  folder,
  files,
  courses,
  passed,
}: {
  folder: string
  files: string[]
  courses: string[]
  passed: boolean
}) {
  const ws = useWorkspace()
  const navigate = useApp((s) => s.navigate)
  const snapshot = useMoodle((s) => s.snapshot)
  const choices = useCourseChoices()
  const recentAll = useRecent((s) => s.files)
  const [map, setMap] = useState<Record<string, string>>({})
  const [showIgnored, setShowIgnored] = useState(false)
  useEffect(() => {
    void loadMaterialMap(ws).then(setMap)
  }, [ws, ws.version])
  const known = (snapshot?.courses ?? []).filter((c) => courses.includes(c.id))
  // File → course: saved materials (id → path, course from the last fetch) or the term folder.
  const courseOfId = new Map((snapshot?.materials ?? []).map((m) => [m.id, m.courseId]))
  const courseOf = new Map<string, string>()
  for (const [id, path] of Object.entries(map)) {
    const c = courseOfId.get(id)
    if (c) courseOf.set(path, c)
  }
  const byTermFolder = new Map(known.map((c) => [termFolder(c), c.id]))
  const course = (f: string) => {
    const hit = courseOf.get(f)
    if (hit) return hit
    const seg = f.slice(folder.length + 1).split('/')[0] ?? ''
    return isTermFolder(seg) ? (byTermFolder.get(seg) ?? '') : ''
  }
  const byCourse = new Map<string, string[]>()
  for (const f of files) byCourse.set(course(f), [...(byCourse.get(course(f)) ?? []), f])
  const termOfCourse = (id: string) => parseTerm(known.find((c) => c.id === id)?.name)
  const nowIndex = termIndex(termOf(new Date()))
  const counted = courses.filter((c) => byCourse.has(c) && choices[c] !== 'ignore')
  const ignored = courses.filter((c) => byCourse.has(c) && choices[c] === 'ignore')
  // "Aktuell": this term's courses; none → the newest course that counts.
  let current = counted.filter(
    (c) => choices[c] !== 'later' && termOfCourse(c) && termIndex(termOfCourse(c)!) === nowIndex,
  )
  if (!current.length) {
    const newest = [...counted]
      .filter((c) => choices[c] !== 'later')
      .sort(
        (a, b) =>
          (termOfCourse(b) ? termIndex(termOfCourse(b)!) : 0) -
          (termOfCourse(a) ? termIndex(termOfCourse(a)!) : 0),
      )[0]
    if (newest) current = [newest]
  }
  const older = counted.filter((c) => !current.includes(c))
  const hidden = new Set(ignored.flatMap((c) => byCourse.get(c) ?? []))
  const recent = recentAll.filter((r) => files.includes(r.path) && !hidden.has(r.path)).slice(0, 3)
  const name = (id: string) => known.find((c) => c.id === id)?.name ?? id
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
  const byKind = (list: string[], key: string, openFirst: boolean) => {
    const groups = new Map<string, string[]>()
    for (const f of list) {
      const cat = f
        .slice(folder.length + 1)
        .split('/')
        .slice(0, -1)
        .find((p) => (MATERIAL_CATEGORIES as readonly string[]).includes(p))
      const group = cat ?? t('related.otherFiles')
      groups.set(group, [...(groups.get(group) ?? []), f])
    }
    const natural = (a: string, b: string) =>
      a.split('/').pop()!.localeCompare(b.split('/').pop()!, 'de', { numeric: true })
    return [...MATERIAL_CATEGORIES, t('related.otherFiles')]
      .filter((g) => groups.has(g))
      .map((g) => (
        <details key={`${key}:${g}`} open={openFirst && g === 'Vorlesung'} className="ml-2">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-ink-2">
            {g} ({groups.get(g)!.length})
          </summary>
          <ul>{groups.get(g)!.sort(natural).slice(0, 150).map(item)}</ul>
        </details>
      ))
  }
  const courseBlock = (id: string, open: boolean) => (
    <details key={id || 'none'} open={open} className="ml-1" data-testid="files-course">
      <summary className="cursor-pointer text-[13px] font-medium">
        {id ? name(id) : t('related.filesNoCourse')}
        <span className="ml-1.5 text-[12px] font-normal text-ink-3">{byCourse.get(id)!.length}</span>
        {choices[id] === 'later' && (
          <span className="ml-1.5 rounded-full bg-[var(--opt-yellow)] px-1.5 text-[11px] text-[var(--opt-yellow-ink)]">
            {t('courseUse.laterShort')}
          </span>
        )}
      </summary>
      {byKind(byCourse.get(id)!, id, open)}
    </details>
  )
  const status = (title: string, ids: string[], open: boolean, testid: string) =>
    ids.length > 0 && (
      <details key={testid} open={open} data-testid={testid}>
        <summary className="cursor-pointer text-[12px] font-semibold tracking-wide text-ink-3">
          {title} ({ids.reduce((n, id) => n + (byCourse.get(id)?.length ?? 0), 0)})
        </summary>
        <div className="mt-1 space-y-1">{ids.map((id, i) => courseBlock(id, open && i === 0))}</div>
      </details>
    )
  const unknown = byCourse.has('') ? [''] : []
  return (
    <div className="mt-0.5 ml-3 space-y-1.5 border-l border-line pl-2" aria-label={t('related.files')}>
      {recent.length > 0 && (
        <div>
          <p className="text-[12px] font-semibold text-ink-3">{t('related.recent')}</p>
          <ul>{recent.map((r) => item(r.path))}</ul>
        </div>
      )}
      {passed ? (
        status(t('related.filesPassed'), [...counted, ...unknown], false, 'files-passed')
      ) : (
        <>
          {status(t('related.filesCurrent'), current, true, 'files-current')}
          {status(t('related.filesOlder'), older, false, 'files-older')}
          {status(t('related.filesNoCourse'), unknown, !current.length, 'files-unknown')}
        </>
      )}
      {ignored.length > 0 && (
        <button
          type="button"
          className="text-[12px] text-ink-3 hover:text-ink hover:underline"
          onClick={() => setShowIgnored((v) => !v)}
        >
          {t('related.filesIgnored', { count: hidden.size })}
        </button>
      )}
      {showIgnored && ignored.map((c) => courseBlock(c, false))}
    </div>
  )
}
