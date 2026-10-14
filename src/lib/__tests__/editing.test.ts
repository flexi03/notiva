import {
  activeTrigger,
  continueList,
  indentLine,
  isMultilineBlock,
  replaceRange,
  splitAt,
  wordCount,
  wrapSelection,
  type TextState,
} from '../editing'

/** Builds a state from text with "|" as cursor. */
const at = (marked: string): TextState => {
  const i = marked.indexOf('|')
  return { text: marked.replace('|', ''), start: i, end: i }
}
const show = (s: TextState | null) => (s ? s.text.slice(0, s.start) + '|' + s.text.slice(s.end) : null)

describe('continueList', () => {
  it.each([
    ['- eins|', '- eins\n- |'],
    ['* a|', '* a\n* |'],
    ['1. eins|', '1. eins\n2. |'],
    ['9) x|', '9) x\n10) |'],
    ['- [x] erledigt|', '- [x] erledigt\n- [ ] |'],
    ['  - eingerückt|', '  - eingerückt\n  - |'],
    ['- geteilt| hier', '- geteilt\n- | hier'],
  ])('%j → %j', (input, output) => {
    expect(show(continueList(at(input)))).toBe(output)
  })

  it('leaves the list on an empty item', () => {
    const result = continueList(at('- eins\n- |'))
    expect(result).toMatchObject({ text: '- eins', exit: true })
  })

  it('ignores non-list text', () => {
    expect(continueList(at('Absatz|'))).toBeNull()
  })
})

describe('indentLine', () => {
  it('indents and outdents list items', () => {
    expect(show(indentLine(at('- a\n- b|'), false))).toBe('- a\n  - b|')
    expect(show(indentLine(at('- a\n  - b|'), true))).toBe('- a\n- b|')
    expect(indentLine(at('Text|'), false)).toBeNull()
  })
})

describe('wrapSelection', () => {
  it('wraps and unwraps', () => {
    const wrapped = wrapSelection({ text: 'ein Wort', start: 4, end: 8 }, '**')
    expect(wrapped).toEqual({ text: 'ein **Wort**', start: 6, end: 10 })
    expect(wrapSelection(wrapped, '**')).toEqual({ text: 'ein Wort', start: 4, end: 8 })
    expect(wrapSelection({ text: 'x', start: 1, end: 1 }, '[[', ']]')).toEqual({
      text: 'x[[]]',
      start: 3,
      end: 3,
    })
  })
})

describe('activeTrigger', () => {
  it.each([
    ['/|', { kind: 'slash', query: '', from: 0 }],
    ['Text /tab|', { kind: 'slash', query: 'tab', from: 5 }],
    ['Siehe [[Ana|', { kind: 'link', query: 'Ana', from: 6 }],
    ['a/b|', null],
    ['[[fertig]]|', null],
    ['https://x.de/|', null],
  ])('%j', (input, expected) => {
    expect(activeTrigger(at(input))).toEqual(expected)
  })
})

describe('replaceRange', () => {
  it('replaces the trigger and places the cursor at "|"', () => {
    expect(show(replaceRange(at('Text /cal|'), 5, '> [!note] |'))).toBe('Text > [!note] |')
    expect(show(replaceRange(at('[[An|'), 0, '[[Analysis]]'))).toBe('[[Analysis]]|')
  })
})

describe('block helpers', () => {
  it('detects multiline blocks', () => {
    expect(isMultilineBlock('```js\nx')).toBe(true)
    expect(isMultilineBlock('> Zitat')).toBe(true)
    expect(isMultilineBlock('Absatz')).toBe(false)
    expect(isMultilineBlock('# H')).toBe(false)
  })

  it('splits at the cursor', () => {
    expect(splitAt(at('Hallo |Welt'))).toEqual({ before: 'Hallo', after: 'Welt' })
  })

  it('counts words without code', () => {
    expect(wordCount('Zwei Wörter\n```\ncode hier\n```')).toBe(2)
  })
})
