import { useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, Pencil, Plus } from 'lucide-react'
import { useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { COLORS, optionColor, relationTargets, type DatabaseDef, type PropertyDef } from '@/lib/database'
import type { FormulaValue } from '@/lib/formula'
import { Chip, cx, Popover, TextInput } from '@/components/ui'
import { PropertyValue } from './PropertyValue'

interface PropertyCellProps {
  def: PropertyDef
  value: FormulaValue | undefined
  onChange: (value: FormulaValue) => void
  /** Needed to add new select options to the schema. */
  onAddOption?: (property: string, option: string) => void
  className?: string
  placeholder?: string
}

const READ_ONLY = new Set(['formula', 'rollup'])
const INTERACTIVE_VALUES = new Set(['relation', 'url', 'email'])

/** Display + inline editor for a property. One component for table, properties panel and cards. */
export function PropertyCell({
  def,
  value,
  onChange,
  onAddOption,
  className,
  placeholder,
}: PropertyCellProps) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLElement | null>(null)

  if (def.type === 'checkbox') {
    return (
      <div className={cx('flex min-h-8 items-center px-2', className)}>
        <input
          type="checkbox"
          aria-label={def.name}
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          className="size-4 cursor-pointer accent-[var(--accent)]"
          data-interactive
        />
      </div>
    )
  }
  const readOnly = READ_ONLY.has(def.type)
  const isEmpty =
    value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
  return (
    <>
      {INTERACTIVE_VALUES.has(def.type) ? (
        // Values contain links/buttons themselves (relations, URLs) → no nested interactive roles.
        <div
          ref={anchor as React.RefObject<HTMLDivElement | null>}
          className={cx(
            'group/cell flex min-h-8 w-full min-w-0 items-center gap-1 px-2 py-1 text-[14px] hover:bg-hover',
            className,
          )}
        >
          <div className="min-w-0 flex-1">
            {isEmpty ? (
              <span className="text-ink-3">{placeholder ?? ''}</span>
            ) : (
              <PropertyValue def={def} value={value} compact />
            )}
          </div>
          <button
            type="button"
            aria-label={`${def.name} ${t('common.edit')}`}
            onClick={() => setOpen(true)}
            className="flex size-6 shrink-0 items-center justify-center rounded-control text-ink-3 opacity-0 group-hover/cell:opacity-100 hover:bg-line focus:opacity-100 max-md:opacity-100"
            data-interactive
          >
            <Pencil size={12} />
          </button>
        </div>
      ) : (
        <button
          ref={anchor as React.RefObject<HTMLButtonElement | null>}
          type="button"
          disabled={readOnly}
          onClick={() => setOpen(true)}
          aria-label={`${def.name} ${t('common.edit')}`}
          className={cx(
            'flex min-h-8 w-full min-w-0 items-center px-2 py-1 text-left text-[14px] enabled:hover:bg-hover disabled:cursor-default disabled:text-ink',
            className,
          )}
          data-interactive
        >
          {isEmpty ? (
            <span className="text-ink-3">{placeholder ?? ''}</span>
          ) : (
            <PropertyValue def={def} value={value} compact />
          )}
        </button>
      )}
      <Popover anchor={anchor} open={open} onClose={() => setOpen(false)} label={def.name} className="w-72">
        <Editor
          def={def}
          value={value}
          onChange={onChange}
          onAddOption={onAddOption}
          close={() => setOpen(false)}
        />
      </Popover>
    </>
  )
}

function Editor({ def, value, onChange, onAddOption, close }: PropertyCellProps & { close: () => void }) {
  switch (def.type) {
    case 'select':
    case 'multiSelect':
      return (
        <SelectEditor def={def} value={value} onChange={onChange} onAddOption={onAddOption} close={close} />
      )
    case 'relation':
      return <RelationEditor def={def} value={value} onChange={onChange} />
    case 'date':
      return (
        <div className="space-y-2 p-1">
          <TextInput
            type="date"
            autoFocus
            defaultValue={typeof value === 'string' ? value.slice(0, 10) : ''}
            onChange={(e) => onChange(e.target.value || null)}
            aria-label={def.name}
          />
          {value ? (
            <button
              type="button"
              className="px-1 text-xs text-ink-3 hover:text-danger"
              onClick={() => {
                onChange(null)
                close()
              }}
            >
              {t('common.delete')}
            </button>
          ) : null}
        </div>
      )
    default:
      return <TextEditor def={def} value={value} onChange={onChange} close={close} />
  }
}

