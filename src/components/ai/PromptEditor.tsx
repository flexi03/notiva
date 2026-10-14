import { useState } from 'react'
import { useAssistant } from '@/app/assistant'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { DEFAULT_PROMPT } from '@/lib/ai'
import { Button, Dialog, Field, Segmented } from '@/components/ui'

const PRE =
  'max-h-72 overflow-auto rounded-control border border-line bg-sunken p-3 font-code text-[12.5px] leading-relaxed whitespace-pre-wrap'

/**
 * Shows and edits the prompt: the built-in default (fixed, always restorable) or an own text with
 * variables – plus the prompt exactly as it would be sent right now.
 */
export function PromptEditor({ onSaved }: { onSaved?: () => void }) {
  const { settings, saveSettings, currentPrompt } = useAssistant()
  const showToast = useApp((s) => s.showToast)
  const [kind, setKind] = useState<'standard' | 'custom'>(settings.prompt.trim() ? 'custom' : 'standard')
  const [text, setText] = useState(settings.prompt.trim() ? settings.prompt : DEFAULT_PROMPT)
  const draft = { ...settings, prompt: kind === 'custom' ? text : '' }
  const changed = draft.prompt !== settings.prompt

  return (
    <div className="space-y-4">
      <Segmented
        label={t('ai.prompt.kind')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'standard', label: t('ai.prompt.standard') },
          { value: 'custom', label: t('ai.prompt.custom') },
        ]}
      />
      {kind === 'standard' ? (
        <div className="space-y-2">
          <p className="text-[13px] text-ink-3">{t('ai.prompt.standardHint')}</p>
          <pre className={PRE} aria-label={t('ai.prompt.standard')} tabIndex={0}>
            {DEFAULT_PROMPT}
          </pre>
        </div>
      ) : (
        <Field label={t('ai.prompt.template')} hint={t('ai.prompt.templateHint')}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            spellCheck={false}
            className="w-full rounded-control border border-line bg-surface p-2.5 font-code text-[12.5px] leading-relaxed focus:border-accent focus:outline-none"
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          disabled={!changed}
          onClick={() => {
            saveSettings(draft)
            showToast(t('ai.prompt.saved'))
            onSaved?.()
          }}
        >
          {t('ai.prompt.save')}
        </Button>
        {kind === 'custom' && text !== DEFAULT_PROMPT && (
          <Button variant="ghost" onClick={() => setText(DEFAULT_PROMPT)}>
            {t('ai.prompt.copyStandard')}
          </Button>
        )}
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-semibold">{t('ai.prompt.current')}</p>
        <pre className={PRE} data-testid="prompt-preview" tabIndex={0}>
          {currentPrompt(draft)}
        </pre>
      </div>
    </div>
  )
}

export function PromptDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('ai.prompt.title')}
      size="lg"
      closeLabel={t('common.close')}
    >
      {open && <PromptEditor onSaved={onClose} />}
    </Dialog>
  )
}
