import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { describeError, httpClient, testCli, useAssistant } from '@/app/assistant'
import { useApp, useWorkspace } from '@/app/store'
import { t } from '@/i18n'
import { AI_PRESETS, createProvider, type AiSettings } from '@/lib/ai'
import { electronBridge, type McpLaunch } from '@/lib/vault'
import { Button, cx, Field, IconButton, Segmented, Select, Switch, TextInput } from '@/components/ui'
import { Row } from './settingsLayout'

function presetOf(settings: AiSettings): string {
  return (
    AI_PRESETS.find((p) => p.provider === settings.provider && p.baseUrl === settings.baseUrl)?.id ??
    (settings.provider === 'anthropic' ? 'anthropic' : 'openai')
  )
}

/** Settings → KI: provider, model, key (device-local) and a connection test. */
export function AiSettingsSection() {
  const { settings, saveSettings, clis, loadClis } = useAssistant()
  const desktop = Boolean(electronBridge()?.aiCli)
  useEffect(() => {
    if (desktop) void loadClis()
  }, [desktop, loadClis])
  const showToast = useApp((s) => s.showToast)
  const [form, setForm] = useState<AiSettings>(settings)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const preset = AI_PRESETS.find((p) => p.id === presetOf(form))
  const set = <K extends keyof AiSettings>(key: K, value: AiSettings[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setStatus(null)
  }

  const test = async () => {
    setTesting(true)
    setStatus(null)
    try {
      if (form.backend === 'cli') {
        const reply = await testCli(form)
        setStatus({ ok: true, text: t('settings.ai.testOk', { reply: reply.slice(0, 80) }) })
        return
      }
      const parts = await createProvider(form, httpClient).chat({
        system: 'Antworte nur mit: OK',
        messages: [{ role: 'user', parts: [{ type: 'text', text: 'Test' }] }],
        tools: [],
        signal: AbortSignal.timeout(60_000),
      })
      const reply = parts.find((p) => p.type === 'text')
      setStatus({
        ok: true,
        text: t('settings.ai.testOk', { reply: reply?.type === 'text' ? reply.text.slice(0, 80) : '–' }),
      })
    } catch (error) {
      setStatus({ ok: false, text: describeError(error, form) })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <p className="text-[13px] text-ink-3">{t('settings.ai.intro')}</p>
      <Row label={t('ai.backend')} hint={form.backend === 'cli' ? t('ai.backend.cliHint') : ''}>
        <Segmented
          label={t('ai.backend')}
          value={form.backend}
          onChange={(v) => set('backend', v)}
          options={[
            { value: 'cli', label: t('ai.backend.cli') },
            { value: 'api', label: t('ai.backend.api') },
          ]}
        />
      </Row>
      {form.backend === 'cli' ? (
        !desktop ? (
          <p className="text-sm text-ink-3">{t('ai.cli.desktopOnly')}</p>
        ) : (
          <>
            <fieldset className="space-y-1.5">
              <legend className="mb-1 font-semibold">{t('ai.cli.program')}</legend>
              {(['claude', 'codex', 'antigravity'] as const).map((id) => {
                const info = clis?.find((c) => c.id === id)
                return (
                  <label
                    key={id}
                    className={cx(
                      'flex items-start gap-2.5 rounded-control border border-line px-3 py-2',
                      info ? 'cursor-pointer hover:bg-hover' : 'opacity-60',
                      form.cli === id && 'border-accent',
                    )}
                  >
                    <input
                      type="radio"
                      name="ai-cli"
                      checked={form.cli === id}
                      disabled={!info}
                      onChange={() => set('cli', id)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">
                        {id === 'claude' ? 'Claude Code' : id === 'codex' ? 'Codex CLI' : 'Antigravity (agy)'}
                      </span>
                      <span className="block text-[12.5px] text-ink-3">
                        {info ? `${t('ai.cli.found')} · ${info.version || info.path}` : t('ai.cli.missing')}
                        {id !== 'claude' && info && ` · ${t('ai.cli.limited')}`}
                      </span>
                    </span>
                  </label>
                )
              })}
              {clis && clis.length === 0 && <p className="text-sm text-ink-3">{t('ai.cli.none')}</p>}
            </fieldset>
            <Field label={t('ai.cli.model')} hint={t('ai.cli.modelHint')}>
              <TextInput
                value={form.cliModel}
                onChange={(e) => set('cliModel', e.target.value)}
                spellCheck={false}
                placeholder="opus"
                className="max-w-xs"
              />
            </Field>
            {form.cli === 'claude' && <p className="text-[13px] text-ink-3">{t('ai.cli.claudeTools')}</p>}
          </>
        )
      ) : (
        <>
          <Row label={t('settings.ai.preset')} {...(preset ? { hint: preset.hint } : {})}>
            <Select
              aria-label={t('settings.ai.preset')}
              value={presetOf(form)}
              onChange={(e) => {
                const next = AI_PRESETS.find((p) => p.id === e.target.value)
                if (next)
                  setForm((f) => ({
                    ...f,
                    provider: next.provider,
                    baseUrl: next.baseUrl,
                    model: next.model,
                  }))
                setStatus(null)
              }}
              className="w-56"
            >
              {AI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
          </Row>
          <Field label={t('settings.ai.baseUrl')}>
            <TextInput
              value={form.baseUrl}
              onChange={(e) => set('baseUrl', e.target.value)}
              spellCheck={false}
            />
          </Field>
          <Field label={t('settings.ai.model')}>
            <TextInput
              value={form.model}
              onChange={(e) => set('model', e.target.value)}
              spellCheck={false}
              placeholder={form.provider === 'anthropic' ? 'claude-sonnet-5-5' : 'qwen2.5'}
            />
          </Field>
          {(preset?.needsKey ?? true) || form.apiKey ? (
            <Field label={t('settings.ai.apiKey')}>
              <TextInput
                type="password"
                autoComplete="off"
                value={form.apiKey}
                onChange={(e) => set('apiKey', e.target.value)}
              />
            </Field>
          ) : null}
        </>
      )}
      <Row label={t('settings.ai.allowWrites')} hint={t('settings.ai.allowWritesHint')}>
        <Switch
          label={t('settings.ai.allowWrites')}
          checked={form.allowWrites}
          onChange={(v) => set('allowWrites', v)}
        />
      </Row>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => {
            // The prompt is edited in its own section – keep the saved one.
            saveSettings({ ...form, prompt: useAssistant.getState().settings.prompt })
            showToast(t('settings.ai.saved'))
          }}
        >
          {t('settings.ai.save')}
        </Button>
        <Button onClick={() => void test()} disabled={testing || (form.backend === 'api' && !form.model)}>
          {t('settings.ai.test')}
        </Button>
      </div>
      {status && (
        <p
          role={status.ok ? 'status' : 'alert'}
          className={status.ok ? 'text-sm text-accent' : 'text-sm text-danger'}
        >
          {status.text}
        </p>
      )}
    </>
  )
}

const quote = (s: string) => (/^[\w./:@=-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`)

/** Settings → MCP: ready-to-paste configuration for Claude Code / Claude Desktop. */
export function McpSection() {
  const ws = useWorkspace()
  const showToast = useApp((s) => s.showToast)
  const [launch, setLaunch] = useState<McpLaunch | null>(null)
  const bridge = electronBridge()

  useEffect(() => {
    void bridge?.mcpInfo?.().then(setLaunch, () => setLaunch(null))
  }, [bridge, ws])

  const info: McpLaunch = launch ?? {
    command: 'node',
    args: ['/Pfad/zu/notiva/dist-mcp/notiva-mcp.mjs', `/Pfad/zu/${ws.vault.name}`],
    env: {},
  }
  const env = Object.entries(info.env)
  const claudeCode = [
    'claude mcp add notiva',
    ...env.map(([k, v]) => `-e ${k}=${v}`),
    '--',
    quote(info.command),
    ...info.args.map(quote),
  ].join(' ')
  const desktop = JSON.stringify(
    {
      mcpServers: {
        notiva: { command: info.command, args: info.args, ...(env.length ? { env: info.env } : {}) },
      },
    },
    null,
    2,
  )
  const copy = (text: string) =>
    void navigator.clipboard.writeText(text).then(() => showToast(t('settings.mcp.copied')))

  return (
    <>
      <p className="text-[13px] text-ink-3">{t('settings.mcp.intro')}</p>
      {!launch && <p className="text-[13px] text-ink-3">{t('settings.mcp.browserHint')}</p>}
      {[
        { label: t('settings.mcp.claudeCode'), text: claudeCode },
        { label: t('settings.mcp.claudeDesktop'), text: desktop },
      ].map((snippet) => (
        <div key={snippet.label}>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-semibold">{snippet.label}</p>
            <IconButton
              size="sm"
              label={`${t('settings.mcp.copy')}: ${snippet.label}`}
              onClick={() => copy(snippet.text)}
            >
              <Copy size={13} />
            </IconButton>
          </div>
          <pre className="overflow-x-auto rounded-control border border-line bg-sunken p-2.5 font-code text-[12.5px] leading-relaxed">
            {snippet.text}
          </pre>
        </div>
      ))}
    </>
  )
}
