import { useState } from 'react'
import { t } from '@/i18n'
import { Button } from '@/components/ui'
import { ResizeHandle, useStoredWidth } from '@/components/layout/ResizeHandle'
import { WebPane } from './WebPane'

/**
 * A web page beside the content (PDF, code file): e.g. the lab's task page. Address remembered per
 * file; uses the browser session with the Microsoft/university sign-in.
 */
export function SideWeb({ storageKey, onClose }: { storageKey: string; onClose: () => void }) {
  const key = `notiva:side-web:${storageKey}`
  const [url, setUrlState] = useState<string | null>(() => {
    try {
      return localStorage.getItem(key) ?? localStorage.getItem('notiva:side-web:last')
    } catch {
      return null
    }
  })
  const [draft, setDraft] = useState('https://')
  const [width, setWidth] = useStoredWidth('side-web', 520, 280, 1400)
  const setUrl = (next: string) => {
    setUrlState(next)
    try {
      localStorage.setItem(key, next)
      localStorage.setItem('notiva:side-web:last', next)
    } catch {
      /* private mode */
    }
  }
  return (
    <div className="relative h-full shrink-0 border-l border-line" style={{ width }}>
      <ResizeHandle side="left" width={width} onResize={setWidth} label={t('web.title')} reset={520} />
      {url ? (
        <WebPane url={url} onNavigate={setUrl} onClose={onClose} />
      ) : (
        <form
          className="space-y-2 p-3"
          onSubmit={(e) => {
            e.preventDefault()
            const value = draft.trim()
            if (/^https?:\/\/\S+\.\S+/.test(value)) setUrl(value)
          }}
        >
          <label className="block text-sm font-semibold" htmlFor="side-web-url">
            {t('web.ask')}
          </label>
          <input
            id="side-web-url"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-8 w-full rounded-control border border-line bg-paper px-2 font-code text-[12.5px] focus:border-accent focus:outline-none"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="primary" type="submit">
              {t('web.open')}
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
