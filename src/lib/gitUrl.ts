/**
 * A link to a Git project (GitLab such as ProjectBase, GitHub, Gitea …) → its clone address, or
 * null. "https://projectbase.example/dbs/praktikum-2/-/tree/main" → "…/dbs/praktikum-2.git".
 */
export function repoUrl(link: string): { url: string; name: string } | null {
  let u: URL
  try {
    u = new URL(link)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const gitHost =
    /gitlab|github|gitea|codeberg|bitbucket|projectbase|forgejo/i.test(u.hostname) ||
    /^git\./i.test(u.hostname)
  let parts = u.pathname.split('/').filter(Boolean)
  // GitLab snippets are small repositories too: ".../-/snippets/41" → ".../-/snippets/41.git".
  const snippet = /^\/(?:(.+)\/)?-\/snippets\/(\d+)/.exec(u.pathname)
  if (snippet && gitHost)
    return {
      url: `${u.origin}/${snippet[1] ? `${snippet[1]}/` : ''}-/snippets/${snippet[2]}.git`,
      name: `snippet-${snippet[2]}`,
    }
  // Project path: everything before GitLab's "/-/" (tree, blob, issues …) or GitHub's "/tree/".
  const dash = parts.indexOf('-')
  if (dash >= 0) parts = parts.slice(0, dash)
  else if (/github/i.test(u.hostname)) parts = parts.slice(0, 2)
  if (parts[parts.length - 1]?.endsWith('.git')) {
    const name = parts[parts.length - 1]!.slice(0, -4)
    return name ? { url: `${u.origin}/${parts.join('/')}`, name } : null
  }
  if (!gitHost || parts.length < 2) return null
  // Not projects: user and group pages, sign-in, help …
  if (/^(users|groups|explore|help|login|sign_in|oauth|dashboard|search|admin|-)$/i.test(parts[0]!))
    return null
  return { url: `${u.origin}/${parts.join('/')}.git`, name: parts[parts.length - 1]! }
}
