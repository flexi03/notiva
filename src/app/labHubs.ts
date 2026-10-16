import { ignoreInVault } from '@/app/repoPage'
import { labTasksOf, linksTo } from '@/app/labLinks'
import { t } from '@/i18n'
import type { Page, Workspace } from '@/lib/workspace'

/**
 * One page per lab session inside the lab folder: "Praktikum DBS 2/P01.md" (its folder holds the
 * repositories and own files of P01). It links everything of that session: the lab date and the
 * preparation (tasks), the sheets, the repositories, the Moodle links.
 */
export const hubName = (n: number) => `P${String(n).padStart(2, '0')}`
export const hubPath = (lab: string, n: number) => `${lab}/${hubName(n)}.md`

/** The hub pages of a lab folder, by number. */
export function hubsOf(ws: Workspace, lab: string): Map<number, Page> {
  const out = new Map<number, Page>()
  for (const p of ws.all())
    if (
      p.path.startsWith(`${lab}/`) &&
      typeof p.data.praktikum === 'number' &&
      !p.path.slice(lab.length + 1).includes('/')
    )
      out.set(p.data.praktikum, p)
  return out
}

/** The number of a lab task ("Datenbanksysteme 2 – P03 Vorbereitung" → 3). */
export const taskNumber = (task: Page) => {
  const m = /– P(\d{2}) /.exec(task.title)
  return m ? Number(m[1]) : null
}

export { linkTaskToHub }

export async function ensureHub(ws: Workspace, lab: string, n: number): Promise<string> {
  const path = hubPath(lab, n)
  if (ws.get(path)) return path
  return ws.createChild(`${lab}.md`, hubName(n), { icon: '🧪', praktikum: n }, '')
}

/** Lab tasks link their hub ("Praktikum: [[P01]]") – replaces a link to the whole lab folder. */
async function linkTaskToHub(ws: Workspace, task: Page, hub: string): Promise<boolean> {
  const fresh = ws.get(task.path) ?? task
  if (linksTo(ws, fresh, hub)) return false
  const labLine = new RegExp(`^${t('lab.labLink')} \\[\\[[^\\]]*\\]\\]\\s*$`, 'gm')
  const kept = fresh.body
    .replace(labLine, '')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd()
  const lines = [...new Set(kept.split('\n'))].join('\n') // older versions doubled lines
  await ws.save(task.path, {
    body: `${lines}${lines ? '\n\n' : ''}${t('lab.labLink')} [[${ws.linkText(hub)}]]\n`,
  })
  return true
}

export interface StructurePlan {
  /** numbers that get a hub page */
  hubs: number[]
  /** repositories (folder in the lab) → hub number */
  repos: Array<{ name: string; n: number }>
  /** lab tasks to link with their hub */
  tasks: Array<{ task: Page; n: number }>
}

/**
 * "Nach Praktika ordnen": hubs for every planned lab number, repositories with a number (name or
 * title "Praktikum 1") into theirs, the tasks linked to them. Nothing happens without confirming.
 */
export function planStructure(
  ws: Workspace,
  lab: string,
  modulePath: string,
  repos: Array<{ name: string; n: number | null }>,
): StructurePlan {
  const hubs = hubsOf(ws, lab)
  const tasks = labTasksOf(ws, modulePath)
    .map((task) => ({ task, n: taskNumber(task) }))
    .filter((x): x is { task: Page; n: number } => x.n !== null)
  const numbers = [...new Set([...tasks.map((x) => x.n), ...repos.flatMap((r) => (r.n ? [r.n] : []))])].sort(
    (a, b) => a - b,
  )
  return {
    hubs: numbers.filter((n) => !hubs.has(n)),
    repos: repos.flatMap((r) => (r.n ? [{ name: r.name, n: r.n }] : [])),
    tasks: tasks.filter((x) => !linksTo(ws, x.task, hubPath(lab, x.n))),
  }
}

export async function applyStructure(ws: Workspace, lab: string, plan: StructurePlan): Promise<number> {
  let changes = 0
  for (const n of plan.hubs) {
    await ensureHub(ws, lab, n)
    changes++
  }
  for (const r of plan.repos) await moveRepoToHub(ws, lab, r.name, r.n).then(() => changes++)
  await ws.reload()
  for (const x of plan.tasks) if (await linkTaskToHub(ws, x.task, hubPath(lab, x.n))) changes++
  return changes
}

/** A repository (folder with its own .git) and its page into the hub's folder. */
export async function moveRepoToHub(ws: Workspace, lab: string, name: string, n: number): Promise<string> {
  await ensureHub(ws, lab, n)
  const from = `${lab}/${name}`
  const to = `${lab}/${hubName(n)}/${name}`
  if (from === to) return to
  await ws.vault.rename(from, to)
  if (ws.has(`${from}.md`) && !ws.has(`${to}.md`)) await ws.vault.rename(`${from}.md`, `${to}.md`)
  await ws.reload()
  // Ignored by the folder's Git at its new place.
  await ignoreInVault(ws, to)
  return to
}
