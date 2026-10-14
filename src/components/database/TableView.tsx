import { useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { t } from '@/i18n'
import { groupRows, NO_VALUE, TITLE, type PropertyDef, type ResolvedRow } from '@/lib/database'
import { Chip, cx, IconButton, Popover, TextInput } from '@/components/ui'
import { PropertyCell, addOptionTo } from './PropertyCell'
import { PropertyMenu } from './PropertyMenu'
import { RowTitle } from './RowTitle'
import type { DatabaseApi } from './useDatabase'

const TYPE_GLYPH: Record<string, string> = {
  text: 'Aa',
  number: '#',
  select: '◉',
  multiSelect: '☰',
  date: '◷',
  checkbox: '☑',
  url: '↗',
  email: '@',
  formula: 'ƒ',
  relation: '↔',
  rollup: 'Σ',
}

export function TableView({ db }: { db: DatabaseApi }) {
  const groups = db.view.groupBy ? groupRows(db.rows, db.view.groupBy, db.def!) : null
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max border-collapse text-[14px]">
        <thead>
          <tr className="border-b border-line text-left text-[13px] text-ink-2">
            <th className="sticky left-0 z-[1] min-w-56 bg-paper px-2 py-1.5 font-semibold">
              <span className="mr-1.5 font-code text-[11px] text-ink-3">Aa</span>
              {TITLE}
            </th>
            {db.visible.map((p) => (
              <HeaderCell key={p.name} db={db} property={p} />
            ))}
            <th className="w-10 px-1">
              <AddPropertyButton db={db} />
            </th>
          </tr>
        </thead>
        <tbody>
          {groups
            ? groups
                .filter((g) => g.rows.length > 0)
                .map((g) => (
                  <GroupRows
                    key={g.key}
                    db={db}
                    label={g.key === NO_VALUE ? t('db.noValue') : g.label}
                    color={g.color}
                    rows={g.rows}
                    groupValue={g.key}
                  />
                ))
            : db.rows.map((row) => <TableRow key={row.row.path} db={db} row={row} />)}
        </tbody>
      </table>
      <button
        type="button"
        onClick={() => void db.addRow()}
        className="flex h-9 w-full items-center gap-1.5 border-b border-line px-2 text-[14px] text-ink-3 hover:bg-hover hover:text-ink"
      >
        <Plus size={15} /> {t('db.newRow')}
      </button>
    </div>
  )
}

function GroupRows({
  db,
  label,
  color,
  rows,
  groupValue,
}: {
  db: DatabaseApi
  label: string
  color?: Parameters<typeof Chip>[0]['color']
  rows: ResolvedRow[]
  groupValue: string
}) {
  return (
    <>
      <tr>
        <td colSpan={db.visible.length + 2} className="px-2 pt-4 pb-1">
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
            {color ? <Chip color={color}>{label}</Chip> : label}
            <span className="font-normal text-ink-3">{rows.length}</span>
            <IconButton
              size="sm"
              label={t('db.newRow')}
              onClick={() =>
                void db.addRow(
                  groupValue === NO_VALUE || !db.view.groupBy ? {} : { [db.view.groupBy]: groupValue },
                )
              }
            >
              <Plus size={13} />
            </IconButton>
          </span>
        </td>
      </tr>
      {rows.map((row) => (
        <TableRow key={row.row.path} db={db} row={row} />
      ))}
    </>
  )
}

function TableRow({ db, row }: { db: DatabaseApi; row: ResolvedRow }) {
  return (
    <tr className="group border-b border-line hover:bg-surface">
      <td className="sticky left-0 z-[1] bg-paper p-0 group-hover:bg-surface">
        <RowTitle db={db} row={row} />
      </td>
      {db.visible.map((p) => (
        <td
          key={p.name}
          className={cx('max-w-72 border-l border-line p-0', p.type === 'number' && 'text-right')}
        >
          <PropertyCell
            def={p}
            value={row.values[p.name]}
            onChange={(v) => void db.setValue(row.row.path, p.name, v)}
            onAddOption={(prop, option) => void db.updateDef((d) => addOptionTo(d, prop, option))}
          />
        </td>
      ))}
      <td className="border-l border-line p-0 text-center">
        <IconButton
          size="sm"
          label={t('db.deleteRow')}
          onClick={() => void db.deleteRow(row.row.path)}
          className="opacity-0 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 size={13} />
        </IconButton>
      </td>
    </tr>
  )
}

function HeaderCell({ db, property }: { db: DatabaseApi; property: PropertyDef }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <th className="border-l border-line p-0 font-semibold">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full min-w-32 items-center gap-1.5 px-2 py-1.5 text-left hover:bg-hover"
      >
        <span className="font-code text-[11px] text-ink-3">{TYPE_GLYPH[property.type]}</span>
        <span className="truncate">{property.name}</span>
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label={property.name}>
        <PropertyMenu db={db} property={property} close={() => setOpen(false)} />
      </Popover>
    </th>
  )
}

export function AddPropertyButton({ db }: { db: DatabaseApi }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLButtonElement>(null)
  const add = () => {
    const value = name.trim()
    if (!value || value === TITLE || db.def?.properties.some((p) => p.name === value)) return
    void db.updateDef((d) => {
      d.properties.push({ name: value, type: 'text' })
      d.views.forEach((v) => v.properties && v.properties.push(value))
      return d
    })
    setName('')
    setOpen(false)
  }
  return (
    <>
      <IconButton ref={ref} size="sm" label={t('db.addProperty')} onClick={() => setOpen(true)}>
        <Plus size={14} />
      </IconButton>
      <Popover
        anchor={ref}
        open={open}
        onClose={() => setOpen(false)}
        align="end"
        label={t('db.addProperty')}
      >
        <form
          className="w-64 p-1"
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <TextInput
            autoFocus
            placeholder={t('db.propertyName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </form>
      </Popover>
    </>
  )
}
