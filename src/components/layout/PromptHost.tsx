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
  const [value, setValue] = useState(prompt.initial ?? prompt.choices?.[0]?.value ?? '')
  const [ticked, setTicked] = useState(
    () => new Set((prompt.checklist ?? []).filter((c) => c.checked).map((c) => c.value)),
  )
  const submit = () =>
    prompt.resolve(prompt.checklist ? JSON.stringify([...ticked]) : prompt.confirm ? 'ok' : value)
  return (
    <Dialog
      open
      size={prompt.checklist ? 'md' : 'sm'}
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
            disabled={prompt.checklist ? ticked.size === 0 : !prompt.confirm && !value.trim()}
            data-autofocus={prompt.confirm ? true : undefined}
          >
            {prompt.confirmLabel}
          </Button>
        </>
      }
    >
      {prompt.checklist ? (
        <div className="space-y-1">
          {prompt.label && <p className="mb-2 text-sm text-ink-2">{prompt.label}</p>}
          <ul className="max-h-[50vh] space-y-0.5 overflow-y-auto">
            {prompt.checklist.map((c) => (
              <li key={c.value}>
                <label className="flex items-start gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-hover">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={ticked.has(c.value)}
                    onChange={(e) =>
                      setTicked((s) => {
                        const next = new Set(s)
                        if (e.target.checked) next.add(c.value)
                        else next.delete(c.value)
                        return next
                      })
                    }
                  />
                  <span>
                    {c.label}
                    {c.detail && <span className="block text-[12.5px] text-ink-3">{c.detail}</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : prompt.choices ? (
        <div role="radiogroup" aria-label={prompt.label ?? prompt.title} className="space-y-1">
          {prompt.label && <p className="mb-2 text-sm text-ink-2">{prompt.label}</p>}
          {prompt.choices.map((c) => (
            <label
              key={c.value}
              className="flex items-center gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-hover"
            >
              <input
                type="radio"
                name="prompt-choice"
                checked={value === c.value}
                onChange={() => setValue(c.value)}
              />
              {c.label}
            </label>
          ))}
        </div>
      ) : prompt.confirm ? (
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
              type={prompt.secret ? 'password' : 'text'}
              autoComplete={prompt.secret ? 'off' : undefined}
              onChange={(e) => setValue(e.target.value)}
              onFocus={(e) => e.target.select()}
            />
          </Field>
          {prompt.help && (
            <button
              type="button"
              className="mt-2 text-[13px] font-semibold text-accent hover:underline"
              onClick={prompt.help.run}
            >
              {prompt.help.label}
            </button>
          )}
        </form>
      )}
    </Dialog>
  )
}
