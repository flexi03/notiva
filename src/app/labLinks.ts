import { t } from '@/i18n'
import { LAB_DATE, LAB_PREP } from '@/lib/labPlan'
import type { Page, Workspace } from '@/lib/workspace'

/**
 * How lab dates, preparations, the lab (code) folder and its repositories hang together: links in
 * the task pages ("Praktikum: [[…]]", "Repository: [[…]]") – so each shows up on the other's page.
 */
export function labTasksOf(ws: Workspace, modulePath: string): Page[] {
  return ws
    .backlinks(modulePath)
    .filter((p) => p.data.Art === LAB_DATE || p.data.Art === LAB_PREP)
    .sort((a, b) => String(a.data.Fällig ?? '').localeCompare(String(b.data.Fällig ?? '')))
}

/** The module a page lies under ("Module/DBS 2/Praktikum/repo.md" → "Module/DBS 2.md"). */
export function moduleOfPath(ws: Workspace, path: string): Page | null {
  const modules = ws.findDatabase('Module', path)
  if (!modules) return null
  const rows = `${ws.rowFolder(modules)}/`
  let dir = path.slice(0, -3)
  while (dir.includes('/')) {
    dir = dir.slice(0, dir.lastIndexOf('/'))
    const page = ws.get(`${dir}.md`)
    if (page && page.path.startsWith(rows)) return page
  }
  return null
}

const links = (ws: Workspace, page: Page) =>
  [...page.body.matchAll(/\[\[([^\]|#]+)/g)].map((m) => ws.resolveLink(m[1]!, page.path)).filter(Boolean)

export const linksTo = (ws: Workspace, page: Page, target: string) => links(ws, page).includes(target)

/** Repositories (pages with `repo:`) a task links to. */
export function reposOf(ws: Workspace, task: Page): Page[] {
  return links(ws, task)
    .map((p) => ws.get(p!))
    .filter((p): p is Page => !!p && typeof p.data.repo === 'string')
}

async function appendLine(ws: Workspace, page: Page, line: string): Promise<void> {
  const fresh = ws.get(page.path) ?? page
  await ws.save(page.path, { body: `${fresh.body.trimEnd()}${fresh.body.trim() ? '\n\n' : ''}${line}\n` })
}

/** The module's lab tasks that don't link the lab folder yet get "Praktikum: [[…]]". */
export async function connectLabTasks(ws: Workspace, modulePath: string, labPage: string): Promise<number> {
  let count = 0
  for (const task of labTasksOf(ws, modulePath)) {
    if (linksTo(ws, task, labPage)) continue
    await appendLine(ws, task, `${t('lab.labLink')} [[${ws.linkText(labPage)}]]`)
    count++
  }
  return count
}

/** "P01" of a repository's name or title ("Praktikum 1 – SQL", "praktikum-1-…", "P03"). */
export function labNumber(text: string): number | null {
  const m = /(?:praktikum|aufgabe|blatt|lab|(?:^|[\s_-])p)[\s_-]*0?(\d{1,2})(?!\d)/i.exec(text)
  return m ? Number(m[1]) : null
}

/** The lab date (and preparation) of the repository's number, if planned. */
export function suggestedTask(ws: Workspace, repo: Page, modulePath: string): Page | null {
  const n = labNumber(`${repo.title} ${repo.path.slice(repo.path.lastIndexOf('/') + 1)}`)
  if (!n) return null
  const tag = `P${String(n).padStart(2, '0')}`
  return (
    labTasksOf(ws, modulePath).find((p) => p.data.Art === LAB_DATE && p.title.includes(` ${tag} `)) ?? null
  )
}

/** Links a repository with a lab date – and the preparation of the same sheet. */
export async function linkRepoToTask(
  ws: Workspace,
  repo: Page,
  task: Page,
  modulePath: string,
): Promise<void> {
  const tag = /– (P\d{2}) /.exec(task.title)?.[1]
  const tasks = [
    task,
    ...labTasksOf(ws, modulePath).filter((p) => p.path !== task.path && tag && p.title.includes(`– ${tag} `)),
  ]
  for (const p of tasks)
    if (!linksTo(ws, p, repo.path))
      await appendLine(ws, p, `${t('lab.repoLink')} [[${ws.linkText(repo.path)}]]`)
  const fresh = ws.get(repo.path) ?? repo
  await ws.save(repo.path, { data: { ...fresh.data, termin: [`[[${ws.linkText(task.path)}]]`] } })
}
