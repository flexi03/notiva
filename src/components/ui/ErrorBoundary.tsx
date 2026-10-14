import { Component, type ReactNode } from 'react'
import { t } from '@/i18n'

/**
 * Catches errors of one area (main view, side panel), so a single faulty component doesn't blank
 * the whole app. `resetKey` (e.g. the route) clears the error when the user moves on.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null; key?: string | undefined }
> {
  state: { error: Error | null; key?: string | undefined } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(
    props: { resetKey?: string },
    state: { error: Error | null; key?: string | undefined },
  ) {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey }
    return null
  }

  componentDidCatch(error: Error) {
    console.error('Notiva:', error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" className="m-4 rounded-panel border border-line bg-surface p-4 text-sm">
        <p className="font-semibold">{t('error.title')}</p>
        <p className="mt-1 font-code text-[12.5px] text-ink-3">{this.state.error.message}</p>
        <button
          type="button"
          className="mt-3 rounded-control border border-line px-3 py-1 hover:bg-hover"
          onClick={() => this.setState({ error: null })}
        >
          {t('error.retry')}
        </button>
      </div>
    )
  }
}
