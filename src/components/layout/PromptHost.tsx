import { useState } from 'react'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import { Button, Dialog, Field, TextInput } from '@/components/ui'

/** Renders the dialog requested via useApp().ask(). */
export function PromptHost() {
  const prompt = useApp((s) => s.prompt)
  if (!prompt) return null
  return <PromptDialog key={prompt.title + (prompt.initial ?? '')} />
}

function PromptDialog() {
  const prompt = useApp((s) => s.prompt)!
  const [value, setValue] = useState(prompt.initial ?? '')
  const submit = () => prompt.resolve(prompt.confirm ? 'ok' : value)
  return (
    <Dialog
      open
      size="sm"
      title={prompt.title}
      closeLabel={t('common.close')}
      onClose={() => prompt.resolve(null)}
      footer={
        <>
          <Button variant="ghost" onClick={() => prompt.resolve(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            variant={prompt.danger ? 'danger' : 'primary'}
            onClick={submit}
            disabled={!prompt.confirm && !value.trim()}
            data-autofocus={prompt.confirm ? true : undefined}
          >
            {prompt.confirmLabel}
          </Button>
        </>
      }
    >
      {prompt.confirm ? (
        <p className="text-sm text-ink-2">{prompt.label}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (value.trim()) submit()
          }}
        >
          <Field label={prompt.label ?? prompt.title}>
            <TextInput
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </Field>
        </form>
      )}
    </Dialog>
  )
}
