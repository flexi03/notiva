import { commitMessage } from '../commitMessage'

describe('commitMessage', () => {
  it('names a single change in the subject', () => {
    expect(
      commitMessage([{ path: 'Studium/Module/Analysis.md', status: 'modified', added: 2, removed: 1 }]),
    ).toBe('Analysis geändert\n\nGeändert:\n- Studium/Module/Analysis.md (+2 −1)')
    expect(commitMessage([{ path: 'B.md', from: 'A.md', status: 'renamed' }]).split('\n')[0]).toBe('A → B')
  })

  it('summarizes many changes and lists all of them', () => {
    const message = commitMessage([
      { path: 'Studium.md', status: 'modified', added: 1 },
      { path: 'Studium/Aufgaben/Blatt 5.md', status: 'untracked', added: 6 },
      { path: 'Alt.md', status: 'deleted', removed: 3 },
      { path: 'Studium/Module/LA.md', status: 'modified', removed: 1 },
    ])
    expect(message.split('\n')[0]).toBe('2 Dateien geändert, 1 neu, 1 gelöscht: Studium, Blatt 5, Alt …')
    expect(message).toContain('Geändert:\n- Studium.md (+1)\n- Studium/Module/LA.md (−1)')
    expect(message).toContain('Neu:\n- Studium/Aufgaben/Blatt 5.md (+6)')
    expect(message).toContain('Gelöscht:\n- Alt.md (−3)')
    expect(commitMessage([])).toBe('')
  })
})

describe('many files', () => {
  it('lists folders with counts instead of hundreds of lines', () => {
    const files = Array.from({ length: 700 }, (_, i) => ({
      path: `Studium/Unterlagen/Kurs ${i % 40}/skript${i}.pdf`,
      status: 'untracked' as const,
    }))
    const message = commitMessage(files)
    expect(message.length).toBeLessThan(3000)
    expect(message).toContain('Studium/Unterlagen/Kurs 0/ (18 Dateien)')
    expect(message).toContain('weitere Dateien')
  })
})
