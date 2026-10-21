import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { materialsFor, workFolderFor } from '../codeFolders'
import { installPack, studyPack } from '../packs'

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

  it('finds it for materials in "Unterlagen/<Modul>" and offers the file\'s folder as a second one', async () => {
    const ws = await Workspace.open(new MemoryVault())
    await installPack(ws, studyPack, {}, '', new Date(2026, 9, 15))
    const module = await ws.createRow('Studium/Module.md', 'Datenbanksysteme 2', {})
    await ws.createPage({ folder: module.slice(0, -3), title: 'Praktikum DBS 2', data: { code: true } })
    const lab = 'Studium/Unterlagen/Datenbanksysteme 2/Praktikum & Übung'
    expect(workFolderFor(ws, `${lab}/P02.pdf`)).toMatchObject({
      folder: 'Studium/Module/Datenbanksysteme 2/Praktikum DBS 2',
      fileFolder: lab,
    })
    // …and from the code folder back to the lab materials.
    expect(materialsFor(ws, ws.get('Studium/Module/Datenbanksysteme 2/Praktikum DBS 2.md')!)).toBeUndefined()
    await ws.writeFile(`${lab}/P02.sql`, 'select 1;')
    expect(materialsFor(ws, ws.get('Studium/Module/Datenbanksysteme 2/Praktikum DBS 2.md')!)).toBe(lab)
    // Inside the code folder: only that one.
    expect(
      workFolderFor(ws, 'Studium/Module/Datenbanksysteme 2/Praktikum DBS 2/P01/a.sql').fileFolder,
    ).toBeUndefined()
    // Another module's folder without code: the file's folder.
    expect(workFolderFor(ws, 'Studium/Unterlagen/Mathe 9/Blatt 1.pdf')).toEqual({
      folder: 'Studium/Unterlagen/Mathe 9',
    })
  })
})
