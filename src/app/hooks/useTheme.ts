import { useEffect, useState } from 'react'
import { themeVariables, type Settings } from '@/lib/settings'

/** Applies theme, accent, fonts and custom CSS from settings to the document. */
export function useTheme(settings: Settings): void {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!query) return
    const onChange = () => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark)

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = dark ? 'dark' : 'light'
    for (const [key, value] of Object.entries(themeVariables(settings, dark)))
      root.style.setProperty(key, value)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#14171c' : '#f5f6f8')
  }, [settings, dark])

  useEffect(() => {
    let style = document.getElementById('notiva-custom-css') as HTMLStyleElement | null
    if (!settings.customCss) {
      style?.remove()
      return
    }
    if (!style) {
      style = document.createElement('style')
      style.id = 'notiva-custom-css'
      document.head.appendChild(style)
    }
    // textContent (not innerHTML): CSS is never parsed as markup.
    style.textContent = settings.customCss
  }, [settings.customCss])
}
