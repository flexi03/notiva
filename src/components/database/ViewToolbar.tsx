import { useRef, useState, type ReactNode } from 'react'
import {
  ArrowUpDown,
  Calendar,
  Columns3,
  Eye,
  EyeOff,
  Filter as FilterIcon,
  LayoutGrid,
  List,
  Plus,
  Rows3,
  Settings2,
  Table,
  Trash2,
  X,
} from 'lucide-react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { FILTER_OPS, TITLE, VIEW_TYPES, type Filter, type FilterOp, type ViewType } from '@/lib/database'
import { Button, cx, Field, IconButton, MenuList, Popover, Select, TextInput } from '@/components/ui'
import type { DatabaseApi } from './useDatabase'

export const VIEW_ICONS: Record<ViewType, ReactNode> = {
  table: <Table size={14} />,
  board: <Columns3 size={14} />,
  gallery: <LayoutGrid size={14} />,
  list: <List size={14} />,
  calendar: <Calendar size={14} />,
}

const NO_VALUE_OPS = new Set<FilterOp>(['empty', 'notEmpty', 'checked', 'unchecked'])

function ToolbarButton({
  icon,
  label,
  count,
  children,
  align = 'end',
}: {
  icon: ReactNode
  label: string
  count?: number
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <Button
        ref={ref}
        variant="ghost"
        size="sm"
        icon={icon}
        onClick={() => setOpen((o) => !o)}
        className={cx(count ? 'text-accent' : '')}
        aria-expanded={open}
      >
        <span className="max-sm:sr-only">{label}</span>
        {count ? (
          <span className="rounded-full bg-accent-soft px-1.5 text-[11px] font-bold">{count}</span>
        ) : null}
      </Button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align={align} label={label}>
        {children(() => setOpen(false))}
      </Popover>
    </>
  )
}

