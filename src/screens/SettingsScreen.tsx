import type { ReactNode } from 'react'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { ACCENTS, MARKERS, type AccentId, type MarkerId, type Settings } from '@/lib/settings'
import { Button, cx, Field, Segmented, Switch, TextInput } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { exportVault } from './exportVault'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-6">
      <h2 className="mb-4 text-lg font-bold">{title}</h2>
      <div className="space-y-5">{children}</div>
    </section>
  )
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="font-semibold">{label}</p>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      {children}
    </div>
  )
}

function Swatches<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Record<T, { light: string; dark: string }>
  onChange: (v: T) => void
  label: string
}) {
  const dark = document.documentElement.dataset.theme === 'dark'
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-2">
      {(Object.keys(options) as T[]).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          aria-label={id}
          title={id}
          onClick={() => onChange(id)}
          className={cx(
            'size-8 rounded-full border-2 transition-transform',
            value === id ? 'scale-110 border-ink' : 'border-transparent',
          )}
          style={{ background: options[id][dark ? 'dark' : 'light'] }}
        />
      ))}
    </div>
  )
}

export function SettingsScreen() {
  const ws = useWorkspace()
  const { settings, updateSettings } = useApp()
  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      updateSettings({ [key]: value } as Partial<Settings>)

  return (
    <>
      <Topbar title={t('settings.title')} />
      <div className="mx-auto max-w-[46rem] px-4 py-10 sm:px-10">
        <h1 className="mb-6 text-[2rem] font-bold">{t('settings.title')}</h1>

        <Section title={t('settings.appearance')}>
          <Row label={t('settings.theme')}>
            <Segmented
              label={t('settings.theme')}
              value={settings.theme}
              onChange={set('theme')}
              options={(['system', 'light', 'dark'] as const).map((v) => ({
                value: v,
                label: t(`settings.theme.${v}`),
              }))}
            />
          </Row>
          <Row label={t('settings.accent')}>
            <Swatches<AccentId>
              label={t('settings.accent')}
              value={settings.accent}
              options={ACCENTS}
              onChange={set('accent')}
            />
          </Row>
          <Row label={t('settings.marker')}>
            <Swatches<MarkerId>
              label={t('settings.marker')}
              value={settings.marker}
              options={MARKERS}
              onChange={set('marker')}
            />
          </Row>
          <Row label={t('settings.font')}>
            <Segmented
              label={t('settings.font')}
              value={settings.font}
              onChange={set('font')}
              options={(['sans', 'serif', 'mono'] as const).map((v) => ({
                value: v,
                label: t(`settings.font.${v}`),
              }))}
            />
          </Row>
          <Row label={t('settings.fontSize')} hint={`${settings.fontSize}px`}>
            <input
              type="range"
              min={13}
              max={22}
              value={settings.fontSize}
              onChange={(e) => set('fontSize')(Number(e.target.value))}
              aria-label={t('settings.fontSize')}
              className="w-48 accent-[var(--accent)]"
            />
          </Row>
          <Row label={t('settings.width')}>
            <Segmented
              label={t('settings.width')}
              value={settings.width}
              onChange={set('width')}
              options={(['normal', 'wide', 'full'] as const).map((v) => ({
                value: v,
                label: t(`settings.width.${v}`),
              }))}
            />
          </Row>
          <Row label={t('settings.language')}>
            <Segmented
              label={t('settings.language')}
              value={settings.language}
              onChange={set('language')}
              options={[
                { value: 'de', label: 'Deutsch' },
                { value: 'en', label: 'English' },
              ]}
            />
          </Row>
        </Section>

        <Section title={t('settings.editor')}>
          <Row label={t('settings.spellcheck')}>
            <Switch
              label={t('settings.spellcheck')}
              checked={settings.spellcheck}
              onChange={set('spellcheck')}
            />
          </Row>
          <Field label={t('settings.dailyFolder')}>
            <TextInput
              defaultValue={settings.dailyFolder}
              onBlur={(e) => set('dailyFolder')(e.target.value)}
              className="max-w-xs"
            />
          </Field>
        </Section>

        <Section title={t('settings.advanced')}>
          <Field label={t('settings.customCss')} hint={t('settings.customCssHint')}>
            <textarea
              defaultValue={settings.customCss}
              onBlur={(e) => set('customCss')(e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder={'.md h1 { letter-spacing: -0.02em; }'}
              className="w-full rounded-control border border-line bg-surface p-2.5 font-code text-[13px] focus:border-accent focus:outline-none"
            />
          </Field>
        </Section>

        <Section title={t('settings.vault')}>
          <p className="text-sm text-ink-2">
            {t('settings.vaultInfo', {
              name: ws.vault.name,
              kind: t(`kind.${ws.vault.kind}`),
              pages: ws.all().length,
            })}
          </p>
          <Button onClick={() => void exportVault(ws)}>{t('settings.exportAll')}</Button>
          <p className="text-[13px] text-ink-3">{t('settings.about')}</p>
        </Section>
      </div>
    </>
  )
}
