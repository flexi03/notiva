/** Wiki links ([[Target#Heading|Label]]) and #tags inside Markdown bodies. */

export interface WikiLink {
  target: string
  heading?: string
  label?: string
}

const WIKI_LINK = /\[\[([^[\]|#\n]+)(?:#([^[\]|\n]+))?(?:\|([^[\]\n]+))?\]\]/g
const TAG = /(^|[\s(,;])#([\p{L}_][\p{L}\p{N}_/-]*)/gu

/** Removes fenced code, inline code and HTML comments so links/tags inside code are ignored. */
export function stripCode(markdown: string): string {
  return markdown
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

export function parseWikiLink(inner: string): WikiLink {
  const [targetAndHeading = '', label] = inner.split('|', 2)
  const [target = '', heading] = targetAndHeading.split('#', 2)
  return {
    target: target.trim(),
    ...(heading?.trim() ? { heading: heading.trim() } : {}),
    ...(label?.trim() ? { label: label.trim() } : {}),
  }
}

export function extractWikiLinks(markdown: string): WikiLink[] {
  const links: WikiLink[] = []
  for (const match of stripCode(markdown).matchAll(WIKI_LINK)) {
    links.push({
      target: match[1]!.trim(),
      ...(match[2] ? { heading: match[2].trim() } : {}),
      ...(match[3] ? { label: match[3].trim() } : {}),
    })
  }
  return links
}

export function extractTags(markdown: string): string[] {
  const tags = new Set<string>()
  for (const match of stripCode(markdown).matchAll(TAG)) tags.add(match[2]!.toLowerCase())
  return [...tags]
}

/** Rewrites [[Old]] / [[Old#h|label]] links to point at `newTarget`, keeping headings and labels. */
export function renameWikiLinks(markdown: string, oldTarget: string, newTarget: string): string {
  const old = oldTarget.toLowerCase()
  return markdown.replace(WIKI_LINK, (full, target: string, heading?: string, label?: string) => {
    if (target.trim().toLowerCase() !== old) return full
    return `[[${newTarget}${heading ? `#${heading}` : ''}${label ? `|${label}` : ''}]]`
  })
}

export { WIKI_LINK as WIKI_LINK_PATTERN }
