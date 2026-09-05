import { describe, it, expect } from 'vitest'
import ru from '@/i18n/locales/ru.json'
import en from '@/i18n/locales/en.json'

/**
 * Экран берёт заголовок как `${ns}.kicker/title/sub`. Забытый ключ не падает,
 * а тихо рисует на странице «settings.sub» — именно так и случилось при первом
 * прогоне части 0. Этот тест ловит такое до сборки.
 */
const SCREEN_NAMESPACES = ['globe', 'path', 'reference', 'review', 'profile', 'settings', 'sources']
const HEAD_KEYS = ['kicker', 'title', 'sub'] as const

describe('шапки экранов', () => {
  for (const [name, dict] of [
    ['ru', ru],
    ['en', en],
  ] as const) {
    it(`${name}: у каждого экрана есть надзаголовок, заголовок и подпись`, () => {
      const missing: string[] = []
      for (const ns of SCREEN_NAMESPACES) {
        const section = (dict as Record<string, unknown>)[ns]
        for (const key of HEAD_KEYS) {
          const value = (section as Record<string, unknown> | undefined)?.[key]
          if (typeof value !== 'string' || !value.trim()) missing.push(`${ns}.${key}`)
        }
      }
      expect(missing).toEqual([])
    })
  }
})

describe('ключи, на которые смотрит каркас', () => {
  const paths = [
    'app.name',
    'nav.globe',
    'nav.path',
    'nav.reference',
    'nav.review',
    'nav.settings',
    'common.soon',
    'common.soonHint',
    'common.offline',
    'common.updateReady',
    'common.updateAction',
    'settings.language.title',
    'settings.theme.dark',
    'settings.theme.light',
    'settings.theme.system',
    'settings.text.small',
    'settings.text.normal',
    'settings.text.large',
    'settings.progress.save',
    'settings.progress.load',
    'settings.progress.reset',
    'settings.progress.resetConfirm',
    'settings.about.sources',
    'settings.about.version',
  ]

  const dig = (dict: unknown, path: string) =>
    path.split('.').reduce<unknown>((acc, part) => {
      if (typeof acc !== 'object' || acc === null) return undefined
      return (acc as Record<string, unknown>)[part]
    }, dict)

  for (const [name, dict] of [
    ['ru', ru],
    ['en', en],
  ] as const) {
    it(`${name}: ни один ключ интерфейса не потерян`, () => {
      const missing = paths.filter((p) => typeof dig(dict, p) !== 'string')
      expect(missing).toEqual([])
    })
  }
})
