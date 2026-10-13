import {
  assertSafePath,
  basename,
  dirname,
  extname,
  isInside,
  isSafePath,
  joinPath,
  normalizePath,
  toFileName,
  uniquePath,
  UnsafePathError,
} from '../path'

describe('normalizePath / joinPath', () => {
  it('collapses slashes and dot segments', () => {
    expect(normalizePath('/a//b/./c/')).toBe('a/b/c')
    expect(joinPath('a', '', 'b/c', 'd.md')).toBe('a/b/c/d.md')
  })
})

describe('dirname / basename / extname', () => {
  it('splits paths', () => {
    expect(dirname('Studium/Module/Analysis.md')).toBe('Studium/Module')
    expect(dirname('a.md')).toBe('')
    expect(basename('Studium/Module/Analysis.md')).toBe('Analysis.md')
    expect(basename('Studium/Analysis.md', '.md')).toBe('Analysis')
    expect(extname('x/y.tar.md')).toBe('.md')
    expect(extname('.hidden')).toBe('')
  })
})

describe('isInside', () => {
  it('matches only real descendants', () => {
    expect(isInside('a/b.md', 'a')).toBe(true)
    expect(isInside('ab/c.md', 'a')).toBe(false)
    expect(isInside('anything', '')).toBe(true)
  })
})

describe('security: path validation', () => {
  it.each([
    '../secret.md',
    'a/../../etc/passwd',
    '/etc/passwd',
    'C:/Windows/system.ini',
    'a\\..\\b',
    'nul\u0000byte.md',
    '',
    'x'.repeat(2000),
  ])('rejects %j', (path) => {
    expect(isSafePath(path)).toBe(false)
    expect(() => assertSafePath(path)).toThrow(UnsafePathError)
  })

  it('accepts normal vault paths', () => {
    expect(assertSafePath('Studium/Module/Lineare Algebra.md')).toBe('Studium/Module/Lineare Algebra.md')
    expect(assertSafePath('./a//b.md')).toBe('a/b.md')
  })
})

describe('toFileName', () => {
  it('removes characters that are invalid on any platform', () => {
    expect(toFileName('Mathe: Teil 1/2?')).toBe('Mathe Teil 1 2')
    expect(toFileName('  ..versteckt. ')).toBe('versteckt')
    expect(toFileName('')).toBe('Unbenannt')
    expect(toFileName('CON')).toBe('CON_')
  })
})

describe('uniquePath', () => {
  it('appends a counter until the path is free', () => {
    const taken = new Set(['a/Note.md', 'a/Note 2.md'])
    expect(uniquePath('a/Note.md', (p) => taken.has(p))).toBe('a/Note 3.md')
    expect(uniquePath('a/Other.md', (p) => taken.has(p))).toBe('a/Other.md')
  })
})
