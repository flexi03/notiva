import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { activeModules, annotatedPdfs, moduleColor, nextOccurrence } from '../semesterView'
import { installPack, studyPack } from '../packs'

describe('Mein Semester', () => {
  it('shows each attended module with next session, exam, tasks, newest script and own notes', async () => {
    const now = new Date(2026, 9, 15, 10, 0) // Thursday
    const ws = await Workspace.open(new MemoryVault())
    await installPack(ws, studyPack, {}, '', now)
    const db = await ws.createRow('Studium/Module.md', 'Datenbanksysteme 2', {
      Belegung: ['Vorlesung', 'Praktikum'],
      Note: 2.3,
    })
    await ws.createRow('Studium/Module.md', 'Mathe 9', { Belegung: [] })
    const dir = 'Studium/Unterlagen/Datenbanksysteme 2'
    await ws.writeFile(`${dir}/Vorlesung/DBS2-01.pdf`, new Uint8Array([1]))
    await ws.writeFile(`${dir}/Vorlesung/DBS2-02.pdf`, new Uint8Array([1]))
    await ws.writeFile(`${dir}/Praktikum & Übung/P01.pdf`, new Uint8Array([1]))
    await ws.createPage({
      folder: `${dir}/Vorlesung`,
      title: 'DBS2-01 (Notizen)',
      data: { pdf: 'DBS2-01.pdf' },
    })
    const link = ['[[Datenbanksysteme 2]]']
    await ws.createRow('Studium/Prüfungen.md', 'Klausur DBS2', { Modul: link, Datum: '2026-11-23' })
    await ws.createRow('Studium/Prüfungen.md', 'Alte Klausur', { Modul: link, Datum: '2026-02-01' })
    await ws.createRow('Studium/Aufgaben.md', 'Blatt 3', {
      Modul: link,
      Status: 'Offen',
      Fällig: '2026-10-20',
    })
    await ws.createRow('Studium/Aufgaben.md', 'Blatt 2', { Modul: link, Status: 'Erledigt' })
    await ws.reload()
    const timetable = [
      {
        path: 'x.md',
        title: 'DBS2 – Vorlesung',
        module: 'Datenbanksysteme 2',
        day: 'Di',
        start: '12:00',
        end: '13:30',
        type: 'Vorlesung',
      },
      {
        path: 'y.md',
        title: 'DBS2 – Praktikum',
        module: 'Datenbanksysteme 2',
        day: 'Fr',
        start: '08:15',
        type: 'Praktikum',
      },
    ]
    const list = activeModules(ws, 'Studium', 'Studium/Unterlagen', timetable, now)
    expect(list.map((m) => m.module.path)).toContain(db)
    expect(list.map((m) => m.module.path)).not.toContain('Studium/Module/Mathe 9.md')
    const m = list.find((x) => x.module.path === db)!
    // Vorlesung: two PDFs and the notes page next to them.
    expect(m.counts['Praktikum & Übung']).toBe(1)
    expect(m.latestLecture).toBe(`${dir}/Vorlesung/DBS2-02.pdf`)
    // Friday's lab comes before next Tuesday's lecture.
    expect(m.nextSession).toMatchObject({ type: 'Praktikum', day: 'Fr', start: '08:15' })
    expect(m.nextExam?.date).toBe('2026-11-23')
    expect(m.openTasks.map((t) => t.title)).toEqual(['Blatt 3'])
    expect(m.annotated.map((a) => a.pdf)).toEqual([`${dir}/Vorlesung/DBS2-01.pdf`])
    expect(annotatedPdfs(ws)).toHaveLength(1)
    // The module with the soonest session comes first.
    expect(list[0]!.module.path).toBe(db)
  })

  it('gives each module a stable colour unless it has its own', () => {
    const page = (data: Record<string, unknown>) =>
      ({ title: 'X', data }) as unknown as Parameters<typeof moduleColor>[0]
    expect(moduleColor(page({ Nr: 'BMI 02' }))).toBe(moduleColor(page({ Nr: 'BMI 02' })))
    expect(moduleColor(page({ Nr: 'BMI 02', Farbe: 'pink' }))).toBe('pink')
  })

  it('finds the next start of a weekly session', () => {
    const now = new Date(2026, 9, 15, 10, 0) // Thursday 10:00
    expect(nextOccurrence({ day: 'Do', start: '09:00' }, now)?.getDate()).toBe(22)
    expect(nextOccurrence({ day: 'Do', start: '11:00' }, now)?.getDate()).toBe(15)
    expect(nextOccurrence({ day: 'Mo', start: '08:00' }, now)?.getDate()).toBe(19)
  })
})

describe('script for a session', () => {
  it('prefers the file named after the date, else a new one', async () => {
    const { scriptFor } = await import('../semesterView')
    const ws = await Workspace.open(new MemoryVault())
    const dir = 'U/BWL/Vorlesung'
    await ws.writeFile(`${dir}/07.10.2026 0810_Vorlesung_Lemm.pdf`, new Uint8Array([1]))
    await ws.writeFile(`${dir}/Kapitel 3.pdf`, new Uint8Array([1]))
    await ws.reload()
    const now = new Date(2026, 9, 15)
    expect(scriptFor(ws, 'U', 'BWL', new Date(2026, 9, 7), now)).toBe(
      `${dir}/07.10.2026 0810_Vorlesung_Lemm.pdf`,
    )
    // No file for that date: the newest one of the last days.
    expect(scriptFor(ws, 'U', 'BWL', new Date(2026, 9, 14), now)).toMatch(/\.pdf$/)
    expect(scriptFor(ws, 'U', 'Mathe', new Date(2026, 9, 14), now)).toBeUndefined()
  })
})

describe('module colours', () => {
  it('gives attended modules distinct colours and keeps an own one', async () => {
    const { moduleColors } = await import('../semesterView')
    const page = (path: string, data: Record<string, unknown>) =>
      ({ path, title: path, data }) as unknown as Parameters<typeof moduleColors>[0][number]
    const list = Array.from({ length: 7 }, (_, i) => page(`m${i}`, { Nr: `BMI ${i}` }))
    const colors = moduleColors([...list, page('own', { Farbe: 'blue' })])
    expect(colors.get('own')).toBe('blue')
    expect(new Set([...colors.entries()].filter(([k]) => k !== 'own').map(([, c]) => c)).size).toBe(7)
  })
})