/** View tabs + filter / sort / group / properties / view settings. */
export function ViewToolbar({
  db,
  embedded,
  actions,
}: {
  db: DatabaseApi
  embedded?: boolean
  actions?: ReactNode
}) {
  const { view, views, viewIndex, setViewIndex, def } = db
  const ask = useApp((s) => s.ask)
  if (!def) return null
  const propertyNames = [TITLE, ...def.properties.map((p) => p.name)]

  const addView = async (type: ViewType) => {
    const groupable = def.properties.find((p) => p.type === 'select')
    const dateProp = def.properties.find((p) => p.type === 'date')
    await db.updateDef((d) => {
      d.views.push({
        name: t(`view.${type}`),
        type,
        ...(type === 'board' && groupable ? { groupBy: groupable.name } : {}),
        ...(type === 'calendar' && dateProp ? { dateProperty: dateProp.name } : {}),
      })
      return d
    })
    setViewIndex(def.views.length)
  }

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line pb-1.5">
      <div
        role="tablist"
        aria-label={t('db.view')}
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
      >
        {views.map((v, i) => (
          <button
            key={`${v.name}-${i}`}
            type="button"
            role="tab"
            aria-selected={i === viewIndex}
            onClick={() => setViewIndex(i)}
            className={cx(
              'relative flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13.5px] text-ink-2 hover:bg-hover',
              i === viewIndex &&
                'font-semibold text-ink after:absolute after:inset-x-2 after:-bottom-1.5 after:h-[3px] after:rounded-full after:bg-marker',
            )}
          >
            {VIEW_ICONS[v.type]}
            {v.name}
          </button>
        ))}
        {!embedded && (
          <ToolbarButton icon={<Plus size={14} />} label={t('db.addView')} align="start">
            {(close) => (
              <MenuList
                onDone={close}
                items={VIEW_TYPES.map((type) => ({
                  label: t(`view.${type}`),
                  icon: VIEW_ICONS[type],
                  onSelect: () => void addView(type),
                }))}
              />
            )}
          </ToolbarButton>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <ToolbarButton icon={<FilterIcon size={14} />} label={t('db.filter')} count={view.filter?.length}>
          {() => <FilterEditor db={db} propertyNames={propertyNames} />}
        </ToolbarButton>
        <ToolbarButton icon={<ArrowUpDown size={14} />} label={t('db.sort')} count={view.sort?.length}>
          {() => <SortEditor db={db} propertyNames={propertyNames} />}
        </ToolbarButton>
        {(view.type === 'board' || view.type === 'list' || view.type === 'table') && (
          <ToolbarButton icon={<Rows3 size={14} />} label={t('db.group')} count={view.groupBy ? 1 : 0}>
            {() => (
              <div className="w-60 p-2">
                <Field label={t('db.group')}>
                  <Select
                    value={view.groupBy ?? ''}
                    onChange={(e) =>
                      void db.updateView((v) => ({ ...v, groupBy: e.target.value || undefined }))
                    }
                  >
                    {view.type !== 'board' && <option value="">{t('db.noGroup')}</option>}
                    {def.properties
                      .filter((p) =>
                        ['select', 'multiSelect', 'checkbox', 'text', 'relation', 'number'].includes(p.type),
                      )
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
            )}
          </ToolbarButton>
        )}
        <ToolbarButton icon={<Settings2 size={14} />} label={t('db.view')}>
          {(close) => (
            <div className="w-72 space-y-3 p-2">
              <Field label={t('common.name')}>
                <TextInput
                  defaultValue={view.name}
                  onBlur={(e) => e.target.value.trim() && void db.updateView({ name: e.target.value.trim() })}
                />
              </Field>
              <Field label={t('db.view')}>
                <Select
                  value={view.type}
                  onChange={(e) => void db.updateView({ type: e.target.value as ViewType })}
                >
                  {VIEW_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`view.${type}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              {view.type === 'calendar' && (
                <Field label={t('type.date')}>
                  <Select
                    value={view.dateProperty ?? ''}
                    onChange={(e) => void db.updateView({ dateProperty: e.target.value })}
                  >
                    {def.properties
                      .filter((p) => p.type === 'date')
                      .map((p) => (
                        <option key={p.name} value={p.name}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              <PropertyVisibility db={db} />
              {views.length > 1 && (
                <Button
                  variant="danger"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={async () => {
                    const ok = await ask({
                      title: t('db.deleteView'),
                      label: t('common.confirmDelete', { title: view.name }),
                      confirmLabel: t('common.delete'),
                      confirm: true,
                      danger: true,
                    })
                    if (!ok) return
                    close()
                    setViewIndex(0)
                    await db.updateDef((d) => {
                      d.views.splice(viewIndex, 1)
                      return d
                    })
                  }}
                >
                  {t('db.deleteView')}
                </Button>
              )}
            </div>
          )}
        </ToolbarButton>
        {actions}
      </div>
    </div>
  )
}

function FilterEditor({ db, propertyNames }: { db: DatabaseApi; propertyNames: string[] }) {
  const filters = db.view.filter ?? []
  const set = (next: Filter[]) =>
    void db.updateView((v) => ({ ...v, filter: next.length ? next : undefined }))
  return (
    <div className="w-[min(26rem,90vw)] space-y-2 p-2">
      {filters.map((f, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select
            aria-label={t('db.properties')}
            value={f.property}
            onChange={(e) => set(filters.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}
            className="h-8 flex-1"
          >
            {propertyNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Operator"
            value={f.op}
            onChange={(e) =>
              set(filters.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x)))
            }
            className="h-8 flex-1"
          >
            {FILTER_OPS.map((op) => (
              <option key={op} value={op}>
                {t(`op.${op}`)}
              </option>
            ))}
          </Select>
          {!NO_VALUE_OPS.has(f.op) && (
            <TextInput
              aria-label={t('db.value')}
              defaultValue={f.value === undefined || f.value === null ? '' : String(f.value)}
              onBlur={(e) =>
                set(filters.map((x, j) => (j === i ? { ...x, value: parseFilterInput(e.target.value) } : x)))
              }
              className="h-8 flex-1"
              placeholder="today, 7, …"
            />
          )}
          <IconButton
            size="sm"
            label={t('common.delete')}
            onClick={() => set(filters.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </IconButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus size={14} />}
        onClick={() => set([...filters, { property: propertyNames[1] ?? TITLE, op: 'eq', value: '' }])}
      >
        {t('db.addFilter')}
      </Button>
    </div>
  )
}

function parseFilterInput(text: string): string | number {
  const trimmed = text.trim()
  return trimmed !== '' && !Number.isNaN(Number(trimmed.replace(',', '.')))
    ? Number(trimmed.replace(',', '.'))
    : trimmed
}

function SortEditor({ db, propertyNames }: { db: DatabaseApi; propertyNames: string[] }) {
  const sorts = db.view.sort ?? []
  const set = (next: typeof sorts) =>
    void db.updateView((v) => ({ ...v, sort: next.length ? next : undefined }))
  return (
    <div className="w-80 space-y-2 p-2">
      {sorts.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <Select
            aria-label={t('db.properties')}
            value={s.property}
            onChange={(e) => set(sorts.map((x, j) => (j === i ? { ...x, property: e.target.value } : x)))}
            className="h-8 flex-1"
          >
            {propertyNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
          <Select
            aria-label={t('db.sort')}
            value={s.direction}
            onChange={(e) =>
              set(sorts.map((x, j) => (j === i ? { ...x, direction: e.target.value as 'asc' | 'desc' } : x)))
            }
            className="h-8 w-32"
          >
            <option value="asc">{t('db.ascending')}</option>
            <option value="desc">{t('db.descending')}</option>
          </Select>
          <IconButton
            size="sm"
            label={t('common.delete')}
            onClick={() => set(sorts.filter((_, j) => j !== i))}
          >
            <X size={13} />
          </IconButton>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        icon={<Plus size={14} />}
        onClick={() => set([...sorts, { property: TITLE, direction: 'asc' }])}
      >
        {t('db.addSort')}
      </Button>
    </div>
  )
}

function PropertyVisibility({ db }: { db: DatabaseApi }) {
  const all = db.def?.properties.map((p) => p.name) ?? []
  const visible = db.view.properties ?? all
  const toggle = (name: string) => {
    const next = visible.includes(name)
      ? visible.filter((n) => n !== name)
      : [...visible, name].sort((a, b) => all.indexOf(a) - all.indexOf(b))
    void db.updateView({ properties: next })
  }
  return (
    <Field label={t('db.properties')}>
      <div className="max-h-48 space-y-px overflow-auto">
        {all.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => toggle(name)}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1 text-left text-sm hover:bg-hover"
          >
            {visible.includes(name) ? (
              <Eye size={14} className="text-accent" />
            ) : (
              <EyeOff size={14} className="text-ink-3" />
            )}
            <span className={cx('flex-1 truncate', !visible.includes(name) && 'text-ink-3')}>{name}</span>
          </button>
        ))}
      </div>
    </Field>
  )
}
