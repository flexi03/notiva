import { Plus } from 'lucide-react'
import { t } from '@/i18n'
import type { Filter } from '@/lib/database'
import { Button, EmptyState } from '@/components/ui'
import { BoardView } from './BoardView'
import { CalendarView } from './CalendarView'
import { GalleryView } from './GalleryView'
import { ListView } from './ListView'
import { TableView } from './TableView'
import { ViewToolbar } from './ViewToolbar'
import { useDatabase } from './useDatabase'

/** A database with its views. Used on the database page itself and for embeds in other pages. */
export function DatabaseView({
  dbPath,
  viewName,
  embedded,
  extraFilter,
  limit,
}: {
  dbPath: string
  viewName?: string
  embedded?: boolean
  extraFilter?: Filter[]
  limit?: number
}) {
  const db = useDatabase(dbPath, {
    ...(viewName ? { viewName } : {}),
    ...(extraFilter ? { extraFilter } : {}),
    ...(limit ? { limit } : {}),
  })
  if (!db.def || !db.page) return <p className="text-sm text-danger">{t('db.notFound', { name: dbPath })}</p>
  const empty = db.rows.length === 0 && db.view.type !== 'calendar' && db.view.type !== 'board'
  return (
    <section aria-label={db.page.title} className="space-y-3" data-interactive>
      {embedded && (
        <button
          type="button"
          onClick={() => db.openRow(dbPath)}
          className="flex items-center gap-2 text-[15px] font-bold hover:underline hover:decoration-marker hover:decoration-2 hover:underline-offset-4"
        >
          {db.page.icon && <span aria-hidden>{db.page.icon}</span>}
          {db.page.title}
        </button>
      )}
      <ViewToolbar
        db={db}
        embedded={embedded}
        actions={
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={14} />}
            onClick={() => void db.addRow({}, !embedded)}
          >
            {t('db.new')}
          </Button>
        }
      />
      {empty ? (
        <EmptyState title={db.allRows.length ? t('db.emptyFiltered') : t('db.empty')} />
      ) : db.view.type === 'board' ? (
        <BoardView db={db} />
      ) : db.view.type === 'gallery' ? (
        <GalleryView db={db} />
      ) : db.view.type === 'list' ? (
        <ListView db={db} />
      ) : db.view.type === 'calendar' ? (
        <CalendarView db={db} />
      ) : (
        <TableView db={db} />
      )}
    </section>
  )
}
