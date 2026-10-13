import { evaluateFormula, FormulaError, LIMITS, parseFormula } from '../formula'

const now = new Date(2026, 9, 14, 12, 0)
const props = {
  Note: 1.7,
  ECTS: 9,
  Name: 'Analysis',
  Datum: '2026-10-20',
  Tags: ['mathe', 'pflicht'],
  Fertig: true,
  'Punkte gesamt': 87,
}
const run = (src: string) => evaluateFormula(src, { props, now })
const value = (src: string) => run(src).value

describe('formula: arithmetic and logic', () => {
  it.each([
    ['1 + 2 * 3', 7],
    ['(1 + 2) * 3', 9],
    ['2 ^ 3 ^ 2', 512],
    ['-2 ^ 2', -4],
    ['10 % 4', 2],
    ['1 / 0', null],
    ['1 < 2 && 2 < 3', true],
    ['1 > 2 or true', true],
    ['not false', true],
    ['!(1 == 1)', false],
    ['true ? "ja" : "nein"', 'ja'],
    ['1 == "1"', true],
    ['"a" + 1', 'a1'],
    ['"b" > "a"', true],
  ])('%s = %j', (src, expected) => {
    expect(value(src)).toEqual(expected)
  })
})

describe('formula: properties', () => {
  it('reads bare identifiers and prop("…")', () => {
    expect(value('Note * ECTS')).toBeCloseTo(15.3)
    expect(value('prop("Punkte gesamt") / 100')).toBe(0.87)
  })

  it('looks up names case-insensitively and returns null for unknown names', () => {
    expect(value('note')).toBe(1.7)
    expect(value('Unbekannt')).toBeNull()
  })

  it('works with lists', () => {
    expect(value('contains(Tags, "mathe")')).toBe(true)
    expect(value('length(Tags)')).toBe(2)
    expect(value('join(Tags, " / ")')).toBe('mathe / pflicht')
    expect(value('sum([1, 2, 3])')).toBe(6)
  })
})

describe('formula: functions', () => {
  it.each([
    ['if(Note <= 4, "bestanden", "offen")', 'bestanden'],
    ['round(2.345, 2)', 2.35],
    ['round(2.5)', 3],
    ['min(3, 1, 2)', 1],
    ['max([4, 9], 2)', 9],
    ['avg(1, 2, 3)', 2],
    ['concat(Name, " (", ECTS, " ECTS)")', 'Analysis (9 ECTS)'],
    ['upper(Name)', 'ANALYSIS'],
    ['empty("")', true],
    ['format(1.5, 2)', '1,50'],
    ['daysUntil(Datum)', 6],
    ['dateAdd(Datum, 2, "weeks")', '2026-11-03'],
    ['dateAdd(Datum, 1, "months")', '2026-11-20'],
    ['dateBetween(Datum, "2026-10-01", "days")', 19],
    ['formatDate(Datum)', '20.10.2026'],
    ['year(Datum) + month(Datum)', 2036],
    ['today()', '2026-10-14'],
  ])('%s = %j', (src, expected) => {
    expect(value(src)).toEqual(expected)
  })

  it('evaluates if() lazily', () => {
    expect(value('if(true, 1, unknownFn())')).toBeNull()
    expect(run('if(true, 1, unknownFn())').error).toMatch(/Unbekannte Funktion/)
    expect(value('if(true, 1, 1/0)')).toBe(1)
  })
})

describe('formula: errors are reported, not thrown', () => {
  it.each(['1 +', '(1', '"offen', 'foo(1)', '1 2', '@', 'prop(Name)'])('%j', (src) => {
    const result = run(src)
    expect(result.value).toBeNull()
    expect(result.error).toBeTruthy()
  })
})

describe('security: formulas cannot reach JavaScript', () => {
  it.each([
    'constructor',
    '__proto__',
    'prop("constructor")',
    'prop("__proto__")',
    'toString',
    'hasOwnProperty',
  ])('%j resolves to null instead of a JS object', (src) => {
    expect(value(src)).toBeNull()
  })

  it.each([
    'constructor.constructor("alert(1)")()',
    'this',
    'window.alert(1)',
    'globalThis',
    'eval("1")',
    'Function("return 1")()',
    'import("x")',
    '`template`',
    'a = 1',
    'x => x',
    'new Date()',
    'constructor("x")',
    'toString()',
    'valueOf()',
    'concat("", constructor)',
  ])('%j cannot execute code', (src) => {
    const result = run(src)
    expect(
      typeof result.value === 'function' ||
        (typeof result.value === 'object' && result.value !== null && !Array.isArray(result.value)),
    ).toBe(false)
    expect(
      ['string', 'number', 'boolean'].includes(typeof result.value) ||
        result.value === null ||
        Array.isArray(result.value),
    ).toBe(true)
  })

  it('limits length and nesting depth', () => {
    expect(() => parseFormula('1+'.repeat(LIMITS.length))).toThrow(FormulaError)
    expect(() => parseFormula(`${'('.repeat(100)}1${')'.repeat(100)}`)).toThrow(/verschachtelt/)
  })

  it('limits evaluation steps', () => {
    const big = Array.from({ length: 900 }, () => '1').join('+')
    expect(run(big).value).toBe(900)
    // Formulas have no loops, so steps are bounded by length; the step limit is defence in depth.
    const original = LIMITS.steps
    LIMITS.steps = 100
    try {
      expect(evaluateFormula(Array.from({ length: 80 }, () => '2').join('*'), { props: {} }).error).toMatch(
        /Rechenschritte/,
      )
    } finally {
      LIMITS.steps = original
    }
  })
})
