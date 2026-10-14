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
    .map(([title, list]) => `${title}:\n${list.map(line).join('\n')}`)
    .join('\n\n')
  return `${subject}\n\n${body}`
}
