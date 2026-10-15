import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { activeModules, annotatedPdfs } from '../semesterView'
import { installPack, studyPack } from '../packs'

describe('Mein Semester', () => {
  it('lists attended modules with their files, new files and annotated PDFs', async () => {
    const ws = await Workspace.open(new MemoryVault())
    await installPack(ws, studyPack, {}, '', new Date(2026, 9, 15))
    const db = await ws.createRow('Studium/Module.md', 'Datenbanksysteme 2', {
      Belegung: ['Vorlesung', 'Praktikum'],
    })
    await ws.createRow('Studium/Module.md', 'Mathe 9', { Belegung: [] })
    await ws.createRow('Studium/Kurse.md', 'DBS2', {
      moodle: 'course:1',
      Ordner: 'Studium/Unterlagen/DBS2',
      Modul: ['[[Datenbanksysteme 2]]'],
    })
    await ws.writeFile('Studium/Unterlagen/DBS2/Vorlesung/vl01.pdf', new Uint8Array([1]))
    await ws.writeFile('Studium/Unterlagen/DBS2/Praktikum & Übung/P01.pdf', new Uint8Array([1]))
    await ws.createPage({
      folder: 'Studium/Unterlagen/DBS2/Vorlesung',
      title: 'vl01 (Notizen)',
      data: { pdf: 'vl01.pdf' },
    })
    await ws.reload()
    const list = activeModules(ws, 'Studium')
    expect(list.map((m) => m.module.path)).toEqual([db])
    const dbs = list[0]!
    expect(dbs.courses[0]!.groups['Vorlesung']).toEqual(['Studium/Unterlagen/DBS2/Vorlesung/vl01.pdf'])
    expect(dbs.courses[0]!.groups['Praktikum & Übung']).toHaveLength(1)
    expect(dbs.recent).toHaveLength(2)
    expect(dbs.annotated.map((a) => a.pdf)).toEqual(['Studium/Unterlagen/DBS2/Vorlesung/vl01.pdf'])
    expect(annotatedPdfs(ws)).toHaveLength(1)
  })
})
