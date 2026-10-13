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
