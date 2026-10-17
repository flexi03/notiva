import { useEffect, useState } from 'react'
import { Cpu, Download, Trash2 } from 'lucide-react'
import { downloadLocalModel, localModelChoice, setLocalModelChoice } from '@/app/localModel'
import { withProgress } from '@/app/progress'
import { useAction } from '@/app/store'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { Button, IconButton } from '@/components/ui'

type Status = Awaited<
  ReturnType<NonNullable<NonNullable<ReturnType<typeof electronBridge>>['localModel']>['status']>
>

/**
 * Settings → KI → "Lokales Mini-Modell": llama.cpp plus a small Qwen model for quick summaries
 * (commit messages) – offline, free, nothing leaves the computer.
 */
export function LocalModelSettings() {
  const bridge = electronBridge()?.localModel
  const run = useAction()
  const [status, setStatus] = useState<Status | null>(null)
  const [choice, setChoice] = useState(localModelChoice)
  const refresh = () => void bridge?.status().then(setStatus)
  useEffect(refresh, [bridge])
  if (!bridge) return <p className="text-sm text-ink-3">{t('localModel.desktopOnly')}</p>
  if (!status) return null
  const choose = (id: string) => {
    setLocalModelChoice(id)
    setChoice(id)
  }
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-ink-3">{t('localModel.intro')}</p>
      {!status.server ? (
        <div className="space-y-2 rounded-panel border border-line p-3 text-sm">
          <p>{t('localModel.noServer')}</p>
          <Button
            size="sm"
            icon={<Download size={14} />}
            onClick={() =>
              void run(async () => {
                await withProgress(
                  t('localModel.installing'),
                  async (task) => {
                    const off = bridge.onProgress(
                      (e) => e.kind === 'install' && e.text && task.detail(e.text),
                    )
                    try {
                      await bridge.install()
                    } finally {
                      off()
                    }
                  },
                  { success: () => t('localModel.ready') },
                ).finally(refresh)
              })
            }
          >
            {t('localModel.install')}
          </Button>
          <p className="text-[13px] text-ink-3">
            {t(status.via === 'brew' ? 'localModel.viaBrew' : 'localModel.viaScript')}
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-[13px] text-ink-2">
          <Cpu size={14} className="text-accent" /> {t('localModel.ready')}
        </p>
      )}
      <ul className="divide-y divide-line rounded-panel border border-line">
        <li className="flex items-center gap-2 px-3 py-2 text-sm">
          <label className="flex flex-1 items-center gap-2">
            <input type="radio" name="local-model" checked={choice === ''} onChange={() => choose('')} />
            {t('localModel.offOption')}
          </label>
        </li>
        {status.models.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
            <label className="flex flex-1 items-center gap-2">
              <input
                type="radio"
                name="local-model"
                checked={choice === m.id}
                disabled={!m.downloaded}
                onChange={() => choose(m.id)}
              />
              <span>
                {m.label} <span className="text-ink-3">· {Math.round(m.size / 1e6)} MB</span>
              </span>
            </label>
            {m.downloaded ? (
              <IconButton
                size="sm"
                label={t('localModel.remove')}
                onClick={() =>
                  void run(async () => {
                    await bridge.remove(m.id)
                    if (choice === m.id) choose('')
                    refresh()
                  })
                }
              >
                <Trash2 size={14} />
              </IconButton>
            ) : (
              <Button
                size="sm"
                icon={<Download size={13} />}
                onClick={() =>
                  void run(async () => {
                    await downloadLocalModel(m.id, m.label)
                    choose(m.id)
                    refresh()
                  })
                }
              >
                {t('localModel.download')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
