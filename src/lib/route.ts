/** Hash routes. Hash routing works the same in the browser, as PWA and under Electron's app:// protocol. */
import { isSafePath } from './path'

export type Route =
  | { name: 'home' }
  | { name: 'page'; path: string }
  | { name: 'tag'; tag: string }
  | { name: 'search'; query: string }
  | { name: 'trash' }
  | { name: 'settings' }
  | { name: 'templates' }

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
    case 'trash':
    case 'settings':
    case 'templates':
      return { name: head }
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
    default:
      return `#/${route.name}`
  }
}
