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
