import { useEffect } from 'react'
import { CalendarClock, ExternalLink, FileText, FolderOpen, GitBranch, Link2 } from 'lucide-react'
import { loadClones, useClones } from '@/app/clones'
import { labNumber, labTasksOf, moduleOfPath } from '@/app/labLinks'
import { taskNumber } from '@/app/labHubs'
import { materialFolder } from '@/app/materials'
import { useMoodle } from '@/app/moodle'
import { ensureRepoPage } from '@/app/repoPage'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { formatValue } from '@/lib/database'
import { LAB_DATE, labFilesOf } from '@/lib/labPlan'
import { courseIdsOf, materialFolderFor } from '@/lib/study/modules'
import { electronBridge } from '@/lib/vault'
import type { Page } from '@/lib/workspace'
import { Button, Chip, cx } from '@/components/ui'
import { RepoButton } from './RepoButton'

const due = (p: Page) => formatValue({ name: 'Fällig', type: 'date' }, String(p.data.Fällig ?? ''))

/**
 * The page of one lab session (P01 …): everything of it in one place – lab date and preparation,
 * the sheets (task sheet, preparation sheet, solutions), the repositories in its folder, the Moodle
 * links of that number, its own files.
 */
export function LabHub({ page }: { page: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const navigate = useApp((s) => s.navigate)
  const openEntry = useApp((s) => s.openEntry)
  const snapshot = useMoodle((s) => s.snapshot)
  const n = Number(page.data.praktikum)
  const folder = page.path.slice(0, -3)
  const module = moduleOfPath(ws, page.path)
  const clones = useClones((s) => s[folder]) ?? []
  useEffect(() => {
    void loadClones(folder)
  }, [folder, ws.version])
  const tasks = module ? labTasksOf(ws, module.path).filter((p) => taskNumber(p) === n) : []
  const materials = module
    ? materialFolderFor(materialFolder(ws), { name: module.title }, module.title)
    : null
  const sheets = materials
    ? labFilesOf(
        ws
          .assets()
          .map((f) => f.path)
          .filter((p) => p.startsWith(`${materials}/`)),
        n,
      )
    : []
  const courses = module ? courseIdsOf(module.data) : []
  const links = (snapshot?.materials ?? []).filter(
    (m) => m.kind === 'url' && courses.includes(m.courseId) && labNumber(`${m.title} ${m.section}`) === n,
  )
  const own = ws
    .assets()
    .filter(
      (f) =>
        f.path.startsWith(`${folder}/`) &&
        !clones.some((c) => f.path.startsWith(`${folder}/${c.name}/`)) &&
        !f.path.slice(folder.length + 1).startsWith('.'),
    )
  const code = electronBridge()?.code
  const today = new Date().toISOString().slice(0, 10)
  const h3 = 'mb-1 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-2'

  return (
    <section
      aria-label={t('hub.title')}
      data-testid="lab-hub"
      className="no-print mt-4 space-y-4 rounded-panel border border-line p-3"
    >
      <div>
        <h3 className={h3}>
          <CalendarClock size={13} /> {t('hub.dates')}
        </h3>
        {tasks.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t('hub.noDates')}</p>
        ) : (
          <ul className="space-y-0.5">
            {tasks.map((p) => {
              const past = String(p.data.Fällig ?? '').slice(0, 10) < today
              return (
                <li
                  key={p.path}
                  className={cx('flex items-center gap-2 text-[13.5px]', past && 'opacity-60')}
                >
                  <Chip color={p.data.Art === LAB_DATE ? 'orange' : 'blue'}>
                    {p.data.Art === LAB_DATE ? t('lab.date') : t('lab.prep')}
                  </Chip>
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate text-left hover:underline"
                    onClick={(e) => openEntry(p.path, e)}
                  >
                    {module ? p.title.replace(`${module.title} – `, '') : p.title}
                  </button>
                  <span className="text-[12px] text-ink-3 tabular-nums">{due(p)}</span>
                  {p.data.Status === 'Erledigt' && <Chip color="green">{t('hub.done')}</Chip>}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div>
        <h3 className={h3}>
          <FileText size={13} /> {t('hub.sheets')}
        </h3>
        {sheets.length === 0 ? (
          <p className="text-[13px] text-ink-3">{t('hub.noSheets')}</p>
        ) : (
          <ul className="space-y-0.5">
            {sheets.map((f) => (
              <li key={f.path} className="flex items-center gap-2 text-[13.5px]">
                <Chip
                  color={
                    f.kind === 'prep'
                      ? 'blue'
                      : f.kind === 'solution'
                        ? 'green'
                        : f.kind === 'sheet'
                          ? 'orange'
                          : 'gray'
                  }
                >
                  {t(`hub.kind.${f.kind}`)}
                </Chip>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left hover:underline"
                  onClick={() => navigate({ name: 'file', path: f.path })}
                >
                  {f.path.slice(f.path.lastIndexOf('/') + 1)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className={h3}>
          <GitBranch size={13} /> {t('clone.repos')}
        </h3>
        {clones.length === 0 && <p className="text-[13px] text-ink-3">{t('hub.noRepos')}</p>}
        <ul className="space-y-0.5">
          {clones.map((c) => (
            <li key={c.name} className="flex flex-wrap items-center gap-2 text-[13.5px]">
              <span className="font-medium">{c.name}</span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{c.remote}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  void run(async () =>
                    navigate({
                      name: 'page',
                      path: await ensureRepoPage(ws, `${folder}/${c.name}`, c.remote, c.remote, c.name),
                    }),
                  )
                }
              >
                {t('labRepos.open')}
              </Button>
              {code && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void run(() => code.open(`${folder}/${c.name}`, 'editor'))}
                >
                  {t('clone.openEditor')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {links.length > 0 && (
        <div>
          <h3 className={h3}>
            <Link2 size={13} /> {t('hub.links')}
          </h3>
          <ul className="space-y-0.5">
            {links.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 text-[13.5px]">
                <button
                  type="button"
                  className="min-w-0 truncate text-left text-accent hover:underline"
                  title={m.url}
                  onClick={() => void electronBridge()?.openExternal(m.url)}
                >
                  {m.title} <ExternalLink size={11} className="inline" />
                </button>
                <RepoButton link={m.url} title={m.title} folder={folder} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {own.length > 0 && (
        <div>
          <h3 className={h3}>
            <FolderOpen size={13} /> {t('hub.files')}
          </h3>
          <ul className="space-y-0.5">
            {own.map((f) => (
              <li key={f.path}>
                <button
                  type="button"
                  className="truncate text-left font-code text-[12.5px] hover:underline"
                  onClick={() => navigate({ name: 'file', path: f.path })}
                >
                  {f.path.slice(folder.length + 1)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
