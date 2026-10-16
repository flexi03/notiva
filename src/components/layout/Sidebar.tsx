import {
  Award,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ChevronRight,
  Code2,
  FileText,
  FlaskConical,
  GraduationCap,
  Inbox,
  LayoutTemplate,
  LogOut,
  Plus,
  School,
  Search,
  Settings,
  Star,
} from 'lucide-react'
import { moodleAvailable } from '@/app/moodle'
import { useState, type ReactNode } from 'react'
import { useRecent } from '@/app/recent'
import { hubsOf, taskNumber } from '@/app/labHubs'
import { labTasksOf, moduleOfPath } from '@/app/labLinks'
import { LAB_DATE } from '@/lib/labPlan'
import { findStudyDashboard } from '@/lib/study/sync'
import { useApp, useWorkspace } from '@/app/store'
import { usePageActions } from '@/app/hooks/usePageActions'
import { forgetVault } from '@/app/vaults'
import { t } from '@/i18n'
import { cx, IconButton, Kbd, SectionLabel } from '@/components/ui'
import { PageTree } from './PageTree'
import { PageIcon } from './PageIcon'

function NavButton({
  icon,
  label,
  onClick,
  active,
  hint,
}: {
  icon: ReactNode
  label: string
  onClick: () => void
  active?: boolean
  hint?: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'flex h-8 w-full items-center gap-2.5 rounded-control px-2 text-left text-[14px] text-ink-2 hover:bg-hover hover:text-ink',
        active && 'bg-[color-mix(in_srgb,var(--accent)_13%,transparent)] font-semibold text-ink',
      )}
    >
      <span className="flex size-4 items-center justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {hint}
    </button>
  )
}

