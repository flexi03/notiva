/** Markdown → plain text for search and previews. No renderer needed (also used in Node, e.g. the MCP server). */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/^```[\s\S]*?^```/gm, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_m, t: string, l?: string) => l ?? t)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^\s*(#{1,6}|>|[-*+]\s\[[ xX]\]|[-*+]|\d+\.)\s*/gm, '')
    .replace(/[*_~`$]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A piece of text around the first search term (for result lists: pages, PDF pages). */
export function snippet(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  const index =
    terms
      .map((t) => lower.indexOf(t.toLowerCase()))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, index - 40)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 140)}${start + 140 < text.length ? '…' : ''}`
}
