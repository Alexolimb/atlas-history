import { describe, it, expect } from 'vitest'
import { LANGUAGES, LANG_CODES, hasUi, isRtl, getLanguage } from '@/i18n/languages'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'

describe('список языков', () => {
  it('ровно 30 языков, как договорились', () => {
    expect(LANGUAGES).toHaveLength(30)
  })

  it('коды не повторяются', () => {
    expect(new Set(LANG_CODES).size).toBe(LANG_CODES.length)
  })

  it('интерфейс переведён на все тридцать', () => {
    expect(LANGUAGES.filter((l) => !l.uiReady)).toEqual([])
    expect(LANG_CODES.every((code) => hasUi(code))).toBe(true)
  })

  it('языки справа налево помечены', () => {
    expect(isRtl('ar')).toBe(true)
    expect(isRtl('he')).toBe(true)
    expect(isRtl('fa')).toBe(true)
    expect(isRtl('ru')).toBe(false)
  })

  it('несуществующий язык не считается переведённым', () => {
    expect(hasUi('нет-такого')).toBe(false)
  })

  it('getLanguage не выдумывает несуществующие языки', () => {
    expect(getLanguage('xx')).toBeUndefined()
  })
})

describe('переводы', () => {
  const keys = (obj: unknown, prefix = ''): string[] => {
    if (typeof obj !== 'object' || obj === null) return [prefix]
    return Object.entries(obj).flatMap(([k, v]) => keys(v, prefix ? `${prefix}.${k}` : k))
  }

  it('русский и английский описывают одно и то же — ни одной забытой строки', () => {
    const ruKeys = keys(ru).sort()
    const enKeys = keys(en).sort()
    expect(ruKeys).toEqual(enKeys)
  })

  it('ни одна строка не осталась пустой', () => {
    const empty = (obj: unknown, path = ''): string[] => {
      if (typeof obj === 'string') return obj.trim() ? [] : [path]
      if (typeof obj !== 'object' || obj === null) return []
      return Object.entries(obj).flatMap(([k, v]) => empty(v, path ? `${path}.${k}` : k))
    }
    expect(empty(ru)).toEqual([])
    expect(empty(en)).toEqual([])
  })
})
