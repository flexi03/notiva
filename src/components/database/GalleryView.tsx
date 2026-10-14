import { RowCard } from './RowCard'
import type { DatabaseApi } from './useDatabase'

/** Tiles ("Kacheln"): responsive card grid. */
export function GalleryView({ db }: { db: DatabaseApi }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(12.5rem,1fr))] gap-3">
      {db.rows.map((row) => (
        <RowCard key={row.row.path} db={db} row={row} variant="gallery" />
      ))}
    </div>
  )
}
