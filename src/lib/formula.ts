/**
 * Safe formula language for computed database properties (similar to Notion formulas).
 * Hand-written tokenizer + Pratt parser + tree-walking evaluator: no `eval`, no `Function`,
 * no access to JavaScript objects. Length, nesting depth and evaluation steps are limited.
 *
 *   if(Note <= 4, "bestanden", "offen")
 *   round(prop("Punkte") / 120 * 100, 1)
 *   daysUntil(Datum) + " Tage"
 */
import { addDays, daysBetween, formatDate, parseDate, toIsoDate } from './dates'

export type FormulaValue = number | string | boolean | null | FormulaValue[]

export class FormulaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FormulaError'
  }
}

type Node =
  | { kind: 'literal'; value: FormulaValue }
  | { kind: 'prop'; name: string }
  | { kind: 'unary'; op: string; arg: Node }
  | { kind: 'binary'; op: string; left: Node; right: Node }
  | { kind: 'ternary'; test: Node; then: Node; else: Node }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'list'; items: Node[] }

interface Token {
  type: 'num' | 'str' | 'ident' | 'op' | 'eof'
  value: string
  pos: number
}

export const LIMITS = { length: 2000, depth: 40, steps: 10000 }

/* ---------- tokenizer ---------- */

const OPERATORS = [
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '^',
  '<',
  '>',
  '!',
  '?',
  ':',
  '(',
  ')',
  ',',
  '[',
  ']',
]

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const ch = src[i]!
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const match = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!
      tokens.push({ type: 'num', value: match[0], pos: i })
      i += match[0].length
      continue
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1
      let value = ''
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\' && j + 1 < src.length) {
          const next = src[j + 1]!
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next
          j += 2
        } else value += src[j++]
      }
      if (j >= src.length) throw new FormulaError(`Unterminated string at ${i}`)
      tokens.push({ type: 'str', value, pos: i })
      i = j + 1
      continue
    }
    const ident = /^[\p{L}_][\p{L}\p{N}_]*/u.exec(src.slice(i))
    if (ident) {
      tokens.push({ type: 'ident', value: ident[0], pos: i })
      i += ident[0].length
      continue
    }
    const op = OPERATORS.find((o) => src.startsWith(o, i))
    if (!op) throw new FormulaError(`Unexpected character "${ch}" at ${i}`)
    tokens.push({ type: 'op', value: op, pos: i })
    i += op.length
  }
  tokens.push({ type: 'eof', value: '', pos: src.length })
  return tokens
}

/* ---------- parser ---------- */

const BINARY: Record<string, [number, 'left' | 'right']> = {
  '||': [1, 'left'],
  or: [1, 'left'],
  '&&': [2, 'left'],
  and: [2, 'left'],
  '==': [3, 'left'],
  '!=': [3, 'left'],
  '<': [4, 'left'],
  '<=': [4, 'left'],
  '>': [4, 'left'],
  '>=': [4, 'left'],
  '+': [5, 'left'],
  '-': [5, 'left'],
  '*': [6, 'left'],
  '/': [6, 'left'],
  '%': [6, 'left'],
  '^': [8, 'right'],
}
const KEYWORDS: Record<string, FormulaValue> = Object.assign(
  Object.create(null) as Record<string, FormulaValue>,
  {
    true: true,
    false: false,
    null: null,
    wahr: true,
    falsch: false,
  },
)
// All lookups use Object.hasOwn: inherited keys like "constructor" must never resolve.
const has = (table: object, key: string) => Object.hasOwn(table, key)

