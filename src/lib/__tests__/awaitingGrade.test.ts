import { MemoryVault } from '../vault'
import { Workspace } from '../workspace'
import { awaitingGrade } from '../study/sync'

const exam = (date: string, note = '') =>
  `---\nDatum: ${date}\nModul:\n  - "[[Mathematik 3]]"\nArt: Klausur\n${note ? `Note: ${note}\n` : ''}---\n`

async function vault(files: Record<string, string>) {
  return Workspace.open(
    new MemoryVault('Test', {
      'Studium/Prüfungen.md': '---\ndatabase:\n  properties:\n    - { name: Datum, type: date }\n---\n',
      'Studium/Module/Mathematik 3.md': '---\nStatus: Prüfung angemeldet\n---\n',
      ...files,
    }),
  )
}

describe('awaitingGrade', () => {
  const M = 'Studium/Module/Mathematik 3.md'

  it('an exam in the past without a grade → written, waiting for the result', async () => {
    const ws = await vault({ 'Studium/Prüfungen/Klausur Mathematik 3.md': exam('2026-07-29') })
    expect(awaitingGrade(ws, 'Studium', M, undefined, '2026-10-17')).toBe(true)
  })

  it('not before the exam, not with a grade, not when eCampus already has a newer result', async () => {
    const future = await vault({ 'Studium/Prüfungen/K.md': exam('2026-11-02') })
    expect(awaitingGrade(future, 'Studium', M, undefined, '2026-10-17')).toBe(false)
    const graded = await vault({ 'Studium/Prüfungen/K.md': exam('2026-07-29', '2.0') })
    expect(awaitingGrade(graded, 'Studium', M, undefined, '2026-10-17')).toBe(false)
    const known = await vault({ 'Studium/Prüfungen/K.md': exam('2026-07-29') })
    expect(awaitingGrade(known, 'Studium', M, '2026-07-29', '2026-10-17')).toBe(false)
  })
})
