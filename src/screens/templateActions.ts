import { t } from '@/i18n'
import type { DatabaseDef } from '@/lib/database'
import { applyPageTemplate } from '@/lib/templates'
import type { Page, Workspace } from '@/lib/workspace'

export const BLANK_DATABASE: DatabaseDef = {
  properties: [
    {
      name: 'Status',
      type: 'select',
      options: [
        { value: 'Offen', color: 'gray' },
        { value: 'In Arbeit', color: 'blue' },
        { value: 'Erledigt', color: 'green' },
      ],
    },
    { name: 'Datum', type: 'date' },
  ],
  views: [
    { name: 'Tabelle', type: 'table' },
    { name: 'Board', type: 'board', groupBy: 'Status' },
  ],
}

/** Pages marked with `template: true`, anywhere in the vault. */
export function pageTemplates(ws: Workspace): Page[] {
  return ws
    .all()
    .filter((p) => p.data.template === true)
    .sort((a, b) => a.title.localeCompare(b.title, 'de'))
}

export async function createFromTemplate(
  ws: Workspace,
  template: Page,
  folder: string,
  title: string,
): Promise<string> {
  const { data, body } = applyPageTemplate(await ws.vault.read(template.path), { title })
  if (template.icon && !data.icon) data.icon = template.icon
  return ws.createPage({ folder, title, data, body })
}

export function createBlankDatabase(
  ws: Workspace,
  folder: string,
  title = t('db.newDatabase'),
): Promise<string> {
  return ws.createDatabase({ folder, title, def: structuredClone(BLANK_DATABASE), data: { icon: '🗂️' } })
}