export function parseFormula(src: string): Node {
  if (src.length > LIMITS.length) throw new FormulaError('Formel ist zu lang')
  const tokens = tokenize(src)
  let index = 0
  const peek = () => tokens[index]!
  const next = () => tokens[index++]!
  const expect = (value: string) => {
    const token = next()
    if (token.value !== value || token.type === 'str')
      throw new FormulaError(`Expected "${value}" at ${token.pos}`)
  }

  const expression = (minPrec: number, depth: number): Node => {
    if (depth > LIMITS.depth) throw new FormulaError('Formel ist zu tief verschachtelt')
    let left = prefix(depth)
    for (;;) {
      const token = peek()
      const key = token.type === 'op' || token.type === 'ident' ? token.value : ''
      if (key === '?' && minPrec <= 0) {
        next()
        const then = expression(0, depth + 1)
        expect(':')
        left = { kind: 'ternary', test: left, then, else: expression(0, depth + 1) }
        continue
      }
      const info = has(BINARY, key) ? BINARY[key] : undefined
      if (!info || info[0] < minPrec) return left
      next()
      const nextMin = info[1] === 'left' ? info[0] + 1 : info[0]
      left = { kind: 'binary', op: normalizeOp(key), left, right: expression(nextMin, depth + 1) }
    }
  }

  const prefix = (depth: number): Node => {
    const token = next()
    if (token.type === 'num') return { kind: 'literal', value: Number(token.value) }
    if (token.type === 'str') return { kind: 'literal', value: token.value }
    if (token.type === 'op' && (token.value === '-' || token.value === '!' || token.value === '+')) {
      return { kind: 'unary', op: token.value, arg: expression(7, depth + 1) }
    }
    if (token.type === 'op' && token.value === '(') {
      const inner = expression(0, depth + 1)
      expect(')')
      return inner
    }
    if (token.type === 'op' && token.value === '[') {
      const items = args(']', depth)
      return { kind: 'list', items }
    }
    if (token.type === 'ident') {
      const lower = token.value.toLowerCase()
      if (lower === 'not') return { kind: 'unary', op: '!', arg: expression(7, depth + 1) }
      if (peek().value === '(' && peek().type === 'op') {
        next()
        const callArgs = args(')', depth)
        if (lower === 'prop') {
          const first = callArgs[0]
          if (callArgs.length !== 1 || first?.kind !== 'literal' || typeof first.value !== 'string') {
            throw new FormulaError('prop() erwartet einen Namen in Anführungszeichen')
          }
          return { kind: 'prop', name: first.value }
        }
        if (!has(FUNCTIONS, lower)) throw new FormulaError(`Unbekannte Funktion: ${token.value}`)
        return { kind: 'call', name: lower, args: callArgs }
      }
      if (has(KEYWORDS, lower)) return { kind: 'literal', value: KEYWORDS[lower]! }
      return { kind: 'prop', name: token.value }
    }
    throw new FormulaError(`Unexpected "${token.value || 'end'}" at ${token.pos}`)
  }

  const args = (close: string, depth: number): Node[] => {
    const list: Node[] = []
    if (peek().value === close && peek().type === 'op') {
      next()
      return list
    }
    for (;;) {
      list.push(expression(0, depth + 1))
      const token = next()
      if (token.value === close && token.type === 'op') return list
      if (token.value !== ',' || token.type !== 'op')
        throw new FormulaError(`Expected "," or "${close}" at ${token.pos}`)
    }
  }

  const tree = expression(0, 0)
  if (peek().type !== 'eof') throw new FormulaError(`Unexpected "${peek().value}" at ${peek().pos}`)
  return tree
}

function normalizeOp(op: string): string {
  return op === 'and' ? '&&' : op === 'or' ? '||' : op
}

/* ---------- evaluation ---------- */

export interface FormulaContext {
  /** Property values of the current row, by property name. */
  props: Record<string, FormulaValue | undefined>
  /** Reference "now" (injectable for tests). */
  now?: Date
}

export function toNumber(value: FormulaValue): number {
  if (typeof value === 'number') return value
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(',', '.'))
    return Number.isNaN(n) ? NaN : n
  }
  if (Array.isArray(value)) return value.length
  return NaN
}

export function toText(value: FormulaValue): string {
  if (value === null) return ''
  if (Array.isArray(value)) return value.map(toText).join(', ')
  if (typeof value === 'number')
    return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e10) / 1e10)
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  return value
}

export function isTruthy(value: FormulaValue): boolean {
  if (Array.isArray(value)) return value.length > 0
  return value !== null && value !== false && value !== 0 && value !== '' && !Number.isNaN(value)
}

function isEmpty(value: FormulaValue | undefined): boolean {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0)
}

function equals(a: FormulaValue, b: FormulaValue): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return toText(a) === toText(b)
  if (typeof a === 'number' || typeof b === 'number') return toNumber(a) === toNumber(b)
  return a === b
}

function compare(a: FormulaValue, b: FormulaValue): number {
  if (typeof a === 'string' && typeof b === 'string' && Number.isNaN(Number(a)) && Number.isNaN(Number(b))) {
    return a.localeCompare(b, 'de')
  }
  return toNumber(a) - toNumber(b)
}

function finite(n: number): number | null {
  return Number.isFinite(n) ? n : null
}

