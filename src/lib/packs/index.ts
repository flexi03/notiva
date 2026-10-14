import { expandPack, type TemplatePack, type TemplateVars } from '../templates'
import type { Workspace } from '../workspace'
import { journalPack, projectPack, readingPack } from './simple'
import { studyPack } from './study'

export const TEMPLATE_PACKS: TemplatePack[] = [studyPack, projectPack, journalPack, readingPack]

export function findPack(id: string): TemplatePack | undefined {
  return TEMPLATE_PACKS.find((p) => p.id === id)
}

/** Installs a pack below `folder` and returns the path of its entry page. */
export async function installPack(
  ws: Workspace,
  pack: TemplatePack,
  vars: TemplateVars = {},
  folder = '',
  now = new Date(),
): Promise<string> {
  const { files, entry } = expandPack(pack, folder, vars, now)
  await ws.createFiles(files)
  return entry
}

export { studyPack }
