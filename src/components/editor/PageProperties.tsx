import { useRef, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useAction, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { propertyDef, rowValues, type PropertyDef } from '@/lib/database'
import type { FrontmatterValue } from '@/lib/frontmatter'
import type { FormulaValue } from '@/lib/formula'
import { IconButton, Popover, TextInput } from '@/components/ui'
import { PropertyCell, addOptionTo } from '@/components/database/PropertyCell'
import type { Page } from '@/lib/workspace'

/** Keys the app manages itself; not shown as free properties. */
const RESERVED = new Set(['title', 'icon', 'database', 'cover', 'order', 'template', 'aliases', 'width'])

/** Properties of a database row (typed by schema) or free frontmatter of a normal page. */
export function PageProperties({ page }: { page: Page }) {
  const ws = useWorkspace()
  const run = useAction()
  const parent = page.parentDatabase ? ws.get(page.parentDatabase) : undefined
  const def = parent?.database

  if (def) {
    const values =
      ws.resolvedRows(parent!.path).find((r) => r.row.path === page.path)?.values ??
      rowValues(
        { path: page.path, title: page.title, data: page.data, body: page.body, mtime: page.mtime },
        def,
      )
    return (
      <dl className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-y-px text-[14px]">
        {def.properties.map((p) => (
          <Row key={p.name} name={p.name}>
            <PropertyCell
              def={p}
              value={values[p.name]}
              placeholder="–"
              className="rounded-control"
              onChange={(v) => {
                const prop = propertyDef(def, p.name)!
                void run(() => ws.setProperty(page.path, p.name, toStored(prop, v)))
              }}
              onAddOption={(prop, option) =>
                void run(() => ws.updateDatabase(parent!.path, (d) => addOptionTo(d, prop, option)))
              }
            />
          </Row>
        ))}
      </dl>
    )
  }

  // Nested settings (e.g. "studium:") are not properties – they stay in the file, untouched.
  const entries = Object.entries(page.data).filter(
    ([k, v]) => !RESERVED.has(k) && !(typeof v === 'object' && v !== null && !Array.isArray(v)),
  )
  return (
    <dl className="grid grid-cols-[minmax(7rem,11rem)_1fr] gap-y-px text-[14px]">
      {entries.map(([key, value]) => (
        <Row key={key} name={key} onRemove={() => void run(() => ws.setProperty(page.path, key, undefined))}>
          <PropertyCell
            def={guessDef(key, value)}
            value={value as FormulaValue}
            placeholder="–"
            className="rounded-control"
            onChange={(v) =>
              void run(() => ws.setProperty(page.path, key, v === null ? undefined : (v as FrontmatterValue)))
            }
          />
        </Row>
      ))}
      <AddProperty
        onAdd={(key) => void run(() => ws.setProperty(page.path, key, ''))}
        existing={Object.keys(page.data)}
      />
    </dl>
  )
}

function Row({
  name,
  children,
  onRemove,
}: {
  name: string
  children: React.ReactNode
  onRemove?: () => void
}) {
  return (
    <>
      <dt className="group flex min-h-8 items-center gap-1 truncate pr-2 text-ink-2">
        <span className="truncate">{name}</span>
        {onRemove && (
          <IconButton
            size="sm"
            label={`${name} ${t('common.delete')}`}
            onClick={onRemove}
            className="opacity-0 group-hover:opacity-100 focus:opacity-100"
          >
            <X size={12} />
          </IconButton>
        )}
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </>
  )
}

function AddProperty({ onAdd, existing }: { onAdd: (key: string) => void; existing: string[] }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLButtonElement>(null)
  return (
    <div className="col-span-2">
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-8 items-center gap-1.5 rounded-control px-1 text-[13px] text-ink-3 hover:bg-hover hover:text-ink"
      >
        <Plus size={14} /> {t('page.addProperty')}
      </button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} label={t('page.addProperty')}>
        <form
          className="w-60 p-1"
          onSubmit={(e) => {
            e.preventDefault()
            const key = name.trim()
            if (key && !existing.includes(key) && !RESERVED.has(key)) onAdd(key)
            setName('')
            setOpen(false)
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
    </div>
  )
}

/** Type for free frontmatter values, inferred from the value. */
function guessDef(name: string, value: FrontmatterValue): PropertyDef {
  if (typeof value === 'boolean') return { name, type: 'checkbox' }
  if (typeof value === 'number') return { name, type: 'number' }
  if (Array.isArray(value))
    return {
      name,
      type: value.some((v) => typeof v === 'string' && v.startsWith('[[')) ? 'relation' : 'multiSelect',
      options: [],
    }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return { name, type: 'date' }
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return { name, type: 'url' }
  if (typeof value === 'string' && /^\[\[.*\]\]$/.test(value)) return { name, type: 'relation' }
  return { name, type: 'text' }
}

function toStored(def: PropertyDef, v: FormulaValue): FrontmatterValue | undefined {
  if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return undefined
  if (def.type === 'relation') return (Array.isArray(v) ? v : [v]).map((x) => `[[${String(x)}]]`)
  if (def.type === 'number') {
    const n = Number(String(v).replace(',', '.'))
    return Number.isNaN(n) ? undefined : n
  }
  return v as FrontmatterValue
}