type Fn = (args: FormulaValue[], ctx: Required<FormulaContext>) => FormulaValue
const flat = (args: FormulaValue[]): FormulaValue[] => args.flatMap((a) => (Array.isArray(a) ? a : [a]))
const nums = (args: FormulaValue[]) =>
  flat(args)
    .map(toNumber)
    .filter((n) => !Number.isNaN(n))
const date = (value: FormulaValue | undefined): Date | null =>
  typeof value === 'string' ? parseDate(value) : null
const UNITS: Record<string, number> = { days: 1, day: 1, tage: 1, weeks: 7, week: 7, wochen: 7 }

const FUNCTIONS: Record<string, Fn> = {
  if: ([c, a = null, b = null]) => (isTruthy(c ?? null) ? a : b),
  and: (args) => args.every(isTruthy),
  or: (args) => args.some(isTruthy),
  not: ([a = null]) => !isTruthy(a),
  empty: ([a]) => isEmpty(a),
  round: ([x = null, digits = 0]) => {
    const f = 10 ** Math.max(0, Math.min(10, toNumber(digits)))
    return finite(Math.round(toNumber(x) * f) / f)
  },
  floor: ([x = null]) => finite(Math.floor(toNumber(x))),
  ceil: ([x = null]) => finite(Math.ceil(toNumber(x))),
  abs: ([x = null]) => finite(Math.abs(toNumber(x))),
  sqrt: ([x = null]) => finite(Math.sqrt(toNumber(x))),
  pow: ([x = null, y = null]) => finite(toNumber(x) ** toNumber(y)),
  min: (args) => (nums(args).length ? Math.min(...nums(args)) : null),
  max: (args) => (nums(args).length ? Math.max(...nums(args)) : null),
  sum: (args) => nums(args).reduce((s, n) => s + n, 0),
  avg: (args) => {
    const list = nums(args)
    return list.length ? list.reduce((s, n) => s + n, 0) / list.length : null
  },
  count: (args) => flat(args).filter((v) => !isEmpty(v)).length,
  length: ([x = null]) => (Array.isArray(x) ? x.length : toText(x).length),
  concat: (args) => args.map(toText).join(''),
  join: ([list = null, sep = ', ']) =>
    Array.isArray(list) ? list.map(toText).join(toText(sep)) : toText(list),
  upper: ([x = null]) => toText(x).toUpperCase(),
  lower: ([x = null]) => toText(x).toLowerCase(),
  trim: ([x = null]) => toText(x).trim(),
  contains: ([hay = null, needle = null]) =>
    Array.isArray(hay)
      ? hay.some((v) => equals(v, needle))
      : toText(hay).toLowerCase().includes(toText(needle).toLowerCase()),
  replace: ([x = null, a = null, b = '']) => toText(x).split(toText(a)).join(toText(b)),
  slice: ([x = null, s = 0, e = null]) => toText(x).slice(toNumber(s), e === null ? undefined : toNumber(e)),
  tonumber: ([x = null]) => finite(toNumber(x)),
  totext: ([x = null]) => toText(x),
  format: ([x = null, digits = null]) =>
    typeof x === 'number' && digits !== null
      ? x.toLocaleString('de-DE', {
          minimumFractionDigits: toNumber(digits),
          maximumFractionDigits: toNumber(digits),
        })
      : toText(x),
  now: (_args, ctx) => ctx.now.toISOString(),
  today: (_args, ctx) => toIsoDate(ctx.now),
  dateadd: ([d, n = 0, unit = 'days']) => {
    const parsed = date(d)
    if (!parsed) return null
    const factor = has(UNITS, toText(unit).toLowerCase()) ? UNITS[toText(unit).toLowerCase()] : undefined
    if (factor) return toIsoDate(addDays(parsed, toNumber(n) * factor))
    const copy = new Date(parsed)
    const u = toText(unit).toLowerCase()
    if (u.startsWith('month') || u.startsWith('monat')) copy.setMonth(copy.getMonth() + toNumber(n))
    else if (u.startsWith('year') || u.startsWith('jahr')) copy.setFullYear(copy.getFullYear() + toNumber(n))
    else return null
    return toIsoDate(copy)
  },
  datebetween: ([a, b, unit = 'days']) => {
    const da = date(a)
    const db = date(b)
    if (!da || !db) return null
    const days = daysBetween(db, da)
    const u = toText(unit).toLowerCase()
    return Math.trunc(days / (has(UNITS, u) ? UNITS[u]! : 1))
  },
  daysuntil: ([d], ctx) => {
    const parsed = date(d)
    return parsed ? daysBetween(ctx.now, parsed) : null
  },
  formatdate: ([d, pattern = 'DD.MM.YYYY']) => {
    const parsed = date(d)
    return parsed ? formatDate(parsed, toText(pattern)) : ''
  },
  year: ([d]) => date(d)?.getFullYear() ?? null,
  month: ([d]) => {
    const parsed = date(d)
    return parsed ? parsed.getMonth() + 1 : null
  },
  day: ([d]) => date(d)?.getDate() ?? null,
}

