import { parseMarkdown, serializeMarkdown } from '../frontmatter'

describe('parseMarkdown', () => {
  it('reads frontmatter and body', () => {
    const doc = parseMarkdown('---\ntitle: Analysis\nects: 9\ntags: [mathe, pflicht]\n---\n# Hallo\n')
    expect(doc.data).toEqual({ title: 'Analysis', ects: 9, tags: ['mathe', 'pflicht'] })
    expect(doc.body).toBe('# Hallo\n')
  })

  it('treats files without frontmatter as body only', () => {
    expect(parseMarkdown('# Nur Text')).toEqual({ data: {}, body: '# Nur Text' })
  })

  it('keeps dates as plain strings (core schema)', () => {
    expect(parseMarkdown('---\ndue: 2026-10-14\n---\n').data.due).toBe('2026-10-14')
  })

  it('reports invalid YAML instead of throwing', () => {
    const doc = parseMarkdown('---\ntitle: [unclosed\n---\nText')
    expect(doc.error).toBeTruthy()
    expect(doc.data).toEqual({})
  })

  it('rejects non-mapping frontmatter', () => {
    expect(parseMarkdown('---\n- a\n- b\n---\n').error).toBeTruthy()
  })
})

describe('security: frontmatter', () => {
  it('does not allow prototype pollution', () => {
    const doc = parseMarkdown('---\n__proto__:\n  polluted: true\nconstructor: x\nsafe: 1\n---\n')
    expect(doc.data).toEqual({ safe: 1 })
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('ignores custom YAML tags', () => {
    const doc = parseMarkdown('---\nx: !!js/function "function(){return 1}"\n---\n')
    expect(typeof doc.data.x).not.toBe('function')
  })

  it('limits alias expansion (billion laughs)', () => {
    const bomb = [
      'a: &a ["x","x","x","x","x","x","x","x","x"]',
      'b: &b [*a,*a,*a,*a,*a,*a,*a,*a,*a]',
      'c: &c [*b,*b,*b,*b,*b,*b,*b,*b,*b]',
      'd: &d [*c,*c,*c,*c,*c,*c,*c,*c,*c]',
      'e: [*d,*d,*d,*d,*d,*d,*d,*d,*d]',
    ].join('\n')
    const doc = parseMarkdown(`---\n${bomb}\n---\n`)
    expect(doc.error).toBeTruthy()
  })
})

describe('serializeMarkdown', () => {
  it('round-trips', () => {
    const text = '---\ntitle: Analysis\nects: 9\n---\n# Hallo\n'
    expect(serializeMarkdown(parseMarkdown(text))).toBe(text)
  })

  it('omits empty frontmatter', () => {
    expect(serializeMarkdown({ data: {}, body: 'Text' })).toBe('Text')
  })

  it('quotes strings that would otherwise change type', () => {
    const text = serializeMarkdown({ data: { code: '007', flag: 'true' }, body: '' })
    expect(parseMarkdown(text).data).toEqual({ code: '007', flag: 'true' })
  })
})

describe('format-preserving save', () => {
  const file = [
    '---',
    'Status: In Arbeit',
    'Modul: ["[[Datenbanken]]"]',
    'Fällig: 2026-10-19 # bis Mitternacht',
    'Priorität: Mittel',
    'Art: Abgabe',
    'database:',
    '  views:',
    '    - { name: Board, type: board, sort: [{ property: Fällig, direction: asc }] }',
    '    - { name: Alle, type: table }',
    '---',
    'Text',
  ].join('\n')
  const save = (change: (data: Record<string, unknown>) => void) => {
    const parsed = parseMarkdown(file)
    const data = structuredClone(parsed.data)
    change(data)
    return serializeMarkdown({ data: data as typeof parsed.data, body: parsed.body }, parsed.yaml)
  }
  const changedLines = (text: string) => {
    const before = file.split('\n')
    return text.split('\n').filter((line) => !before.includes(line))
  }

  it('keeps the file byte for byte if nothing changed', () => {
    expect(save(() => {})).toBe(file)
  })

  it('changes only the line of the changed key', () => {
    const text = save((d) => (d.Fällig = '2026-10-01'))
    expect(changedLines(text)).toEqual(['Fällig: 2026-10-01'])
    expect(text.split('\n').length).toBe(file.split('\n').length)
    expect(parseMarkdown(text).data.Fällig).toBe('2026-10-01')
  })

  it('keeps flow lists and quotes when a list changes', () => {
    const text = save((d) => (d.Modul = ['[[Datenbanken]]', '[[Analysis]]']))
    expect(changedLines(text)).toEqual(['Modul: ["[[Datenbanken]]", "[[Analysis]]"]'])
  })

  it('removes keys and appends new ones without touching the rest', () => {
    const text = save((d) => {
      delete d.Art
      d.Note = 1.7
    })
    expect(text).not.toContain('Art: Abgabe')
    expect(text).toContain('Priorität: Mittel\ndatabase:')
    expect(changedLines(text)).toEqual(['Note: 1.7'])
  })

  it('patches nested database definitions entry by entry', () => {
    const text = save((d) => {
      const db = d.database as { views: Array<Record<string, unknown>> }
      db.views[1]!.name = 'Tabelle'
    })
    expect(text).toContain('    - { name: Board, type: board, sort: [{ property: Fällig, direction: asc }] }')
    expect(parseMarkdown(text).data.database).toEqual({
      views: [
        { name: 'Board', type: 'board', sort: [{ property: 'Fällig', direction: 'asc' }] },
        { name: 'Tabelle', type: 'table' },
      ],
    })
  })

  it('falls back to a normal save for unusual YAML', () => {
    expect(serializeMarkdown({ data: { a: 1 }, body: '' }, '{ a: 0 }')).toBe('---\na: 1\n---\n')
  })
})

describe('format-preserving save of block lists and maps', () => {
  const yaml = ['title: Plan', 'tags:', '  - uni', '  - mathe', 'meta:', '  a: 1 # eins', '  b: 2'].join('\n')
  const file = `---\n${yaml}\n---\n`
  const save = (data: Record<string, unknown>) =>
    serializeMarkdown({ data: data as never, body: '' }, parseMarkdown(file).yaml)

  it('adds and removes list items line by line', () => {
    const text = save({ title: 'Plan', tags: ['mathe', 'uni', 'klausur'], meta: { a: 1, b: 2 } })
    expect(text).toBe(
      '---\ntitle: Plan\ntags:\n  - mathe\n  - uni\n  - klausur\nmeta:\n  a: 1 # eins\n  b: 2\n---\n',
    )
  })

  it('changes one nested key and keeps comments of the others', () => {
    const text = save({ title: 'Plan', tags: ['uni', 'mathe'], meta: { a: 1, b: 3, c: 'neu' } })
    expect(text).toBe(
      '---\ntitle: Plan\ntags:\n  - uni\n  - mathe\nmeta:\n  a: 1 # eins\n  b: 3\n  c: neu\n---\n',
    )
  })
})

describe('blank line after frontmatter', () => {
  it('survives a save', () => {
    const file = '---\na: 1\n---\n\n# Titel\n'
    const parsed = parseMarkdown(file)
    expect(serializeMarkdown(parsed, parsed.yaml)).toBe(file)
  })
})
