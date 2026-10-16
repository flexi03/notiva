import { create } from 'zustand'
import { electronBridge } from '@/lib/vault'
import { textHash } from '@/lib/textHash'
import type { Workspace } from '@/lib/workspace'

/**
 * What the server says about a got repository (GitLab snippet: title, description – not in the
 * repository itself). Kept in .notiva/repo-info.json by clone address, shown read-only on the
 * repository's page; the page's own text is the user's notes.
 */
export interface RepoInfo {
  title?: string
  description?: string
  webUrl?: string
  hash?: string
  /** the token lacks read_api */
  scope?: boolean
}

const META = 'repo-info.json'
export const useRepoInfo = create<Record<string, RepoInfo>>(() => ({}))

async function readAll(ws: Workspace): Promise<Record<string, RepoInfo>> {
  return (await ws.readMeta<Record<string, RepoInfo>>(META).catch(() => null)) ?? {}
}

export async function storeRepoInfo(ws: Workspace, url: string, info: RepoInfo): Promise<void> {
  const all = await readAll(ws)
  await ws.writeMeta(META, { ...all, [url]: info })
  useRepoInfo.setState({ [url]: info })
}

/** From the server (null: not a snippet / offline). */
export async function fetchRepoInfo(url: string): Promise<RepoInfo | null> {
  const info = await electronBridge()
    ?.code?.snippetInfo?.(url)
    .catch(() => null)
  if (!info) return null
  if ('error' in info) return { scope: true }
  const description = info.description.trim()
  return { title: info.title, description, webUrl: info.webUrl, hash: textHash(description) }
}

/** The stored info at once; the first time also asked from the server. */
export async function loadRepoInfo(ws: Workspace, url: string): Promise<void> {
  const stored = (await readAll(ws))[url]
  if (stored) return void useRepoInfo.setState({ [url]: stored })
  const fresh = await fetchRepoInfo(url)
  if (fresh) await storeRepoInfo(ws, url, fresh)
}
