import {
  extractTags,
  extractWikiLinks,
  parseWikiLink,
  renameWikiLinks,
  rewriteBodyPaths,
  rewritePathReferences,
} from '../links'

describe('extractWikiLinks', () => {
  it('finds links with headings and labels', () => {
    expect(extractWikiLinks('Siehe [[Analysis]] und [[Lineare Algebra#Matrizen|LA]].')).toEqual([
      { target: 'Analysis' },
      { target: 'Lineare Algebra', heading: 'Matrizen', label: 'LA' },
    ])
  })

  it('ignores links inside code', () => {
    expect(extractWikiLinks('`[[nein]]`\n```\n[[auch nicht]]\n```\n[[ja]]')).toEqual([{ target: 'ja' }])
  })
})

describe('parseWikiLink', () => {
  it('parses the inner part', () => {
    expect(parseWikiLink('A#B|C')).toEqual({ target: 'A', heading: 'B', label: 'C' })
  })
})

describe('extractTags', () => {
  it('finds unique lowercase tags but not headings or anchors', () => {
    expect(extractTags('# Überschrift\n#Mathe und #klausur/ws25, nochmal #mathe. a#b')).toEqual([
      'mathe',
      'klausur/ws25',
    ])
  })

  it('needs a letter first', () => {
    expect(extractTags('Issue #123')).toEqual([])
  })
})

describe('renameWikiLinks', () => {
  it('rewrites matching links only, case-insensitively', () => {
    expect(renameWikiLinks('[[analysis]] [[Analysis#x|y]] [[Algebra]]', 'Analysis', 'Analysis I')).toBe(
      '[[Analysis I]] [[Analysis I#x|y]] [[Algebra]]',
    )
  })
})

describe('rewritePathReferences', () => {
  it.each([
    ['source: "Studium/Module"', 'source: "Uni/Module"'],
    ['source: Studium/Module', 'source: Uni/Module'],
    ['database: Studium/Module.md', 'database: Uni/Module.md'],
    ['page: Studium', 'page: Uni'],
    ['{ source: "Studium/Aufgaben", x: 1 }', '{ source: "Uni/Aufgaben", x: 1 }'],
    ['source: Studiumplan/X', 'source: Studiumplan/X'],
    ['source: Mein Studium/X', 'source: Mein Studium/X'],
  ])('%j → %j', (input, output) => {
    expect(rewritePathReferences(input, 'Studium', 'Uni')).toBe(output)
  })

  it('only touches widgets and path-style links in bodies', () => {
    const body =
      'Mein Studium/Plan und [[Studium/Module]] und [[Studium]]\n```notiva\nsource: Studium/Module\n```\n'
    expect(rewriteBodyPaths(body, 'Studium', 'Uni')).toBe(
      'Mein Studium/Plan und [[Uni/Module]] und [[Studium]]\n```notiva\nsource: Uni/Module\n```\n',
    )
  })
})
