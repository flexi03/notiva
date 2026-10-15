/** Version from package.json (set by vite.config.ts). */
declare const __APP_VERSION__: string

/** Electron's <webview> (desktop app only; locked down in the main process). */
declare namespace React.JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string
      partition?: string
    }
  }
}
