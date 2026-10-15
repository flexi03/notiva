import { useState } from 'react'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { ACCENTS, MARKERS, type AccentId, type MarkerId, type Settings } from '@/lib/settings'
import { Button, cx, Field, Segmented, Switch, TextInput } from '@/components/ui'
import { Topbar } from '@/components/layout/Topbar'
import { exportVault } from './exportVault'
import { Row, Section } from './settingsLayout'
import { AiSettingsSection, McpSection } from './AiSettings'
import { MoodleSection } from '@/components/moodle/MoodleSettings'
import { EcampusSection } from '@/components/ecampus/EcampusSettings'
import { TranscriptionSettingsSection } from '@/components/lecture/TranscriptionSettings'
import { NotificationSettingsSection } from '@/components/notifications/NotificationSettings'
import { PromptEditor } from '@/components/ai/PromptEditor'
import { StudySettingsSection } from '@/components/study/StudySettings'

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

const TABS = ['general', 'study', 'checks', 'ai', 'vault'] as const
type Tab = (typeof TABS)[number]

/** Settings as a full screen. */
export function SettingsScreen() {
  return <SettingsContent />
}

/**
 * The settings themselves – full screen or compact in a side panel (tabs wrap, narrower padding).
 */
export function SettingsContent({ compact = false }: { compact?: boolean }) {
  const ws = useWorkspace()
  const { settings, updateSettings } = useApp()
  const route = useApp((s) => s.route)
  const requested = route.name === 'settings' ? route.section : undefined
  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      updateSettings({ [key]: value } as Partial<Settings>)
  const [tab, setTab] = useState<Tab>(() => {
    if (requested && (TABS as readonly string[]).includes(requested)) return requested as Tab
    try {
      const saved = localStorage.getItem('notiva:settingsTab') as Tab | null
      return saved && (TABS as readonly string[]).includes(saved) ? saved : 'general'
    } catch {
      return 'general'
    }
  })
  const choose = (id: Tab) => {
    setTab(id)
    try {
      localStorage.setItem('notiva:settingsTab', id)
    } catch {
      /* private mode */
    }
  }

  // A link to another tab (#/settings/ai) while the screen is open.
  const [seen, setSeen] = useState(requested)
  if (requested !== seen) {
    setSeen(requested)
    if (requested && (TABS as readonly string[]).includes(requested)) setTab(requested as Tab)
  }

  return (
    <>
      {!compact && <Topbar title={t('settings.title')} />}
      <div className={compact ? 'px-3 py-3' : 'mx-auto max-w-[46rem] px-4 py-10 sm:px-10'}>
        {!compact && <h1 className="mb-6 text-[2rem] font-bold">{t('settings.title')}</h1>}

        <div
          role="tablist"
          aria-label={t('settings.title')}
          className="mb-2 flex flex-wrap gap-1 border-b border-line pb-2"
        >
          {TABS.map((id) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`settings-${id}`}
              onClick={() => choose(id)}
              className={cx(
                'rounded-control px-3 py-1.5 text-sm font-medium transition-colors',
                tab === id ? 'bg-accent-soft text-ink' : 'text-ink-2 hover:bg-hover',
              )}
            >
              {t(`settings.tab.${id}`)}
            </button>
          ))}
        </div>
        {tab === 'general' && (
          <div role="tabpanel" id="settings-general" aria-labelledby="settings-tab-general">
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
              <Row label={t('autosave.label')} hint={t('autosave.hint')}>
                <Switch label={t('autosave.label')} checked={settings.autosave} onChange={set('autosave')} />
              </Row>
              <Row label={t('settings.spellcheck')}>
                <Switch
                  label={t('settings.spellcheck')}
                  checked={settings.spellcheck}
                  onChange={set('spellcheck')}
                />
              </Row>
              <Row label={t('settings.openEntries')} hint={t('settings.openEntriesHint')}>
                <Segmented
                  label={t('settings.openEntries')}
                  value={settings.openEntries}
                  onChange={set('openEntries')}
                  options={(['peek', 'page'] as const).map((v) => ({
                    value: v,
                    label: t(`settings.openEntries.${v}`),
                  }))}
                />
              </Row>
              <Row label={t('settings.eventBadge')}>
                <Segmented
                  label={t('settings.eventBadge')}
                  value={settings.eventBadge}
                  onChange={set('eventBadge')}
                  options={[
                    { value: 'bottom-left', label: t('settings.eventBadge.bottomLeft') },
                    { value: 'top-right', label: t('settings.eventBadge.topRight') },
                    { value: 'off', label: t('settings.eventBadge.off') },
                  ]}
                />
              </Row>
              <Row label={t('settings.pageRail')} hint={t('settings.pageRailHint')}>
                <Segmented
                  label={t('settings.pageRail')}
                  value={settings.pageRail}
                  onChange={set('pageRail')}
                  options={(['minimap', 'progress', 'off'] as const).map((v) => ({
                    value: v,
                    label: t(`settings.pageRail.${v}`),
                  }))}
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
          </div>
        )}
        {tab === 'study' && (
          <div role="tabpanel" id="settings-study" aria-labelledby="settings-tab-study">
            <Section title={t('study.settings')}>
              <StudySettingsSection />
            </Section>
            <Section title={t('settings.moodle')}>
              <MoodleSection />
            </Section>
            <Section title={t('ecampus.title')}>
              <EcampusSection />
            </Section>
          </div>
        )}
        {tab === 'checks' && (
          <div role="tabpanel" id="settings-checks" aria-labelledby="settings-tab-checks">
            <Section title={t('notify.title')}>
              <NotificationSettingsSection />
            </Section>
          </div>
        )}
        {tab === 'ai' && (
          <div role="tabpanel" id="settings-ai" aria-labelledby="settings-tab-ai">
            <Section title={t('settings.ai')}>
              <AiSettingsSection />
            </Section>
            <Section title={t('ai.prompt.title')}>
              <PromptEditor />
            </Section>
            <Section title={t('settings.mcp')}>
              <McpSection />
            </Section>
            <Section title={t('transcribe.title')}>
              <TranscriptionSettingsSection />
            </Section>
          </div>
        )}
        {tab === 'vault' && (
          <div role="tabpanel" id="settings-vault" aria-labelledby="settings-tab-vault">
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
        )}
      </div>
    </>
  )
}
