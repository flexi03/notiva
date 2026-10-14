import { useEffect } from 'react'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { Topbar } from '@/components/layout/Topbar'
import { PageIcon } from '@/components/layout/PageIcon'

/** Start: opens the first favorite or dashboard; otherwise lists recently edited pages. */
export function HomeScreen() {
  const ws = useWorkspace()
  const { settings, openPage } = useApp()
  const target =
    settings.favorites.find((p) => ws.get(p)) ??
    ws.all().find((p) => p.icon === '🎓' && !p.parentDatabase)?.path ??
    (ws.get('Willkommen.md') ? 'Willkommen.md' : null)

  useEffect(() => {
    if (target) openPage(target)
  }, [target, openPage])

  const recent = ws
    .all()
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 12)
  return (
    <>
      <Topbar title={t('nav.home')} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-10 sm:px-10">
        <h1 className="mb-4 text-2xl font-bold">{ws.vault.name}</h1>
        <ul className="grid gap-1 sm:grid-cols-2">
          {recent.map((p) => (
            <li key={p.path}>
              <button
                type="button"
                onClick={() => openPage(p.path)}
                className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left hover:bg-hover"
              >
                <PageIcon page={p} />
                <span className="truncate">{p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
