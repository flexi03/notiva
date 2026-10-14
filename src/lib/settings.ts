/** User settings, stored in `.notiva/settings.json` inside the vault (so they sync with it). */

export const ACCENTS = {
  tanne: { light: '#2f5d50', dark: '#86c1ad' },
  tinte: { light: '#2f4bb3', dark: '#94a8f0' },
  beere: { light: '#8c2f5c', dark: '#e59bbf' },
  kupfer: { light: '#9a4a1c', dark: '#eba57a' },
  schiefer: { light: '#3e4a5c', dark: '#aab6c8' },
} as const
export const MARKERS = {
  gelb: { light: '#f2d74e', dark: '#c9a92e' },
  mint: { light: '#9ee6c4', dark: '#3f9b74' },
  rosa: { light: '#f7b3cf', dark: '#b85d86' },
  blau: { light: '#a9d4f5', dark: '#4a87b8' },
} as const

export type AccentId = keyof typeof ACCENTS
export type MarkerId = keyof typeof MARKERS

export interface Settings {
  theme: 'system' | 'light' | 'dark'
  accent: AccentId
  marker: MarkerId
  font: 'sans' | 'serif' | 'mono'
  fontSize: number
  width: 'normal' | 'wide' | 'full'
  language: 'de' | 'en'
  spellcheck: boolean
  /** Save changes right away (default) – or only on ⌘S / „Speichern“. */
  autosave: boolean
  /** Save new/updated Moodle documents (scripts, slides …) into the vault automatically. */
  moodleAutoSave: boolean
  /** After each eCampus/Moodle check: update modules, semesters and courses of the study folder. */
  studyAutoSync: boolean
  /** Database entries and cards open in a side panel ("peek") or as a full page. */
  openEntries: 'peek' | 'page'
  /** Right edge of a page: minimap with reading progress, progress only, or nothing. */
  pageRail: 'minimap' | 'progress' | 'off'
  /** Folder for daily notes. */
  dailyFolder: string
  /** Extra CSS applied to the app (advanced customisation). */
  customCss: string
  favorites: string[]
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  accent: 'tanne',
  marker: 'gelb',
  font: 'sans',
  fontSize: 16,
  width: 'normal',
  language: 'de',
  spellcheck: true,
  autosave: true,
  moodleAutoSave: true,
  studyAutoSync: true,
  openEntries: 'peek',
  pageRail: 'minimap',
  dailyFolder: 'Tagesnotizen',
  customCss: '',
  favorites: [],
}

const pick = <T extends string>(options: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : fallback

/** Validates untrusted JSON; unknown keys are dropped, invalid values fall back to defaults. */
export function parseSettings(raw: unknown): Settings {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<
    string,
    unknown
  >
  const d = DEFAULT_SETTINGS
  return {
    theme: pick(['system', 'light', 'dark'] as const, r.theme, d.theme),
    accent: pick(Object.keys(ACCENTS) as AccentId[], r.accent, d.accent),
    marker: pick(Object.keys(MARKERS) as MarkerId[], r.marker, d.marker),
    font: pick(['sans', 'serif', 'mono'] as const, r.font, d.font),
    fontSize:
      typeof r.fontSize === 'number' && Number.isFinite(r.fontSize)
        ? Math.min(22, Math.max(13, Math.round(r.fontSize)))
        : d.fontSize,
    width: pick(['normal', 'wide', 'full'] as const, r.width, d.width),
    language: pick(['de', 'en'] as const, r.language, d.language),
    spellcheck: typeof r.spellcheck === 'boolean' ? r.spellcheck : d.spellcheck,
    autosave: typeof r.autosave === 'boolean' ? r.autosave : d.autosave,
    moodleAutoSave: typeof r.moodleAutoSave === 'boolean' ? r.moodleAutoSave : d.moodleAutoSave,
    studyAutoSync: typeof r.studyAutoSync === 'boolean' ? r.studyAutoSync : d.studyAutoSync,
    openEntries: pick(['peek', 'page'] as const, r.openEntries, d.openEntries),
    pageRail: pick(['minimap', 'progress', 'off'] as const, r.pageRail, d.pageRail),
    dailyFolder:
      typeof r.dailyFolder === 'string' && r.dailyFolder.trim() && !r.dailyFolder.includes('..')
        ? r.dailyFolder.trim()
        : d.dailyFolder,
    customCss: typeof r.customCss === 'string' ? sanitizeCss(r.customCss.slice(0, 20000)) : d.customCss,
    favorites: Array.isArray(r.favorites)
      ? r.favorites.filter((f): f is string => typeof f === 'string').slice(0, 100)
      : d.favorites,
  }
}

/**
 * Custom CSS may not load anything from outside (no tracking pixels / data exfiltration via url()
 * or @import). The Content-Security-Policy blocks this too; this is the second line of defence.
 */
export function sanitizeCss(css: string): string {
  return css
    .replace(/<\/?style[^>]*>/gi, '')
    .replace(/@import[^;]*;?/gi, '')
    .replace(/url\s*\(/gi, 'blocked(')
    .replace(/expression\s*\(/gi, 'blocked(')
    .replace(/javascript:/gi, '')
}

/** CSS custom properties for the chosen theme. */
export function themeVariables(settings: Settings, dark: boolean): Record<string, string> {
  const mode = dark ? 'dark' : 'light'
  const fonts = {
    sans: "'Atkinson Hyperlegible Next Variable', system-ui, sans-serif",
    serif: "'Source Serif 4 Variable', Georgia, serif",
    mono: "'JetBrains Mono Variable', ui-monospace, monospace",
  }
  return {
    '--accent': ACCENTS[settings.accent][mode],
    '--marker': MARKERS[settings.marker][mode],
    '--font-content': fonts[settings.font],
    '--content-size': `${settings.fontSize}px`,
    '--content-width': settings.width === 'normal' ? '46rem' : settings.width === 'wide' ? '64rem' : '100%',
  }
}