export function Sidebar() {
  const ws = useWorkspace()
  const { route, navigate, setSearch, settings, openPage, setWorkspace } = useApp()
  const actions = usePageActions(ws)
  const favorites = settings.favorites.map((p) => ws.get(p)).filter((p) => p !== undefined)
  // Code folders (lab projects) and recently opened files – one click away.
  const codePages = ws.all().filter((p) => p.data.code === true)
  const codeLabel = (page: (typeof codePages)[number]) => {
    const parent = ws.get(`${page.path.slice(0, page.path.lastIndexOf('/'))}.md`)
    return parent ? `${page.title} · ${parent.title}` : page.title
  }
  const assets = new Set(ws.assets().map((f) => f.path))
  // Labs: their sessions (P01 …) with the lab date – the next one highlighted.
  const today = new Date().toISOString().slice(0, 10)
  const labSessions = codePages
    .map((lab) => {
      const folder = lab.path.slice(0, -3)
      const module = moduleOfPath(ws, lab.path)
      const tasks = module ? labTasksOf(ws, module.path) : []
      const sessions = [...hubsOf(ws, folder).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([n, page]) => {
          const date = String(
            tasks.find((p) => p.data.Art === LAB_DATE && taskNumber(p) === n)?.data.Fällig ?? '',
          )
          return { page, date: date.slice(0, 10), past: !!date && date.slice(0, 10) < today, next: false }
        })
      const next = sessions.find((s) => s.date && !s.past)
      if (next) next.next = true
      return { lab, sessions }
    })
    .filter((x) => x.sessions.length > 0)
  const [labsOpen, setLabsOpen] = useState(() => {
    try {
      return localStorage.getItem('notiva:nav-labs') !== '0'
    } catch {
      return true
    }
  })
  const toggleLabs = () => {
    setLabsOpen(!labsOpen)
    try {
      localStorage.setItem('notiva:nav-labs', labsOpen ? '0' : '1')
    } catch {
      /* private mode */
    }
  }
  const dash = findStudyDashboard(ws)
  const [studyOpen, setStudyOpen] = useState(() => {
    try {
      return localStorage.getItem('notiva:nav-study') !== '0'
    } catch {
      return true
    }
  })
  const toggleStudy = () => {
    setStudyOpen(!studyOpen)
    try {
      localStorage.setItem('notiva:nav-study', studyOpen ? '0' : '1')
    } catch {
      /* private mode */
    }
  }
  const recent = useRecent((s) => s.files)
    .map((f) => f.path)
    .filter((p) => assets.has(p))
    .slice(0, 8)
  const tags = [...ws.tags()].slice(0, 12)
  const mac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  return (
    <nav aria-label={t('nav.pages')} className="flex h-full flex-col bg-sunken">
      <div data-titlebar className="flex items-center gap-2 px-3 pt-3 pb-2">
        <span
          aria-hidden
          className="flex size-7 items-center justify-center rounded-[7px] bg-accent text-[15px] font-bold text-on-accent"
        >
          N
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-bold">{ws.vault.name}</div>
          <div className="truncate text-xs text-ink-3">
            {ws.vault.kind === 'memory' ? t('nav.demoBadge') : t(`kind.${ws.vault.kind}`)}
          </div>
        </div>
        <IconButton
          size="sm"
          label={t('nav.closeVault')}
          onClick={() => {
            forgetVault()
            void setWorkspace(null)
          }}
        >
          <LogOut size={14} />
        </IconButton>
      </div>

      <div className="space-y-px px-2">
        <NavButton
          icon={<Search size={15} />}
          label={t('nav.search')}
          onClick={() => setSearch(true)}
          hint={<Kbd>{mac ? '⌘K' : 'Strg K'}</Kbd>}
        />
        <NavButton
          icon={<Plus size={15} />}
          label={t('nav.newPage')}
          onClick={() => useApp.getState().setNewPage({ folder: '' })}
        />
        <NavButton
          icon={<CalendarDays size={15} />}
          label={t('nav.today')}
          onClick={() => void actions.openToday()}
        />
        <NavButton
          icon={<LayoutTemplate size={15} />}
          label={t('nav.templates')}
          active={route.name === 'templates'}
          onClick={() => navigate({ name: 'templates' })}
        />
      </div>

      {/* Studies: one group, collapsible – everything about the semester in one place. */}
      {(dash || moodleAvailable()) && (
        <div className="mt-2 px-2">
          <button
            type="button"
            aria-expanded={studyOpen}
            onClick={() => toggleStudy()}
            className="flex w-full items-center gap-1 rounded-control px-2 py-1 text-left text-[12px] font-semibold tracking-wide text-ink-3 hover:bg-hover hover:text-ink-2"
          >
            <ChevronRight
              size={12}
              className={studyOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
            />
            {t('nav.studyGroup')}
          </button>
          {studyOpen && (
            <div className="space-y-px">
              {dash && (
                <NavButton
                  icon={<GraduationCap size={15} />}
                  label={t('nav.studyOverview')}
                  active={route.name === 'page' && route.path === dash.path}
                  onClick={() => openPage(dash.path)}
                />
              )}
              {dash && (
                <NavButton
                  icon={<BookOpenCheck size={15} />}
                  label={t('nav.semester')}
                  active={route.name === 'semester'}
                  onClick={() => navigate({ name: 'semester' })}
                />
              )}
              {dash && (
                <NavButton
                  icon={<CalendarClock size={15} />}
                  label={t('nav.timetable')}
                  active={route.name === 'timetable'}
                  onClick={() => navigate({ name: 'timetable' })}
                />
              )}
              {moodleAvailable() && (
                <NavButton
                  icon={<School size={15} />}
                  label={t('nav.moodle')}
                  active={route.name === 'moodle'}
                  onClick={() => navigate({ name: 'moodle' })}
                />
              )}
              {moodleAvailable() && (
                <NavButton
                  icon={<Award size={15} />}
                  label={t('nav.grades')}
                  active={route.name === 'grades'}
                  onClick={() => navigate({ name: 'grades' })}
                />
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {favorites.length > 0 && (
          <>
            <SectionLabel>{t('nav.favorites')}</SectionLabel>
            {favorites.map((page) => (
              <NavButton
                key={page.path}
                icon={page.icon ? <PageIcon page={page} size={14} /> : <Star size={14} />}
                label={page.title}
                active={route.name === 'page' && route.path === page.path}
                onClick={() => openPage(page.path)}
              />
            ))}
          </>
        )}
        {labSessions.length > 0 && (
          <div data-testid="nav-labs">
            <button
              type="button"
              aria-expanded={labsOpen}
              onClick={() => toggleLabs()}
              className="mt-2 flex w-full items-center gap-1 rounded-control px-2 py-1 text-left text-[12px] font-semibold tracking-wide text-ink-3 hover:bg-hover hover:text-ink-2"
            >
              <ChevronRight
                size={12}
                className={labsOpen ? 'rotate-90 transition-transform' : 'transition-transform'}
              />
              {t('nav.labs')}
            </button>
            {labsOpen &&
              labSessions.map(({ lab, sessions }) => (
                <div key={lab.path}>
                  <NavButton
                    icon={<FlaskConical size={14} />}
                    label={codeLabel(lab)}
                    active={route.name === 'page' && route.path === lab.path}
                    onClick={() => openPage(lab.path)}
                  />
                  <div className="ml-6 flex flex-wrap gap-1 pb-1">
                    {sessions.map((s) => (
                      <button
                        key={s.page.path}
                        type="button"
                        title={s.date ? `${s.page.title} · ${s.date}` : s.page.title}
                        onClick={() => openPage(s.page.path)}
                        className={cx(
                          'rounded-full border px-1.5 text-[11.5px] tabular-nums hover:bg-hover',
                          route.name === 'page' && route.path === s.page.path
                            ? 'border-accent bg-accent-soft font-semibold text-accent'
                            : s.next
                              ? 'border-accent text-accent'
                              : s.past
                                ? 'border-line text-ink-3'
                                : 'border-line text-ink-2',
                        )}
                      >
                        {s.page.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
        {codePages.length > 0 && (
          <>
            <SectionLabel>{t('nav.code')}</SectionLabel>
            {codePages.map((page) => (
              <NavButton
                key={page.path}
                icon={<Code2 size={14} />}
                label={codeLabel(page)}
                active={route.name === 'page' && route.path === page.path}
                onClick={() => openPage(page.path)}
              />
            ))}
          </>
        )}
        {recent.length > 0 && (
          <>
            <SectionLabel>{t('nav.recent')}</SectionLabel>
            {recent.map((path) => (
              <NavButton
                key={path}
                icon={<FileText size={14} />}
                label={path.split('/').pop()!}
                active={route.name === 'file' && route.path === path}
                onClick={() => navigate({ name: 'file', path })}
              />
            ))}
          </>
        )}
        <SectionLabel
          action={
            <IconButton
              size="sm"
              label={t('nav.newPage')}
              onClick={() => useApp.getState().setNewPage({ folder: '' })}
            >
              <Plus size={13} />
            </IconButton>
          }
        >
          {t('nav.pages')}
        </SectionLabel>
        <PageTree />
        {tags.length > 0 && (
          <>
            <SectionLabel>{t('nav.tags')}</SectionLabel>
            <div className="flex flex-wrap gap-1 px-2">
              {tags.map(([tag, paths]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => navigate({ name: 'tag', tag })}
                  className={cx(
                    'rounded-full px-2 py-0.5 text-xs text-ink-2 hover:bg-hover',
                    route.name === 'tag' && route.tag === tag
                      ? 'bg-accent-soft text-accent font-semibold'
                      : 'bg-surface',
                  )}
                >
                  #{tag} <span className="text-ink-3">{paths.length}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* On wide screens shelf and settings sit top right (activity bar). */}
      <div className="space-y-px border-t border-line px-2 py-2 min-[900px]:hidden">
        <NavButton
          icon={<Inbox size={15} />}
          label={t('shelf.title')}
          onClick={() => useApp.getState().openView('shelf')}
        />
        <NavButton
          icon={<Settings size={15} />}
          label={t('nav.settings')}
          active={route.name === 'settings'}
          onClick={() => navigate({ name: 'settings' })}
        />
      </div>
    </nav>
  )
}
