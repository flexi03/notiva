import { applyStructure, hubsOf, planStructure } from '@/app/labHubs'
import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'

const MODULES = '---\ndatabase:\n  properties:\n    - { name: ECTS, type: number }\n---\n'
const TASKS =
  '---\ndatabase:\n  properties:\n    - { name: Modul, type: relation, database: "Studium/Module.md" }\n    - { name: Fällig, type: date }\n    - { name: Art, type: select, options: [Praktikumstermin, Vorbereitung] }\n---\n'
const task = (art: string, due: string) =>
  `---\nModul:\n  - "[[DBS]]"\nFällig: ${due}\nArt: ${art}\n---\nPraktikum: [[Praktikum]]\n`

describe('lab sessions', () => {
  it('plans session pages, links the dates to them', async () => {
    const ws = await Workspace.open(
      new MemoryVault('T', {
        'Studium/Module.md': MODULES,
        'Studium/Module/DBS.md': '# DBS\n',
        'Studium/Module/DBS/Praktikum.md': '---\ncode: true\n---\n',
        'Studium/Aufgaben.md': TASKS,
        'Studium/Aufgaben/DBS – P01 Praktikumstermin.md': task('Praktikumstermin', '2026-10-15T09:00'),
        'Studium/Aufgaben/DBS – P01 Vorbereitung.md': task('Vorbereitung', '2026-10-14'),
        'Studium/Aufgaben/DBS – P02 Praktikumstermin.md': task('Praktikumstermin', '2026-10-29T09:00'),
      }),
    )
    const lab = 'Studium/Module/DBS/Praktikum'
    const plan = planStructure(ws, lab, 'Studium/Module/DBS.md', [])
    expect(plan.hubs).toEqual([1, 2])
    expect(plan.tasks).toHaveLength(3)
    await applyStructure(ws, lab, plan)
    expect([...hubsOf(ws, lab).keys()].sort()).toEqual([1, 2])
    const p01 = ws.get('Studium/Aufgaben/DBS – P01 Vorbereitung.md')!.body
    expect(p01).toContain('Praktikum: [[P01]]')
    expect(p01).not.toContain('[[Praktikum]]')
    // Done: nothing more to organise.
    const again = planStructure(ws, lab, 'Studium/Module/DBS.md', [])
    expect(again.hubs.length + again.tasks.length).toBe(0)
  })
})
