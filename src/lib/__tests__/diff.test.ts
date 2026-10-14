import { blockChanges, diffLines, diffStats, inlineDiff, lineMarkers, pairChanges, toHunks } from '../diff'

const lines = (...l: string[]) => `${l.join('\n')}\n`

describe('diffLines', () => {
  it('finds added, removed and unchanged lines with line numbers', () => {
    const d = diffLines(lines('a', 'b', 'c'), lines('a', 'x', 'c', 'd'))
    expect(d.map((l) => `${l.type}:${l.text}`)).toEqual(['same:a', 'del:b', 'add:x', 'same:c', 'add:d'])
    expect(d[2]).toMatchObject({ newNo: 2 })
    expect(d[1]).toMatchObject({ oldNo: 2 })
    expect(diffStats(d)).toEqual({ added: 2, removed: 1 })
  })

  it('handles empty sides and identical texts', () => {
    expect(diffLines('', lines('a')).map((l) => l.type)).toEqual(['add'])
    expect(diffLines(lines('a'), '').map((l) => l.type)).toEqual(['del'])
    expect(diffLines(lines('a', 'b'), lines('a', 'b')).every((l) => l.type === 'same')).toBe(true)
  })

  it('produces a minimal diff for moved lines', () => {
    const d = diffLines(lines('1', '2', '3', '4', '5'), lines('1', '3', '4', '2', '5'))
    expect(diffStats(d)).toEqual({ added: 1, removed: 1 })
  })

  it('stays fast on large files', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `Zeile ${i}`)
    const changed = big.slice()
    changed[2500] = 'geändert'
    const start = performance.now()
    expect(diffStats(diffLines(big.join('\n'), changed.join('\n')))).toEqual({ added: 1, removed: 1 })
    expect(performance.now() - start).toBeLessThan(500)
  })
})

describe('lineMarkers', () => {
  it('marks added, modified and deleted lines like an editor gutter', () => {
    const m = lineMarkers(lines('a', 'b', 'c', 'd'), lines('a', 'B', 'c', 'neu'))
    expect([...m.changed]).toEqual([
      [1, 'modified'],
      [3, 'modified'],
    ])
    const del = lineMarkers(lines('a', 'b', 'c'), lines('a', 'c'))
    expect([...del.deletedBefore]).toEqual([1])
    const add = lineMarkers(lines('a'), lines('a', 'b', 'c'))
    expect([...add.changed]).toEqual([
      [1, 'added'],
      [2, 'added'],
    ])
  })
})

describe('toHunks', () => {
  it('collapses unchanged lines outside the context', () => {
    const old = Array.from({ length: 20 }, (_, i) => `${i}`)
    const next = old.slice()
    next[10] = 'x'
    const hunks = toHunks(diffLines(old.join('\n'), next.join('\n')), 2)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]!.skippedBefore).toBe(8)
    expect(hunks[0]!.lines.map((l) => l.text)).toEqual(['8', '9', '10', 'x', '11', '12'])
  })
})

describe('blockChanges', () => {
  const head = '---\nStatus: Offen\n---\n# Titel\n\nAbsatz eins\n\n- [ ] a\n- [ ] b\n\nEnde\n'
  const body = (file: string) => file.slice(file.indexOf('---\n', 4) + 4)

  it('maps changed lines onto the blocks and the properties', () => {
    const now = '---\nStatus: Erledigt\n---\n# Titel\n\nAbsatz zwei\n\n- [ ] a\n- [x] b\n- [ ] c\n\nEnde\n'
    const b = body(now)
    const result = blockChanges(lineMarkers(head, now), now, b, [
      '# Titel',
      'Absatz zwei',
      '- [ ] a\n- [x] b\n- [ ] c',
      'Ende',
    ])
    expect(result).toEqual({
      blocks: [undefined, 'modified', 'modified', undefined],
      properties: true,
      deletedAtEnd: false,
    })
  })

  it('marks new blocks, deleted blocks and deletions at the end', () => {
    const now = '---\nStatus: Offen\n---\n# Titel\n\nNeu hier\n\n- [ ] a\n- [ ] b\n'
    const result = blockChanges(lineMarkers(head, now), now, body(now), [
      '# Titel',
      'Neu hier',
      '- [ ] a\n- [ ] b',
    ])
    expect(result.blocks).toEqual([undefined, 'modified', undefined])
    expect(result.properties).toBe(false)
    expect(result.deletedAtEnd).toBe(true)
    const added = blockChanges(lineMarkers('', 'a\n\nb\n'), 'a\n\nb\n', 'a\n\nb\n', ['a', 'b'])
    expect(added.blocks).toEqual(['added', 'added'])
  })
})

describe('inlineDiff', () => {
  it('marks only the changed words', () => {
    const d = inlineDiff('Fällig: 2026-10-19', 'Fällig: 2026-10-01')!
    expect(d.old.filter((s) => s.changed).map((s) => s.text)).toEqual(['19'])
    expect(d.new.filter((s) => s.changed).map((s) => s.text)).toEqual(['01'])
    expect(d.new.map((s) => s.text).join('')).toBe('Fällig: 2026-10-01')
  })

  it('gives up on lines with nothing in common', () => {
    expect(inlineDiff('Ganz anderer Text', '12345')).toBeNull()
  })

  it('pairs removed and added lines of a change run', () => {
    const lines = diffLines('a\nb\nc\n', 'a\nB\nc\nd\n')
    const pairs = pairChanges(lines)
    const del = lines.find((l) => l.type === 'del')!
    expect(pairs.get(del)?.text).toBe('B')
    expect(pairs.has(lines.find((l) => l.text === 'd')!)).toBe(false)
  })
})
