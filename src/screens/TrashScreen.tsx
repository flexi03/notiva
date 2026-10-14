import { useCallback, useEffect, useState } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { useAction, useApp, useWorkspace } from '@/app/store'
import { getLanguage, t } from '@/i18n'
import type { TrashEntry } from '@/lib/workspace'
import { Button, EmptyState } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'

export function TrashScreen() {
  const ws = useWorkspace()
  const run = useAction()
  const { openPage, ask } = useApp()
  const [entries, setEntries] = useState<TrashEntry[] | null>(null)
  const load = useCallback(() => void ws.listTrash().then(setEntries), [ws])
  useEffect(load, [load, ws.version])

  return (
    <>
      <Topbar title={t('trash.title')} />
      <div className="mx-auto max-w-[var(--content-width)] px-4 py-10 sm:px-10">
        <h1 className="mb-6 text-[2rem] font-bold">{t('trash.title')}</h1>
        {entries && entries.length === 0 && (
          <EmptyState icon={<Trash2 size={28} />} title={t('trash.empty')} />
        )}
        <ul className="divide-y divide-line">
          {entries?.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">{entry.original.replace(/\.md$/, '')}</p>
                <p className="text-[13px] text-ink-3">
                  {t('trash.deletedAt', {
                    date: new Date(entry.deletedAt).toLocaleString(
                      getLanguage() === 'de' ? 'de-DE' : 'en-US',
                    ),
                  })}{' '}
                  · {t('trash.files', { count: entry.files.length })}
                </p>
              </div>
              <Button
                size="sm"
                icon={<RotateCcw size={14} />}
                onClick={() => void run(() => ws.restore(entry.id)).then((p) => p && openPage(p))}
              >
                {t('trash.restore')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 size={14} />}
                onClick={async () => {
                  const ok = await ask({
                    title: t('trash.deleteForever'),
                    label: t('common.confirmDelete', { title: entry.original }),
                    confirmLabel: t('trash.deleteForever'),
                    confirm: true,
                    danger: true,
                  })
                  if (ok) await run(() => ws.deleteFromTrash(entry.id)).then(load)
                }}
              >
                {t('trash.deleteForever')}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}
