import { create } from 'zustand'
import { electronBridge } from '@/lib/vault'
import type { Workspace } from '@/lib/workspace'

/** Repositories already got into lab folders: folder → [{ name, remote }]. */
export const useClones = create<Record<string, Array<{ name: string; remote: string }>>>(() => ({}))

export async function loadClones(folder: string): Promise<void> {
  const list = await electronBridge()
    ?.code?.clones?.(folder)
    .catch(() => [])
  useClones.setState({ [folder]: list ?? [] })
}

/** The same repository? (".git", trailing "/", "/-/snippets" vs "/snippets", user names ignored) */
export function sameRepo(a: string, b: string): boolean {
  const norm = (u: string) =>
    u
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/[^@/]*@/, 'https://')
      .replace(/\/-\/snippets\//, '/snippets/')
      .replace(/\/+$/, '')
      .replace(/\.git$/, '')
  return norm(a) === norm(b)
}

/** All lab (code) folders below a module page. */
export function labFoldersOf(ws: Workspace, modulePath: string): string[] {
  const base = modulePath.slice(0, -3)
  return ws
    .all()
    .filter((p) => p.data.code === true && p.path.startsWith(`${base}/`))
    .map((p) => p.path.slice(0, -3))
}
