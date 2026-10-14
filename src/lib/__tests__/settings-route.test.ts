import { DEFAULT_SETTINGS, parseSettings, sanitizeCss, themeVariables } from '../settings'
import { parseRoute, routeHash, type Route } from '../route'

describe('parseSettings', () => {
  it('returns defaults for garbage', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS)
  })

  it('validates every field', () => {
    const s = parseSettings({
      theme: 'dark',
      accent: 'evil',
      fontSize: 99,
      favorites: ['a.md', 3],
      dailyFolder: '../x',
      extra: 1,
    })
    expect(s).toMatchObject({
      theme: 'dark',
      accent: 'tanne',
      fontSize: 22,
      favorites: ['a.md'],
      dailyFolder: 'Tagesnotizen',
    })
    expect(s).not.toHaveProperty('extra')
  })

  it('builds theme variables', () => {
    expect(themeVariables(DEFAULT_SETTINGS, true)['--accent']).toBe('#86c1ad')
  })
})

describe('security: custom CSS cannot load remote resources', () => {
  it.each([
    "@import 'https://evil.example/x.css';",
    'body { background: url(https://evil.example/track.png) }',
    'body { background: URL ( "https://evil.example" ) }',
    'x { width: expression(alert(1)) }',
    '</style><script>alert(1)</script>',
  ])('%j', (css) => {
    const out = sanitizeCss(css)
    expect(out).not.toMatch(/@import|url\s*\(|expression\s*\(|<\/?style/i)
  })
})

describe('routes', () => {
  it.each<Route>([
    { name: 'home' },
    { name: 'page', path: 'Studium/Module/Analysis I.md' },
    { name: 'tag', tag: 'klausur/ws25' },
    { name: 'search', query: 'grenz wert' },
    { name: 'trash' },
    { name: 'settings' },
    { name: 'templates' },
  ])('round-trips %j', (route) => {
    expect(parseRoute(routeHash(route))).toEqual(route)
  })

  it.each(['#/p/..%2F..%2Fetc%2Fpasswd.md', '#/p/%E0%A4%A', '#/p/x.txt', '#/unknown', ''])(
    'security: %j falls back to home',
    (hash) => {
      expect(parseRoute(hash)).toEqual({ name: 'home' })
    },
  )
})

describe('routes for Moodle courses and files', () => {
  it('round-trips', async () => {
    const { parseRoute, routeHash } = await import('../route')
    for (const route of [
      { name: 'moodle' as const },
      { name: 'moodle' as const, course: 'course:42' },
      { name: 'file' as const, path: 'Studium/Unterlagen/LA/vl 01.pdf' },
      { name: 'file' as const, path: 'a.pdf', page: 7 },
    ])
      expect(parseRoute(routeHash(route))).toEqual(route)
    expect(parseRoute('#/f/..%2Fetc%2Fpasswd')).toEqual({ name: 'home' })
    expect(parseRoute('#/moodle/evil')).toEqual({ name: 'moodle' })
  })
})
