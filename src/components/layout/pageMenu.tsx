import { Copy, Download, Pencil, Printer, Star, Trash2 } from 'lucide-react'
import { t } from '@/i18n'
import type { Workspace } from '@/lib/workspace'
import type { MenuItem } from '@/components/ui'
import type { usePageActions } from '@/app/hooks/usePageActions'

/** The one page menu used everywhere (sidebar, topbar), so actions stay consistent. */
export function pageMenuItems(
  path: string,
  ws: Workspace,
  actions: ReturnType<typeof usePageActions>,
  extra: { onRename?: () => void; print?: boolean } = {},
): Array<MenuItem | 'divider'> {
  const page = ws.get(path)
  const items: Array<MenuItem | 'divider'> = [
    {
      label: actions.isFavorite(path) ? t('page.unfavorite') : t('page.favorite'),
      icon: <Star size={14} />,
      onSelect: () => actions.toggleFavorite(path),
    },
    {
      label: t('page.rename'),
      icon: <Pencil size={14} />,
      onSelect: () => {
        if (extra.onRename) return extra.onRename()
        void actions.askRename(path, page?.title ?? '')
      },
    },
    { label: t('page.duplicate'), icon: <Copy size={14} />, onSelect: () => void actions.duplicate(path) },
    {
      label: t('page.export'),
      icon: <Download size={14} />,
      onSelect: () => void actions.exportMarkdown(path),
    },
  ]
  if (extra.print)
    items.push({ label: t('page.print'), icon: <Printer size={14} />, onSelect: () => window.print() })
  items.push('divider', {
    label: t('page.delete'),
    icon: <Trash2 size={14} />,
    danger: true,
    onSelect: () => void actions.trash(path),
  })
  return items
}
