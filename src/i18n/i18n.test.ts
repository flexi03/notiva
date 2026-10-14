import { de } from './de'
import { en } from './en'
import { setLanguage, t } from '.'

describe('i18n', () => {
  afterEach(() => setLanguage('de'))

  it('has the same keys in every language', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(de).sort())
  })

  it('uses the same placeholders in every language', () => {
    for (const key of Object.keys(de) as Array<keyof typeof de>) {
      const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort()
      expect(names(en[key]), key).toEqual(names(de[key]))
    }
  })

  it('translates with parameters', () => {
    expect(t('db.count', { count: 3 })).toBe('3 Einträge')
    setLanguage('en')
    expect(t('db.count', { count: 3 })).toBe('3 entries')
  })
})
