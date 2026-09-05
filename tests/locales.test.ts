// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { LANGUAGES, LANG_CODES } from '@/i18n/languages'
import ru from '@/i18n/locales/ru.json'

/**
 * Проверка тридцати языков интерфейса.
 *
 * Забытый ключ не падает, а печатает на экране сам ключ — «settings.sub».
 * На двух языках это ловится глазами, на тридцати уже нет. Поэтому каждый
 * файл сверяется с русским: тот же набор ключей, ни одной пустой строки,
 * все подстановки вида {{count}} на месте.
 */

const DIR = resolve(process.cwd(), 'public', 'locales')
const EXTRA = LANG_CODES.filter((code) => code !== 'ru' && code !== 'en')

/** Все ключи в виде «settings.theme.dark». */
function keysOf(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  return Object.entries(obj).flatMap(([k, v]) => keysOf(v, prefix ? `${prefix}.${k}` : k))
}

/** Подстановки {{…}} внутри строки. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort()
}

function flatten(obj: unknown, prefix = '', out: Record<string, string> = {}) {
  if (typeof obj === 'string') {
    out[prefix] = obj
    return out
  }
  if (typeof obj !== 'object' || obj === null) return out
  for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out)
  return out
}

const ruKeys = keysOf(ru).sort()
const ruFlat = flatten(ru)

describe('файлы языков', () => {
  it('у всех тридцати языков помечено, что интерфейс переведён', () => {
    expect(LANGUAGES.filter((l) => !l.uiReady)).toEqual([])
  })

  it('на диске лежат все 28 дополнительных языков', () => {
    const onDisk = readdirSync(DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace('.json', ''))
      .sort()
    expect(onDisk).toEqual([...EXTRA].sort())
  })

  it('лишних файлов нет: каждый лежащий язык есть в списке приложения', () => {
    for (const file of readdirSync(DIR)) {
      const code = file.replace('.json', '')
      expect(LANG_CODES, `${file} не значится в списке языков`).toContain(code)
    }
  })
})

describe.each(EXTRA)('перевод: %s', (code) => {
  const path = resolve(DIR, `${code}.json`)

  it('файл на месте и читается', () => {
    expect(existsSync(path)).toBe(true)
    expect(() => JSON.parse(readFileSync(path, 'utf8'))).not.toThrow()
  })

  it('набор ключей совпадает с русским — ни одного забытого и ни одного лишнего', () => {
    const table = JSON.parse(readFileSync(path, 'utf8')) as unknown
    expect(keysOf(table).sort()).toEqual(ruKeys)
  })

  it('ни одной пустой строки', () => {
    const flat = flatten(JSON.parse(readFileSync(path, 'utf8')))
    const empty = Object.entries(flat)
      .filter(([, v]) => !v.trim())
      .map(([k]) => k)
    expect(empty).toEqual([])
  })

  it('подстановки на месте: {{count}} и прочие не потерялись при переводе', () => {
    const flat = flatten(JSON.parse(readFileSync(path, 'utf8')))
    const broken: string[] = []
    for (const [key, value] of Object.entries(ruFlat)) {
      const mine = flat[key]
      if (mine === undefined) continue
      if (placeholders(value).join(',') !== placeholders(mine).join(',')) broken.push(key)
    }
    expect(broken).toEqual([])
  })

  it('перевод не остался русским текстом', () => {
    const flat = flatten(JSON.parse(readFileSync(path, 'utf8')))
    // Кириллицу законно используют только русский и украинский.
    if (code === 'uk') return
    const cyrillic = Object.entries(flat)
      .filter(([, v]) => /[а-яё]{4,}/i.test(v))
      .map(([k]) => k)
    expect(cyrillic).toEqual([])
  })
})