function TextEditor({
  def,
  value,
  onChange,
  close,
}: {
  def: PropertyDef
  value: FormulaValue | undefined
  onChange: (v: FormulaValue) => void
  close: () => void
}) {
  const [text, setText] = useState(value === null || value === undefined ? '' : String(value))
  const commit = () => {
    if (text !== String(value ?? '')) onChange(text.trim() === '' ? null : text)
    close()
  }
  return (
    <form
      className="p-1"
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
    >
      <TextInput
        autoFocus
        aria-label={def.name}
        type={
          def.type === 'number'
            ? 'text'
            : def.type === 'url'
              ? 'url'
              : def.type === 'email'
                ? 'email'
                : 'text'
        }
        inputMode={def.type === 'number' ? 'decimal' : undefined}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
      />
    </form>
  )
}

function SelectEditor({
  def,
  value,
  onChange,
  onAddOption,
  close,
}: PropertyCellProps & { close: () => void }) {
  const [query, setQuery] = useState('')
  const multi = def.type === 'multiSelect'
  const selected = new Set(multi ? ((value as string[] | null) ?? []) : value ? [String(value)] : [])
  const options = def.options ?? []
  const q = query.trim().toLowerCase()
  const filtered = options.filter((o) => o.value.toLowerCase().includes(q))
  const exact = options.some((o) => o.value.toLowerCase() === q)
  const toggle = (option: string) => {
    if (!multi) {
      onChange(selected.has(option) ? null : option)
      close()
      return
    }
    const next = new Set(selected)
    if (next.has(option)) next.delete(option)
    else next.add(option)
    onChange([...next])
  }
  const create = () => {
    const name = query.trim()
    if (!name) return
    onAddOption?.(def.name, name)
    toggle(name)
    setQuery('')
  }
  return (
    <div className="p-1">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (filtered[0] && !q) return
          if (exact) toggle(options.find((o) => o.value.toLowerCase() === q)!.value)
          else create()
        }}
      >
        <TextInput
          autoFocus
          placeholder={t('db.choose')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={def.name}
        />
      </form>
      <div className="mt-1 max-h-60 overflow-auto" role="listbox" aria-multiselectable={multi}>
        {filtered.map((o) => (
          <button
            key={o.value}
            type="button"
            role="option"
            aria-selected={selected.has(o.value)}
            onClick={() => toggle(o.value)}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 hover:bg-hover"
          >
            <span className="flex-1 text-left">
              <Chip color={o.color}>{o.value}</Chip>
            </span>
            {selected.has(o.value) && <Check size={14} className="text-accent" />}
          </button>
        ))}
        {q && !exact && onAddOption && (
          <button
            type="button"
            onClick={create}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-ink-2 hover:bg-hover"
          >
            <Plus size={14} /> {t('db.addOption')}:{' '}
            <Chip color={COLORS[options.length % COLORS.length]}>{query.trim()}</Chip>
          </button>
        )}
      </div>
    </div>
  )
}

function RelationEditor({
  def,
  value,
  onChange,
}: {
  def: PropertyDef
  value: FormulaValue | undefined
  onChange: (v: FormulaValue) => void
}) {
  const ws = useWorkspace()
  const [query, setQuery] = useState('')
  const selected = relationTargets((value ?? []) as string[])
  const target = def.database ? ws.findDatabase(def.database) : null
  const candidates = useMemo(() => {
    const rows = target ? ws.rows(target.path) : ws.all().filter((p) => !p.database)
    const q = query.toLowerCase()
    return rows
      .filter((r) => r.title.toLowerCase().includes(q))
      .sort((a, b) => a.title.localeCompare(b.title, 'de'))
      .slice(0, 50)
  }, [ws, target, query])
  const isSelected = (path: string) => selected.some((s) => ws.resolveLink(s) === path)
  const toggle = (path: string) => {
    const link = ws.linkText(path)
    onChange(isSelected(path) ? selected.filter((s) => ws.resolveLink(s) !== path) : [...selected, link])
  }
  return (
    <div className="p-1">
      <TextInput
        autoFocus
        placeholder={t('db.choose')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label={def.name}
      />
      <div className="mt-1 max-h-64 overflow-auto">
        {candidates.map((row) => (
          <button
            key={row.path}
            type="button"
            onClick={() => toggle(row.path)}
            className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left hover:bg-hover"
          >
            <span className="flex-1 truncate">{row.title}</span>
            {isSelected(row.path) && <Check size={14} className="text-accent" />}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Adds an option to a select property (used by every editor that can create options). */
export function addOptionTo(def: DatabaseDef, property: string, option: string): DatabaseDef {
  const prop = def.properties.find((p) => p.name === property)
  if (prop && !(prop.options ?? []).some((o) => o.value === option)) {
    prop.options = [
      ...(prop.options ?? []),
      { value: option, color: COLORS[(prop.options?.length ?? 0) % COLORS.length]! },
    ]
  }
  return def
}

export function OptionChip({
  def,
  value,
  children,
}: {
  def: PropertyDef
  value: string
  children?: ReactNode
}) {
  return <Chip color={optionColor(def, value)}>{children ?? value}</Chip>
}
