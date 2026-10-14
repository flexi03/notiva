import type { ReactNode } from 'react'
import { GitBranch, Sparkles } from 'lucide-react'
import { useGit } from '@/app/git'
import { useApp, type RightPanel } from '@/app/store'
import { t } from '@/i18n'
import { cx } from '@/components/ui'

/** Right edge (like VS Code's activity bar): switches the views of the right side bar. */
export function ActivityBar() {
  const changes = useGit((s) => s.state?.changes.length ?? 0)
  return (
    <nav
      aria-label={t('nav.activity')}
      className="no-print flex w-11 shrink-0 flex-col items-center gap-1 border-l border-line bg-sunken py-2 max-[899px]:hidden"
    >
      <Item panel="assistant" label={t('ai.toggle')} icon={<Sparkles size={19} />} />
      <Item panel="git" label={t('git.toggle')} icon={<GitBranch size={19} />} badge={changes} />
    </nav>
  )
}

function Item({
  panel,
  label,
  icon,
  badge = 0,
}: {
  panel: RightPanel
  label: string
  icon: ReactNode
  badge?: number
}) {
  const active = useApp((s) => s.rightPanel === panel)
  const toggle = useApp((s) => s.toggleRightPanel)
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={() => toggle(panel)}
      className={cx(
        'relative flex size-9 items-center justify-center rounded-control text-ink-2 transition-colors hover:bg-hover hover:text-ink',
        active && 'bg-surface text-accent shadow-[inset_2px_0_0_var(--accent)]',
      )}
    >
      {icon}
      {badge > 0 && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-accent px-1 text-center text-[10px] leading-4 font-bold text-on-accent"
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  )
}
