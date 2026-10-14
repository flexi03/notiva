import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { workFolderFor } from '../codeFolders'

describe('code folders', () => {
  it('finds the code folder of the module a lab PDF belongs to', async () => {
    const ws = await Workspace.open(new MemoryVault())
    await ws.createPage({ folder: 'Studium/Module', title: 'Datenbanksysteme 2' })
    await ws.createPage({
      folder: 'Studium/Module/Datenbanksysteme 2',
      title: 'Praktikum',
      data: { code: true },
    })
    await ws.createPage({
      folder: 'Studium/Kurse',
      title: 'DBS2',
      data: { Ordner: 'Studium/Unterlagen/DBS2', Modul: ['[[Datenbanksysteme 2]]'] },
    })
    expect(workFolderFor(ws, 'Studium/Unterlagen/DBS2/Praktikum & Übung/P01.pdf').folder).toBe(
      'Studium/Module/Datenbanksysteme 2/Praktikum',
    )
    expect(workFolderFor(ws, 'Skripte/Graphen.pdf')).toEqual({ folder: 'Skripte' })
  })
})
