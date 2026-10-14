import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import {
  AGGREGATIONS,
  COLORS,
  PROPERTY_TYPES,
  type Aggregation,
  type Color,
  type PropertyDef,
  type PropertyType,
} from '@/lib/database'
import { evaluateFormula } from '@/lib/formula'
import { Button, Chip, Field, IconButton, Select, TextInput } from '@/components/ui'
import type { DatabaseApi } from './useDatabase'

/** Edits one property of the schema: name, type and type-specific settings. */
export function PropertyMenu({
  db,
  property,
  close,
}: {
  db: DatabaseApi
  property: PropertyDef
  close: () => void
}) {
  const ws = useWorkspace()
  const ask = useApp((s) => s.ask)
  const [name, setName] = useState(property.name)
  const update = (patch: Partial<PropertyDef>) =>
    db.updateDef((d) => {
      const p = d.properties.find((x) => x.name === property.name)
      if (p) Object.assign(p, patch)
      return d
    })

  const rename = () => {
    const next = name.trim()
    if (!next || next === property.name || db.def?.properties.some((p) => p.name === next))
      return setName(property.name)
    void ws.renameDatabaseProperty(db.page!.path, property.name, next)
  }

  const remove = async () => {
    const ok = await ask({
      title: t('db.deleteProperty'),
      label: t('common.confirmDelete', { title: property.name }),
      confirmLabel: t('common.delete'),
      confirm: true,
      danger: true,
    })
    if (!ok) return
    close()
    await db.updateDef((d) => {
      d.properties = d.properties.filter((p) => p.name !== property.name)
      d.views.forEach((v) => {
        if (v.properties) v.properties = v.properties.filter((p) => p !== property.name)
        if (v.groupBy === property.name) delete v.groupBy
        v.filter = v.filter?.filter((f) => f.property !== property.name)
        v.sort = v.sort?.filter((s) => s.property !== property.name)
      })
      return d
    })
  }

  const preview =
    property.type === 'formula' && db.rows[0]
      ? evaluateFormula(property.formula ?? '', { props: db.rows[0].values })
      : null

  return (
    <div className="w-80 space-y-3 p-2">
      <Field label={t('db.propertyName')}>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === 'Enter' && rename()}
        />
      </Field>
      <Field label={t('db.propertyType')}>
        <Select value={property.type} onChange={(e) => void update({ type: e.target.value as PropertyType })}>
          {PROPERTY_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`type.${type}`)}
            </option>
          ))}
        </Select>
      </Field>

      {(property.type === 'select' || property.type === 'multiSelect') && (
        <OptionsEditor property={property} onChange={(options) => void update({ options })} />
      )}

      {property.type === 'number' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Format">
            <Select
              value={property.format ?? 'number'}
              onChange={(e) => void update({ format: e.target.value as PropertyDef['format'] })}
            >
              <option value="number">1.234,5</option>
              <option value="percent">%</option>
              <option value="euro">€</option>
            </Select>
          </Field>
          <Field label="Nachkommastellen">
            <Select
              value={String(property.decimals ?? '')}
              onChange={(e) =>
                void update(
                  e.target.value === '' ? { decimals: undefined } : { decimals: Number(e.target.value) },
                )
              }
            >
              <option value="">auto</option>
              {[0, 1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      {property.type === 'formula' && (
        <Field label={t('db.formula')} hint={t('db.formulaHelp')}>
          <TextInput
            defaultValue={property.formula ?? ''}
            className="font-code text-[13px]"
            onBlur={(e) => void update({ formula: e.target.value })}
          />
          {preview && (
            <span className="mt-1 block text-xs">
              {preview.error ? (
                <span className="text-danger">{preview.error}</span>
              ) : (
                <span className="text-ink-2">= {String(preview.value ?? '')}</span>
              )}
            </span>
          )}
        </Field>
      )}

      {property.type === 'relation' && (
        <Field label={t('db.relationTarget')}>
          <Select
            value={property.database ?? ''}
            onChange={(e) => void update({ database: e.target.value || undefined })}
          >
            <option value="">{t('nav.pages')}</option>
            {ws.databases().map((d) => (
              <option key={d.path} value={d.path}>
                {d.title}
              </option>
            ))}
          </Select>
        </Field>
      )}

      {property.type === 'rollup' && (
        <div className="space-y-2">
          <Field label={t('db.rollupRelation')}>
            <Select
              value={property.relation ?? ''}
              onChange={(e) => void update({ relation: e.target.value })}
            >
              <option value="" />
              {db.def?.properties
                .filter((p) => p.type === 'relation')
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={t('db.rollupProperty')}>
            <TextInput
              defaultValue={property.property ?? ''}
              onBlur={(e) => void update({ property: e.target.value })}
            />
          </Field>
          <Field label={t('db.aggregation')}>
            <Select
              value={property.aggregation ?? 'count'}
              onChange={(e) => void update({ aggregation: e.target.value as Aggregation })}
            >
              {AGGREGATIONS.filter((a) => a !== 'weightedAvg').map((a) => (
                <option key={a} value={a}>
                  {t(`agg.${a}`)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      )}

      <div className="border-t border-line pt-2">
        <Button variant="danger" size="sm" icon={<Trash2 size={14} />} onClick={() => void remove()}>
          {t('db.deleteProperty')}
        </Button>
      </div>
    </div>
  )
}

function OptionsEditor({
  property,
  onChange,
}: {
  property: PropertyDef
  onChange: (options: NonNullable<PropertyDef['options']>) => void
}) {
  const options = property.options ?? []
  const [draft, setDraft] = useState('')
  const cycle = (color: Color) => COLORS[(COLORS.indexOf(color) + 1) % COLORS.length]!
  return (
    <Field label={t('db.options')}>
      <div className="space-y-1">
        {options.map((o, i) => (
          <div key={o.value} className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Farbe wechseln"
              title="Farbe wechseln"
              onClick={() => onChange(options.map((x, j) => (j === i ? { ...x, color: cycle(x.color) } : x)))}
            >
              <Chip color={o.color}>{o.value}</Chip>
            </button>
            <span className="flex-1" />
            <IconButton
              size="sm"
              label={t('common.delete')}
              onClick={() => onChange(options.filter((_, j) => j !== i))}
            >
              <X size={13} />
            </IconButton>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const value = draft.trim()
            if (value && !options.some((o) => o.value === value))
              onChange([...options, { value, color: COLORS[options.length % COLORS.length]! }])
            setDraft('')
          }}
        >
          <TextInput
            placeholder={t('db.addOption')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8"
          />
        </form>
      </div>
    </Field>
  )
}
