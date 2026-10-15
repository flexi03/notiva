import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, RotateCw, X } from 'lucide-react'
import { useMoodle } from '@/app/moodle'
import { t } from '@/i18n'
import { electronBridge } from '@/lib/vault'
import { IconButton } from '@/components/ui'

interface WebviewElement extends HTMLElement {
  src: string
  goBack(): void
  goForward(): void
  reload(): void
  getURL(): string
}

/**
 * A web page next to the terminal (e.g. the task page of a lab). Runs sandboxed in its own session
 * without access to Notiva; Moodle pages use the Moodle session (university login).
 */
export function WebPane({
  url,
  onNavigate,
  onClose,
}: {
  url: string
  onNavigate: (url: string) => void
  onClose: () => void
}) {
  const ref = useRef<WebviewElement | null>(null)
  const [address, setAddress] = useState(url)
  const site = useMoodle((s) => s.status?.site)
  const moodle = (() => {
    try {
      return !!site && new URL(url).origin === new URL(site).origin
    } catch {
      return false
    }
  })()
  useEffect(() => {
    const view = ref.current
    if (!view) return
    const update = () => {
      const current = view.getURL()
      setAddress(current)
      onNavigate(current)
    }
    view.addEventListener('did-navigate', update)
    view.addEventListener('did-navigate-in-page', update)
    return () => {
      view.removeEventListener('did-navigate', update)
      view.removeEventListener('did-navigate-in-page', update)
    }
  }, [onNavigate])
  const go = (value: string) => {
    const next = /^https?:\/\//i.test(value) ? value : `https://${value}`
    if (ref.current) ref.current.src = next
  }
  return (
    <section aria-label={t('web.title')} className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex min-h-8 shrink-0 flex-wrap items-center gap-x-1 border-b border-line px-2">
        <IconButton size="sm" label={t('nav.back')} onClick={() => ref.current?.goBack()}>
          <ArrowLeft size={14} />
        </IconButton>
        <IconButton size="sm" label={t('nav.forward')} onClick={() => ref.current?.goForward()}>
          <ArrowRight size={14} />
        </IconButton>
        <IconButton size="sm" label={t('web.reload')} onClick={() => ref.current?.reload()}>
          <RotateCw size={14} />
        </IconButton>
        <form
          className="min-w-24 flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            go(address)
          }}
        >
          <input
            aria-label={t('web.address')}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            spellCheck={false}
            className="h-6 w-full rounded-control border border-line bg-paper px-2 font-code text-[12px] focus:border-accent focus:outline-none"
          />
        </form>
        <IconButton
          size="sm"
          label={t('web.external')}
          onClick={() => void electronBridge()?.openExternal(address)}
        >
          <ExternalLink size={14} />
        </IconButton>
        <IconButton size="sm" label={t('web.close')} onClick={onClose}>
          <X size={14} />
        </IconButton>
      </header>
      <webview
        ref={ref as never}
        src={url}
        partition={moodle ? 'persist:moodle' : 'persist:web'}
        className="min-h-0 flex-1"
        data-testid="webpane"
      />
    </section>
  )
}
