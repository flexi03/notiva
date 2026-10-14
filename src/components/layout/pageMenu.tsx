import { Copy, Download, GraduationCap, Pencil, Printer, Sparkles, Star, Trash2 } from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { useAssistant } from '@/app/assistant'
import { useApp } from '@/app/store'
import { findWidgets } from '@/lib/widgets'
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
  // Dashboards and databases: let the AI adapt them (the prompt is only prefilled, not sent).
  if (page && (page.database || findWidgets(page.body).length > 0))
    items.push({
      label: t('page.aiCustomize'),
      icon: <Sparkles size={14} />,
      onSelect: () => {
        useAssistant.getState().setDraft(customizePrompt(page.title, !!page.database))
        useApp.getState().openView('assistant')
      },
    })
  if (page && useMoodle.getState().status?.connected && findWidgets(page.body).length > 0)
    items.push({
      label: t('moodle.menu'),
      icon: <GraduationCap size={14} />,
      onSelect: () => useMoodle.getState().setImportOpen(true),
    })
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

export function customizePrompt(title: string, database: boolean): string {
  return t(database ? 'ai.customizeDatabase' : 'ai.customizeDashboard', { title })
}
