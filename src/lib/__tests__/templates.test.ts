import { applyPageTemplate, expandPack, renderTemplate, type TemplatePack } from '../templates'
import { UnsafePathError } from '../path'

const now = new Date(2026, 9, 14, 9, 5)

describe('renderTemplate', () => {
  it.each([
    ['{{date}}', '2026-10-14'],
    ['{{date:DD.MM.YYYY}}', '14.10.2026'],
    ['{{date+7}}', '2026-10-21'],
    ['{{date-14:DD.MM.}}', '30.09.'],
    ['{{time}}', '09:05'],
    ['{{weekday}}', 'Mittwoch'],
    ['{{title}}', 'Analysis'],
    ['{{ title }}', 'Analysis'],
    ['{{title|yaml}}', '"Analysis"'],
    ['{{unbekannt}}', '{{unbekannt}}'],
    ['{{constructor}}', '{{constructor}}'],
  ])('%s → %s', (input, output) => {
    expect(renderTemplate(input, { title: 'Analysis' }, now)).toBe(output)
  })

  it('keeps frontmatter valid with the yaml filter', () => {
    const { data } = applyPageTemplate('---\ntitel: {{title|yaml}}\n---\n', { title: 'a: "b" # c' }, now)
    expect(data.titel).toBe('a: "b" # c')
  })
})

describe('applyPageTemplate', () => {
  it('drops template-only keys', () => {
    const result = applyPageTemplate(
      '---\ntemplate: true\ntitle: Vorlage\nDatum: {{date}}\n---\n# {{title}}\n',
      { title: 'X' },
      now,
    )
    expect(result).toEqual({ data: { Datum: '2026-10-14' }, body: '# X\n' })
  })
})

describe('expandPack', () => {
  const pack: TemplatePack = {
    id: 't',
    name: 'T',
    description: '',
    icon: '',
    variables: [{ key: 'name', label: 'Name', default: 'Studium' }],
    files: [{ path: '{{name}}.md', content: 'Hallo {{name}}' }],
    entry: '{{name}}.md',
  }

  it('expands paths and contents with defaults', () => {
    expect(expandPack(pack, 'Uni', {}, now)).toEqual({
      files: [{ path: 'Uni/Studium.md', content: 'Hallo Studium' }],
      entry: 'Uni/Studium.md',
    })
  })

  it('security: rejects variables that escape the folder', () => {
    expect(() => expandPack(pack, '', { name: '../../evil' }, now)).toThrow(UnsafePathError)
  })
})
