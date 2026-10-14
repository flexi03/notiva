import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { toPlainText } from '@/lib/markdown'
import { EmptyState } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { PageIcon } from '@/components/layout/PageIcon'

export function TagScreen({ tag }: { tag: string }) {
  const ws = useWorkspace()
  const openPage = useApp((s) => s.openPage)
  const pages = (ws.tags().get(tag) ?? []).map((p) => ws.get(p)!).filter(Boolean)
  return (
    <>
      <Topbar title={`#${tag}`} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-10 sm:px-10">
        <h1 className="mb-6 text-[2rem] font-bold">{t('tags.title', { tag })}</h1>
        {pages.length === 0 ? (
          <EmptyState title={t('tags.none')} />
        ) : (
          <ul className="space-y-1">
            {pages.map((p) => (
              <li key={p.path}>
                <button
                  type="button"
                  onClick={() => openPage(p.path)}
                  className="flex w-full items-start gap-3 rounded-control px-2 py-2 text-left hover:bg-hover"
                >
                  <PageIcon page={p} />
                  <span className="min-w-0">
                    <span className="block font-semibold">{p.title}</span>
                    <span className="line-clamp-1 text-[13px] text-ink-2">
                      {toPlainText(p.body).slice(0, 160)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