export const FORMULA_FUNCTIONS = Object.keys(FUNCTIONS)

/** Only plain formula values may enter an evaluation (defence in depth against odd property values). */
function sanitize(value: unknown): FormulaValue {
  if (value === null || value === undefined) return null
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(sanitize)
  return null
}

export function evaluateNode(node: Node, context: FormulaContext): FormulaValue {
  const ctx: Required<FormulaContext> = { props: context.props, now: context.now ?? new Date() }
  let steps = 0
  const lookup = (name: string): FormulaValue => {
    if (has(ctx.props, name)) return sanitize(ctx.props[name])
    const key = Object.keys(ctx.props).find((k) => k.toLowerCase() === name.toLowerCase())
    return key === undefined ? null : sanitize(ctx.props[key])
  }
  const run = (n: Node): FormulaValue => {
    if (++steps > LIMITS.steps) throw new FormulaError('Formel braucht zu viele Rechenschritte')
    switch (n.kind) {
      case 'literal':
        return n.value
      case 'prop':
        return lookup(n.name)
      case 'list':
        return n.items.map(run)
      case 'unary': {
        const v = run(n.arg)
        if (n.op === '!') return !isTruthy(v)
        return finite(n.op === '-' ? -toNumber(v) : toNumber(v))
      }
      case 'ternary':
        return isTruthy(run(n.test)) ? run(n.then) : run(n.else)
      case 'call':
        // `if`, `and`, `or` evaluate lazily so unused branches cannot fail or cost steps.
        if (n.name === 'if') {
          const [test, then, otherwise] = n.args
          const branch = isTruthy(test ? run(test) : null) ? then : otherwise
          return branch ? run(branch) : null
        }
        if (n.name === 'and') return n.args.every((a) => isTruthy(run(a)))
        if (n.name === 'or') return n.args.some((a) => isTruthy(run(a)))
        return FUNCTIONS[n.name]!(n.args.map(run), ctx)
      case 'binary': {
        if (n.op === '&&') return isTruthy(run(n.left)) && isTruthy(run(n.right))
        if (n.op === '||') return isTruthy(run(n.left)) || isTruthy(run(n.right))
        const a = run(n.left)
        const b = run(n.right)
        switch (n.op) {
          case '+':
            if (typeof a === 'string' || typeof b === 'string') return toText(a) + toText(b)
            return finite(toNumber(a) + toNumber(b))
          case '-':
            return finite(toNumber(a) - toNumber(b))
          case '*':
            return finite(toNumber(a) * toNumber(b))
          case '/':
            return finite(toNumber(a) / toNumber(b))
          case '%':
            return finite(toNumber(a) % toNumber(b))
          case '^':
            return finite(toNumber(a) ** toNumber(b))
          case '==':
            return equals(a, b)
          case '!=':
            return !equals(a, b)
          case '<':
            return compare(a, b) < 0
          case '<=':
            return compare(a, b) <= 0
          case '>':
            return compare(a, b) > 0
          case '>=':
            return compare(a, b) >= 0
        }
        throw new FormulaError(`Unknown operator ${n.op}`)
      }
    }
  }
  return run(node)
}

const cache = new Map<string, Node | FormulaError>()

/** Parses (cached) and evaluates a formula. Errors are returned, never thrown. */
export function evaluateFormula(
  src: string,
  context: FormulaContext,
): { value: FormulaValue; error?: string } {
  let tree = cache.get(src)
  if (!tree) {
    try {
      tree = parseFormula(src)
    } catch (error) {
      tree = error instanceof FormulaError ? error : new FormulaError(String(error))
    }
    if (cache.size > 500) cache.clear()
    cache.set(src, tree)
  }
  if (tree instanceof FormulaError) return { value: null, error: tree.message }
  try {
    return { value: evaluateNode(tree, context) }
  } catch (error) {
    return { value: null, error: (error as Error).message }
  }
}
