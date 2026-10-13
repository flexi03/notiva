import { blockType, joinBlocks, moveBlock, splitBlocks, toggleTask } from '../blocks'

const texts = (body: string) => splitBlocks(body).map((b) => b.text)

describe('splitBlocks', () => {
  it('splits top-level blocks and keeps their exact source', () => {
    const body =
      '# Titel\n\nAbsatz *eins*\nzweite Zeile\n\n- a\n- b\n\n```js\nconst x = 1\n\nconst y = 2\n```\n'
    expect(texts(body)).toEqual([
      '# Titel',
      'Absatz *eins*\nzweite Zeile',
      '- a\n- b',
      '```js\nconst x = 1\n\nconst y = 2\n```',
    ])
  })

  it('keeps display math spanning blank lines together', () => {
    expect(texts('$$\na\n\nb\n$$\n\nText')).toEqual(['$$\na\n\nb\n$$', 'Text'])
  })

  it('returns no blocks for an empty body', () => {
    expect(splitBlocks('\n\n')).toEqual([])
  })

  it('assigns unique ids', () => {
    const ids = splitBlocks('a\n\nb\n\nc').map((b) => b.id)
    expect(new Set(ids).size).toBe(3)
  })
})

describe('joinBlocks', () => {
  it('round-trips normalised documents', () => {
    const body = '# Titel\n\nText\n\n> Zitat\n'
    expect(joinBlocks(splitBlocks(body))).toBe(body)
  })

  it('drops empty blocks', () => {
    expect(
      joinBlocks([
        { id: '1', text: 'a' },
        { id: '2', text: '  ' },
      ]),
    ).toBe('a\n')
  })
})

describe('blockType', () => {
  it.each([
    ['## H', 'heading'],
    ['```notiva\ntype: tiles\n```', 'widget'],
    ['```ts\nx\n```', 'code'],
    ['$$\nx\n$$', 'math'],
    ['> [!tip] Hinweis', 'callout'],
    ['> Zitat', 'quote'],
    ['- [ ] Aufgabe', 'tasks'],
    ['1. eins', 'list'],
    ['| a | b |\n| - | - |', 'table'],
    ['---', 'divider'],
    ['<details>', 'html'],
    ['Text', 'paragraph'],
  ])('%j is %s', (text, type) => {
    expect(blockType(text)).toBe(type)
  })
})

describe('toggleTask', () => {
  it('toggles only the given checkbox', () => {
    expect(toggleTask('- [ ] a\n- [x] b\n- [ ] c', 1)).toBe('- [ ] a\n- [ ] b\n- [ ] c')
    expect(toggleTask('- [ ] a\n  - [ ] b', 1)).toBe('- [ ] a\n  - [x] b')
  })
})

describe('moveBlock', () => {
  it('reorders without mutating', () => {
    const list = ['a', 'b', 'c']
    expect(moveBlock(list, 0, 2)).toEqual(['b', 'c', 'a'])
    expect(list).toEqual(['a', 'b', 'c'])
  })
})
