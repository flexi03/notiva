import {
  Award,
  BookOpenCheck,
  CalendarDays,
  Code2,
  FileText,
  CalendarClock,
  CircleHelp,
  GraduationCap,
  LayoutTemplate,
  LogOut,
  Plus,
  Search,
  Settings,
  Star,
  Inbox,
} from 'lucide-react'
import { moodleAvailable } from '@/app/moodle'
import type { ReactNode } from 'react'
import { useRecent } from '@/app/recent'
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
        active && 'bg-hover font-semibold text-ink',
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
  const recent = useRecent((s) => s.files)
    .map((f) => f.path)
    .filter((p) => assets.has(p))
    .slice(0, 5)
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
        {findStudyDashboard(ws) && (
          <NavButton
            icon={<BookOpenCheck size={15} />}
            label={t('nav.semester')}
            active={route.name === 'semester'}
            onClick={() => navigate({ name: 'semester' })}
          />
        )}
        {findStudyDashboard(ws) && (
          <NavButton
            icon={<CalendarClock size={15} />}
            label={t('nav.timetable')}
            active={route.name === 'timetable'}
            onClick={() => navigate({ name: 'timetable' })}
          />
        )}
        {moodleAvailable() && (
          <NavButton
            icon={<GraduationCap size={15} />}
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
        <NavButton
          icon={<CircleHelp size={15} />}
          label={t('nav.help')}
          active={route.name === 'help'}
          onClick={() => navigate({ name: 'help' })}
        />
      </div>

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
