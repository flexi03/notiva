import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { t } from '@/i18n'
import { TITLE, type ResolvedRow } from '@/lib/database'
import { IconButton, TextInput } from '@/components/ui'
import type { DatabaseApi } from './useDatabase'

/** Title cell: click to open the row page; pencil-free inline rename via double click. */
export function RowTitle({ db, row }: { db: DatabaseApi; row: ResolvedRow }) {
  const [editing, setEditing] = useState(false)
  const page = db.ws.get(row.row.path)
  if (editing) {
    return (
      <form
        className="p-0.5"
        onSubmit={(e) => {
          e.preventDefault()
          setEditing(false)
        }}
      >
        <TextInput
          autoFocus
          defaultValue={row.row.title}
          aria-label={TITLE}
          className="h-8"
          onBlur={(e) => {
            setEditing(false)
            if (e.target.value.trim() && e.target.value.trim() !== row.row.title)
              void db.setValue(row.row.path, TITLE, e.target.value.trim())
          }}
        />
      </form>
    )
  }
  return (
    <div className="flex min-h-8 items-center gap-1.5 pr-1 pl-2">
      {page?.icon && <span aria-hidden>{page.icon}</span>}
      <button
        type="button"
        onClick={() => db.openRow(row.row.path)}
        onDoubleClick={() => setEditing(true)}
        className="min-w-0 flex-1 truncate py-1 text-left font-semibold hover:underline hover:decoration-marker hover:decoration-2 hover:underline-offset-4"
      >
        {row.row.title}
      </button>
      <IconButton
        size="sm"
        label={t('page.rename')}
        onClick={() => setEditing(true)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <span className="text-xs">✎</span>
      </IconButton>
      <IconButton
        size="sm"
        label={t('db.openRow')}
        onClick={() => db.openRow(row.row.path)}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <ArrowUpRight size={13} />
      </IconButton>
    </div>
  )
}
