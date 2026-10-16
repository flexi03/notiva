import { useApp, useAction } from '@/app/store'
import { t } from '@/i18n'
import type { Workspace } from '@/lib/workspace'
import { basename } from '@/lib/path'

/** Shared page operations (sidebar menu, topbar menu, keyboard shortcuts). */
export function usePageActions(ws: Workspace) {
  const { openPage, navigate, showToast, updateSettings, settings, route, ask, peek, closePeek } = useApp()
  const run = useAction()
  /** Keeps the open page and the side panel on a page that was renamed or moved. */
  const follow = (from: string, to: string) => {
    if (route.name === 'page' && route.path === from) openPage(to)
    if (peek === from) useApp.setState({ peek: to })
  }

  const api = {
    async createPage(folder = '', title = t('page.untitled'), body = '') {
      const path = await run(() => ws.createPage({ folder, title, body }))
      if (path) openPage(path)
      return path
    },
    async rename(path: string, title: string) {
      const next = await run(() => ws.rename(path, title))
      if (next) follow(path, next)
      return next
    },
    async askRename(path: string, current: string) {
      const title = await ask({
        title: t('page.rename'),
        label: t('common.name'),
        initial: current,
        confirmLabel: t('common.save'),
      })
      if (title?.trim() && title.trim() !== current) return api.rename(path, title.trim())
      return undefined
    },
    async duplicate(path: string) {
      const next = await run(() => ws.duplicate(path))
      if (next) openPage(next)
    },
    async trash(path: string) {
      const title = ws.get(path)?.title ?? path
      const entry = await run(() => ws.trash(path))
      if (!entry) return
      if (route.name === 'page' && (route.path === path || route.path.startsWith(`${path.slice(0, -3)}/`)))
        navigate({ name: 'home' })
      if (peek === path) closePeek()
      showToast(t('page.deleted', { title }), {
        label: t('page.undo'),
        run: () => void run(() => ws.restore(entry.id)).then((p) => p && openPage(p)),
      })
    },
    async moveTo(path: string, folder: string) {
      const next = await run(() => ws.moveTo(path, folder))
      if (next) follow(path, next)
    },
    isFavorite: (path: string) => settings.favorites.includes(path),
    toggleFavorite(path: string) {
      const favorites = settings.favorites.includes(path)
        ? settings.favorites.filter((f) => f !== path)
        : [...settings.favorites, path]
      updateSettings({ favorites })
    },
    async exportMarkdown(path: string) {
      const text = await ws.vault.read(path)
      const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
      const a = document.createElement('a')
      a.href = url
      a.download = basename(path)
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    async openToday() {
      const today = new Date()
      // The local day (toISOString is UTC: after midnight it was still yesterday).
      const title = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
      const folder = settings.dailyFolder
      const existing = `${folder}/${title}.md`
      if (ws.get(existing)) return openPage(existing)
      const weekday = today.toLocaleDateString(settings.language === 'de' ? 'de-DE' : 'en-US', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      })
      const path = await run(() =>
        ws.createPage({
          folder,
          title,
          data: { icon: '📅', tags: ['tagesnotiz'] },
          body: `> [!info] ${weekday}\n\n- [ ] \n`,
        }),
      )
      if (path) openPage(path)
    },
  }
  return api
}
