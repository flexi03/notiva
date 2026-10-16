import { create } from 'zustand'
import { announce } from '@/app/progress'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'

export interface TokenStatus {
  host: string
  state: 'ok' | 'invalid' | 'limited' | 'unknown'
  scopes?: string[]
  expiresAt?: string
}

/** Access tokens for Git servers (ProjectBase …) and whether they still work. */
export const useGitTokens = create<{ list: TokenStatus[]; checkedAt: number | null }>(() => ({
  list: [],
  checkedAt: null,
}))

const warned = new Set<string>()

/**
 * Asks each server whether its stored token still works. A revoked/expired one is reported once:
 * a hint with "Neuen Token eintragen" and an entry in the notifications (→ Einstellungen).
 */
export async function checkGitTokens(): Promise<TokenStatus[]> {
  const list =
    (await electronBridge()
      ?.code?.tokenStatus?.()
      .catch(() => null)) ?? []
  useGitTokens.setState({ list, checkedAt: Date.now() })
  for (const s of list) {
    if (s.state !== 'invalid' || warned.has(s.host)) continue
    warned.add(s.host)
    await electronBridge()
      ?.notifications?.add([
        {
          id: `token:${s.host}:${new Date().toISOString().slice(0, 10)}`,
          kind: 'notice',
          title: t('token.invalid', { host: s.host }),
          body: t('token.invalidNote'),
          time: new Date().toISOString(),
          target: { type: 'route', hash: '#/settings/study' },
        },
      ])
      .catch(() => undefined)
    announce(t('token.invalid', { host: s.host }), {
      state: 'info',
      sticky: true,
      key: `token:${s.host}`,
      note: t('token.invalidNote'),
      action: { label: t('token.replace'), run: () => void replaceToken(s.host) },
    })
  }
  return list
}

/** A new token for this server (opens its token page), then checks again. */
export async function replaceToken(host: string): Promise<boolean> {
  const { enterToken } = await import('@/app/clone')
  const saved = await enterToken(`https://${host}/`)
  if (saved) {
    warned.delete(host)
    await checkGitTokens()
  }
  return saved
}

export async function removeToken(host: string): Promise<void> {
  await electronBridge()?.code?.setToken?.(host, null)
  await checkGitTokens()
}

/** The problem with the token of a repository's server, if any. */
export function useTokenProblem(remote: string | undefined): TokenStatus | null {
  const list = useGitTokens((s) => s.list)
  if (!remote || !/^https?:/.test(remote)) return null
  const host = new URL(remote).host
  return list.find((s) => s.host === host && (s.state === 'invalid' || s.state === 'limited')) ?? null
}
