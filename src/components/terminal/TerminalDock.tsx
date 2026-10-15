import { useState } from 'react'
import { Columns2, Globe, Rows2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { WebPane } from './WebPane'
import { t } from '@/i18n'
import { IconButton } from '@/components/ui'
import { TerminalPanel } from './TerminalPanel'

type Layout = string[][]

/** Terminals of one folder like in VS Code: rows below each other, up to two side by side per row. */
export function TerminalDock({
  folder,
  onSave,
  onClose,
}: {
  folder: string
  onSave?: (text: string) => void
  onClose: () => void
}) {
  const storage = `notiva:terminals:${folder}`
  const [layout, setLayoutState] = useState<Layout>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storage) ?? 'null') as unknown
      if (Array.isArray(saved) && saved.every((r) => Array.isArray(r) && r.length && r.length <= 2))
        return saved as Layout
    } catch {
      /* private mode */
    }
    return [['1']]
  })
  const setLayout = (next: Layout) => {
    setLayoutState(next)
    try {
      localStorage.setItem(storage, JSON.stringify(next))
    } catch {
      /* private mode */
    }
  }
  // Panes: "3" = terminal 3, "w3" = web page 3 (its address is remembered per folder).
  const fresh = () => String(Math.max(0, ...layout.flat().map((p) => Number(p.replace(/^w/, '')))) + 1)
  const urlKey = `notiva:web:${folder}`
  const [urls, setUrls] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem(urlKey) ?? '{}') as Record<string, string>
    } catch {
      return {}
    }
  })
  const setUrl = (pane: string, url: string) => {
    const next = { ...urls, [pane]: url, last: url }
    setUrls(next)
    try {
      localStorage.setItem(urlKey, JSON.stringify(next))
    } catch {
      /* private mode */
    }
  }
  const openWeb = async (r: number) => {
    const url = await useApp.getState().ask({
      title: t('web.ask'),
      initial: urls.last ?? 'https://',
      confirmLabel: t('web.open'),
    })
    const raw = url?.trim() ?? ''
    const full = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
    try {
      if (!raw || !new URL(full).hostname.includes('.')) return
    } catch {
      return
    }
    const pane = `w${fresh()}`
    setUrl(pane, full)
    const row = layout[r]!
    setLayout(row.length < 2 ? layout.map((x, i) => (i === r ? [...x, pane] : x)) : [...layout, [pane]])
  }
  const close = (pane: string) => {
    const next = layout.map((r) => r.filter((p) => p !== pane)).filter((r) => r.length)
    if (next.length) setLayout(next)
    else {
      setLayout([['1']])
      onClose()
    }
  }
  return (
    <div className="flex h-full min-h-0 flex-col divide-y divide-line">
      {layout.map((row, r) => (
        <div key={row.join('-')} className="flex min-h-0 flex-1 divide-x divide-line">
          {row.map((pane) =>
            pane.startsWith('w') ? (
              <div key={pane} className="min-w-0 flex-1">
                <WebPane
                  url={urls[pane] ?? urls.last ?? 'about:blank'}
                  onNavigate={(u) => setUrl(pane, u)}
                  onClose={() => close(pane)}
                />
              </div>
            ) : (
              <div key={pane} className="min-w-0 flex-1">
                <TerminalPanel
                  sessionKey={`${folder}#${pane}`}
                  folder={folder}
                  {...(onSave ? { onSave } : {})}
                  onClose={() => close(pane)}
                  actions={
                    <>
                      {row.length < 2 && (
                        <IconButton
                          size="sm"
                          label={t('terminal.splitRight')}
                          onClick={() => setLayout(layout.map((x, i) => (i === r ? [...x, fresh()] : x)))}
                        >
                          <Columns2 size={14} />
                        </IconButton>
                      )}
                      <IconButton size="sm" label={t('web.open')} onClick={() => void openWeb(r)}>
                        <Globe size={14} />
                      </IconButton>
                      <IconButton
                        size="sm"
                        label={t('terminal.newBelow')}
                        onClick={() =>
                          setLayout([...layout.slice(0, r + 1), [fresh()], ...layout.slice(r + 1)])
                        }
                      >
                        <Rows2 size={14} />
                      </IconButton>
                    </>
                  }
                />
              </div>
            ),
          )}
        </div>
      ))}
    </div>
  )
}
