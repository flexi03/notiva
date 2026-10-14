/**
 * Default commit message for the Git panel: a short subject and every change in the body, so the
 * history says what happened even if the user doesn't type anything.
 */
export interface CommitChange {
  path: string
  status: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked'
  from?: string | undefined
  added?: number | undefined
  removed?: number | undefined
}

const name = (path: string) => path.replace(/\.md$/i, '').split('/').pop() ?? path

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/** More files than this per group: list folders with counts instead (e.g. hundreds of PDFs). */
const MAX_LINES = 30

function folders(list: CommitChange[]): string[] {
  const counts = new Map<string, number>()
  for (const c of list) {
    const dir = c.path.includes('/') ? c.path.slice(0, c.path.lastIndexOf('/') + 1) : './'
    counts.set(dir, (counts.get(dir) ?? 0) + 1)
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const lines = sorted.slice(0, MAX_LINES).map(([dir, n]) => `- ${dir} (${plural(n, 'Datei', 'Dateien')})`)
  const rest = sorted.slice(MAX_LINES).reduce((sum, [, n]) => sum + n, 0)
  if (rest) lines.push(`- … ${plural(rest, 'weitere Datei', 'weitere Dateien')}`)
  return lines
}

export function commitMessage(changes: CommitChange[]): string {
  if (changes.length === 0) return ''
  const groups = {
    added: changes.filter((c) => c.status === 'added' || c.status === 'untracked'),
    modified: changes.filter((c) => c.status === 'modified'),
    renamed: changes.filter((c) => c.status === 'renamed'),
    deleted: changes.filter((c) => c.status === 'deleted'),
  }
  let subject: string
  if (changes.length === 1) {
    const c = changes[0]!
    const verb =
      c.status === 'deleted'
        ? 'gelöscht'
        : c.status === 'renamed'
          ? 'umbenannt'
          : c.status === 'modified'
            ? 'geändert'
            : 'neu'
    subject =
      c.status === 'renamed' && c.from ? `${name(c.from)} → ${name(c.path)}` : `${name(c.path)} ${verb}`
  } else {
    const parts = [
      groups.modified.length && plural(groups.modified.length, 'Datei geändert', 'Dateien geändert'),
      groups.added.length && `${groups.added.length} neu`,
      groups.renamed.length && `${groups.renamed.length} umbenannt`,
      groups.deleted.length && `${groups.deleted.length} gelöscht`,
    ].filter(Boolean)
    const names = changes.slice(0, 3).map((c) => name(c.path))
    subject = `${parts.join(', ')}: ${names.join(', ')}${changes.length > 3 ? ' …' : ''}`
  }
  const line = (c: CommitChange) => {
    const stats = [c.added ? `+${c.added}` : '', c.removed ? `−${c.removed}` : ''].filter(Boolean).join(' ')
    const path = c.status === 'renamed' && c.from ? `${c.from} → ${c.path}` : c.path
    return `- ${path}${stats ? ` (${stats})` : ''}`
  }
  const body = (
    [
      ['Geändert', groups.modified],
      ['Neu', groups.added],
      ['Umbenannt', groups.renamed],
      ['Gelöscht', groups.deleted],
    ] as const
  )
    .filter(([, list]) => list.length)
    .map(
      ([title, list]) =>
        `${title}:\n${(list.length > MAX_LINES ? folders(list) : list.map(line)).join('\n')}`,
    )
    .join('\n\n')
  return `${subject}\n\n${body}`
}
