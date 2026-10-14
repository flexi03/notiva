import { de, type MessageKey } from './de'
import { en } from './en'

export type Language = 'de' | 'en'
export type { MessageKey }

const DICTIONARIES: Record<Language, Record<MessageKey, string>> = { de, en }
let current: Language = 'de'

export function setLanguage(language: Language): void {
  current = language
  if (typeof document !== 'undefined') document.documentElement.lang = language
}

export function getLanguage(): Language {
  return current
}

/** Translates a key; `{name}` placeholders are replaced with params. */
export function t(key: MessageKey, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[current][key] ?? de[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (full, name: string) =>
    name in params ? String(params[name]) : full,
  )
}
