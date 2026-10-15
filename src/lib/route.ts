/** Hash routes. Hash routing works the same in the browser, as PWA and under Electron's app:// protocol. */
import { isSafePath } from './path'

export type Route =
  | { name: 'home' }
  | { name: 'page'; path: string }
  | { name: 'tag'; tag: string }
  | { name: 'search'; query: string }
  | { name: 'trash' }
  | { name: 'settings'; section?: string }
  | { name: 'templates' }
  | { name: 'moodle'; course?: string }
  | { name: 'grades' }
  | { name: 'semester' }
  | { name: 'timetable' }
  | { name: 'help' }
  | { name: 'versions' }
  | { name: 'file'; path: string; page?: number }

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part)
  } catch {
    return null
  }
}

export function parseRoute(hash: string): Route {
  const clean = hash.replace(/^#\/?/, '')
  const slash = clean.indexOf('/')
  const head = slash === -1 ? clean : clean.slice(0, slash)
  const rest = slash === -1 ? '' : decode(clean.slice(slash + 1))
  switch (head) {
    case 'p':
      return rest && isSafePath(rest) && rest.endsWith('.md')
        ? { name: 'page', path: rest }
        : { name: 'home' }
    case 'tag':
      return rest ? { name: 'tag', tag: rest.toLowerCase() } : { name: 'home' }
    case 'search':
      return { name: 'search', query: rest ?? '' }
    case 'settings':
      return rest && /^[a-z]+$/.test(rest) ? { name: 'settings', section: rest } : { name: 'settings' }
    case 'trash':
    case 'templates':
    case 'grades':
    case 'semester':
    case 'timetable':
    case 'help':
    case 'versions':
      return { name: head }
    case 'moodle':
      return rest && /^course:\d+$/.test(rest) ? { name: 'moodle', course: rest } : { name: 'moodle' }
    case 'f': {
      if (!rest) return { name: 'home' }
      const [path, page] = rest.split('#page=')
      if (!path || !isSafePath(path) || path.endsWith('.md')) return { name: 'home' }
      const n = Number(page)
      return Number.isInteger(n) && n > 0 ? { name: 'file', path, page: n } : { name: 'file', path }
    }
    default:
      return { name: 'home' }
  }
}

export function routeHash(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'page':
      return `#/p/${encodeURIComponent(route.path)}`
    case 'tag':
      return `#/tag/${encodeURIComponent(route.tag)}`
    case 'search':
      return `#/search/${encodeURIComponent(route.query)}`
    case 'moodle':
      return route.course ? `#/moodle/${encodeURIComponent(route.course)}` : '#/moodle'
    case 'settings':
      return route.section ? `#/settings/${route.section}` : '#/settings'
    case 'file':
      return `#/f/${encodeURIComponent(route.page ? `${route.path}#page=${route.page}` : route.path)}`
    default:
      return `#/${route.name}`
  }
}
