import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Download, Trash2 } from 'lucide-react'
import { loadTranscribeSettings, saveTranscribeSettings, sendChunk } from '@/app/lecture/session'
import { ipcMessage } from '@/app/moodle'
import { t } from '@/i18n'
import { encodeWav } from '@/lib/lecture/audio'
import {
  describeTranscribeError,
  TRANSCRIBE_PRESETS,
  type TranscribeSettings,
} from '@/lib/lecture/transcribe'
import { electronBridge, type WhisperStatus } from '@/lib/vault'
import { Button, Field, IconButton, Select, TextInput } from '@/components/ui'
import { Row } from '@/screens/settingsLayout'

/** Settings → Transkription: local Whisper (set up from here) or a speech-to-text API. */
export function TranscriptionSettingsSection() {
  const [form, setForm] = useState<TranscribeSettings>(loadTranscribeSettings)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const preset = TRANSCRIBE_PRESETS.find((p) => p.id === form.preset)
  const set = (patch: Partial<TranscribeSettings>) => {
    const next = { ...form, ...patch }
    setForm(next)
    saveTranscribeSettings(next)
    setStatus(null)
  }

  const test = async () => {
    setTesting(true)
    setStatus(null)
    // One second of silence: proves address, key and model without sending real audio.
    const response = await sendChunk(form, encodeWav(new Float32Array(16000)), '')
    setTesting(false)
    setStatus(
      response.status === 200
        ? { ok: true, text: t('transcribe.testOk') }
        : { ok: false, text: describeTranscribeError(response.status, response.body, form) },
    )
  }

  return (
    <>
      <p className="text-[13px] text-ink-3">{t('transcribe.intro')}</p>
      <Row label={t('transcribe.provider')} {...(preset ? { hint: preset.hint } : {})}>
        <Select
          aria-label={t('transcribe.provider')}
          value={form.preset}
          onChange={(e) => {
            const p = TRANSCRIBE_PRESETS.find((x) => x.id === e.target.value)!
            set({ preset: p.id, baseUrl: p.baseUrl || form.baseUrl, model: p.model, diarize: p.diarize })
          }}
        >
          {TRANSCRIBE_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Row>
      {form.preset === 'local' ? (
        <LocalWhisper model={form.model} onModel={(model) => set({ model })} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('transcribe.url')}>
            <TextInput
              value={form.baseUrl}
              onChange={(e) => set({ baseUrl: e.target.value })}
              spellCheck={false}
            />
          </Field>
          <Field label={t('transcribe.model')}>
            <TextInput
              value={form.model}
              onChange={(e) => set({ model: e.target.value })}
              spellCheck={false}
            />
          </Field>
          {preset?.needsKey !== false && (
            <Field label={t('transcribe.key')} hint={t('transcribe.keyHint')} className="sm:col-span-2">
              <TextInput
                type="password"
                value={form.apiKey}
                onChange={(e) => set({ apiKey: e.target.value })}
                autoComplete="off"
              />
            </Field>
          )}
        </div>
      )}
      <Row label={t('transcribe.language')}>
        <Select
          aria-label={t('transcribe.language')}
          value={form.language}
          onChange={(e) => set({ language: e.target.value })}
        >
          <option value="de">Deutsch</option>
          <option value="en">English</option>
          <option value="">{t('transcribe.auto')}</option>
        </Select>
      </Row>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => void test()} disabled={testing}>
          {testing ? t('transcribe.testing') : t('transcribe.test')}
        </Button>
        {status && (
          <p
            role={status.ok ? 'status' : 'alert'}
            className={status.ok ? 'text-sm text-accent' : 'text-sm text-danger'}
          >
            {status.text}
          </p>
        )}
      </div>
      {!form.diarize && <p className="text-[13px] text-ink-3">{t('transcribe.speakersHint')}</p>}
    </>
  )
}

/** whisper.cpp: install with Homebrew, download a model – with progress. */
function LocalWhisper({ model, onModel }: { model: string; onModel: (model: string) => void }) {
  const bridge = electronBridge()?.whisper
  const [status, setStatus] = useState<WhisperStatus | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ text?: string; done?: number; total?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const refresh = useCallback(() => void bridge?.status().then(setStatus), [bridge])

  useEffect(() => {
    refresh()
    return bridge?.onProgress((event) => setProgress(event))
  }, [bridge, refresh])

  if (!bridge) return <p className="text-sm text-ink-3">{t('transcribe.localDesktopOnly')}</p>
  if (!status) return null

  const run = async (what: string, task: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    setProgress(null)
    try {
      await task()
    } catch (e) {
      setError(ipcMessage(e))
    } finally {
      setBusy(null)
      setProgress(null)
      refresh()
    }
  }
  const current = status.models.find((m) => m.id === model) ?? status.models[0]!

  return (
    <div className="space-y-3 rounded-panel border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">{t('transcribe.step1')}</span>
        {status.server ? (
          <span className="flex items-center gap-1 text-sm text-accent">
            <CheckCircle2 size={15} /> {t('transcribe.installed')}
          </span>
        ) : status.brew ? (
          <Button
            size="sm"
            variant="primary"
            disabled={!!busy}
            onClick={() => void run('install', () => bridge.install())}
          >
            {busy === 'install' ? t('transcribe.installing') : t('transcribe.install')}
          </Button>
        ) : (
          <span className="text-sm text-ink-3">{t('transcribe.noBrew')}</span>
        )}
      </div>
      <div className="space-y-1.5">
        <span className="font-semibold">{t('transcribe.step2')}</span>
        <ul className="space-y-1">
          {status.models.map((m) => (
            <li key={m.id} className="flex items-center gap-2 text-sm">
              <label className="flex flex-1 cursor-pointer items-center gap-2">
                <input
                  type="radio"
                  name="whisper-model"
                  checked={current.id === m.id}
                  onChange={() => onModel(m.id)}
                  className="accent-[var(--accent)]"
                />
                {m.label}
              </label>
              {m.downloaded ? (
                <>
                  <span className="text-[12.5px] text-accent">{t('transcribe.ready')}</span>
                  <IconButton
                    size="sm"
                    label={t('transcribe.removeModel', { name: m.label })}
                    disabled={!!busy}
                    onClick={() => void run(`rm-${m.id}`, () => bridge.remove(m.id))}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </>
              ) : (
                <Button
                  size="sm"
                  icon={<Download size={13} />}
                  disabled={!!busy}
                  onClick={() => void run(`dl-${m.id}`, () => bridge.download(m.id))}
                >
                  {busy === `dl-${m.id}` && progress?.total
                    ? `${Math.round(((progress.done ?? 0) / progress.total) * 100)} %`
                    : t('transcribe.download')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {busy === 'install' && progress?.text && (
        <p className="truncate font-code text-[12px] text-ink-3" aria-live="polite">
          {progress.text}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-[12.5px] text-ink-3">{t('transcribe.localHint')}</p>
    </div>
  )
}
