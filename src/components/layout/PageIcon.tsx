import { FileText, Folder, Table2 } from 'lucide-react'
import type { Page } from '@/lib/workspace'

/** Emoji icon from frontmatter, or a type icon. */
export function PageIcon({ page, size = 16 }: { page: Page | null; size?: number }) {
  if (page?.icon)
    return (
      <span
        aria-hidden
        className="inline-flex w-[1.25em] justify-center leading-none"
        style={{ fontSize: size }}
      >
        {page.icon}
      </span>
    )
  const Icon = !page ? Folder : page.database ? Table2 : FileText
  return <Icon aria-hidden size={size} className="shrink-0 text-ink-3" />
}
