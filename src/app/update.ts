import { useEffect } from 'react'
import { announce, withProgress } from '@/app/progress'
import { useApp } from '@/app/store'
import { t } from '@/i18n'
import type { UpdateStatus } from '@/lib/update'
import { electronBridge } from '@/lib/vault'

/**
 * Downloads and installs the update – or `version` from the versions list – with progress; the
 * app restarts by itself.
 */
export function installUpdate(latest: string, version?: string): Promise<void> {
  const bridge = electronBridge()?.update
  if (!bridge) return Promise.resolve()
  return withProgress(t('update.installing', { version: latest }), async (task) => {
    const off = bridge.onStatus((s) => {
      if (s.state === 'downloading')
        task.update(s.done, s.total, `${Math.round(s.done / 1e6)} / ${Math.round(s.total / 1e6)} MB`)
      else if (s.state === 'ready') task.detail(t('update.restarting'))
    })
    try {
      // Nothing unsaved gets lost: the app quits right after the download.
      await useApp.getState().ws?.saveAll()
      await bridge.install(version)
    } finally {
      off()
    }
  })
}

function offer(s: Extract<UpdateStatus, { state: 'available' }>): void {
  announce(t('update.available', { version: s.latest }), {
    state: 'info',
    sticky: true,
    key: 'update',
    note: t('update.current', { version: s.version }),
    action: { label: t('update.install'), run: () => void installUpdate(s.latest).catch(() => undefined) },
  })
}

/** Menu "Nach Updates suchen …": result also when nothing is new. */
export async function checkUpdatesNow(): Promise<void> {
  const bridge = electronBridge()?.update
  if (!bridge) return
  const s = await bridge.check()
  if (s.state === 'available') return offer(s)
  if (s.state === 'error') announce(t('update.failed'), { state: 'info', note: s.message, key: 'update' })
  else announce(t('update.none', { version: s.version }), { key: 'update' })
}

/** Shows a found update bottom left (the main process checks on start and every hour). */
export function useUpdateNotices(): void {
  useEffect(() => {
    const bridge = electronBridge()?.update
    if (!bridge) return
    void bridge.status().then((s) => s.state === 'available' && offer(s))
    return bridge.onStatus((s) => {
      if (s.state === 'available') offer(s)
    })
  }, [])
}
