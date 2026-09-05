import { describe, it, expect } from 'vitest'
import {
  formatHistDate,
  formatSpan,
  existsInYear,
  wikidataUrl,
  wikipediaUrl,
  commonsImageUrl,
  type HistDate,
} from '@/lib/types'

const d = (year: number, precision = 9, month?: number, day?: number): HistDate => ({
  year,
  precision,
  ...(month ? { month } : {}),
  ...(day ? { day } : {}),
})

describe('даты человеческими словами', () => {
  it('обычный год', () => {
    expect(formatHistDate(d(1789), 'ru')).toBe('1789')
  })

  it('до нашей эры подписывается', () => {
    expect(formatHistDate(d(-44), 'ru')).toBe('44 до н. э.')
    expect(formatHistDate(d(-44), 'en')).toBe('44 BC')
  })

  it('точная дата с днём', () => {
    expect(formatHistDate(d(1789, 11, 7, 14), 'ru')).toBe('14 июля 1789')
    expect(formatHistDate(d(1789, 11, 7, 14), 'en')).toBe('July 14, 1789')
  })

  it('неточность не выдаётся за точность: век остаётся веком', () => {
    expect(formatHistDate(d(-500, 7), 'ru')).toBe('5 век до н. э.')
    expect(formatHistDate(d(1200, 7), 'ru')).toBe('12 век')
  })

  it('десятилетие', () => {
    expect(formatHistDate(d(1920, 8), 'ru')).toBe('1920-е')
  })

  it('тысячелетие для самой глубокой древности', () => {
    expect(formatHistDate(d(-3000, 6), 'ru')).toBe('3-е тысячелетие до н. э.')
  })

  it('пустая дата — пустая строка, а не «undefined» на экране', () => {
    expect(formatHistDate(undefined, 'ru')).toBe('')
  })
})

describe('срок существования', () => {
  it('от и до', () => {
    expect(formatSpan({ start: d(-753), end: d(476) }, 'ru')).toBe('753 до н. э. — 476')
  })

  it('только начало — «с»', () => {
    expect(formatSpan({ start: d(1991) }, 'ru')).toBe('с 1991')
  })

  it('ничего не известно — ничего и не пишем', () => {
    expect(formatSpan({}, 'ru')).toBe('')
  })
})

describe('существовало ли в этот год', () => {
  const rome = { start: d(-753), end: d(476) }

  it('внутри срока', () => {
    expect(existsInYear(rome, 100)).toBe(true)
    expect(existsInYear(rome, -753)).toBe(true)
    expect(existsInYear(rome, 476)).toBe(true)
  })

  it('снаружи срока', () => {
    expect(existsInYear(rome, -800)).toBe(false)
    expect(existsInYear(rome, 500)).toBe(false)
  })

  it('ещё существует: конца нет', () => {
    expect(existsInYear({ start: d(1991) }, 2026)).toBe(true)
    expect(existsInYear({ start: d(1991) }, 1980)).toBe(false)
  })

  it('без дат вовсе на карту не попадает', () => {
    expect(existsInYear({}, 1500)).toBe(false)
  })
})

describe('ссылки на источники', () => {
  it('карточка Wikidata', () => {
    expect(wikidataUrl('Q1048')).toBe('https://www.wikidata.org/wiki/Q1048')
  })

  it('статья Википедии с пробелами в названии', () => {
    expect(wikipediaUrl('ru', 'Древний Рим')).toBe(
      'https://ru.wikipedia.org/wiki/%D0%94%D1%80%D0%B5%D0%B2%D0%BD%D0%B8%D0%B9_%D0%A0%D0%B8%D0%BC',
    )
  })

  it('картинка с Викисклада уменьшается по ширине', () => {
    expect(commonsImageUrl('Caesar.jpg', 320)).toContain('width=320')
  })
})

describe('даты на остальных 28 языках', () => {
  it('японский пишет «до нашей эры» по-своему, а не по-английски', () => {
    const out = formatHistDate(d(-44, 11, 3, 15), 'ja')
    expect(out).toContain('紀元前')
    expect(out).not.toContain('BC')
  })

  it('арабский и иврит тоже получают свою эру', () => {
    expect(formatHistDate(d(-44), 'ar')).toContain('ق.م')
    expect(formatHistDate(d(-44), 'he')).toContain('לפנה')
  })

  it('тайский показывает год нашей эры, а не буддийский', () => {
    // По умолчанию тайская локаль прибавляет 543 года. Для приложения,
    // где всюду «−44» и «1789», это выглядело бы как ошибка в данных.
    expect(formatHistDate(d(1789), 'th')).toContain('1789')
    expect(formatHistDate(d(1789), 'th')).not.toContain('2332')
  })

  it('цифры везде обычные, а не местные', () => {
    for (const lang of ['ar', 'fa', 'hi', 'bn', 'th']) {
      expect(formatHistDate(d(1789), lang), lang).toMatch(/1789/)
    }
  })

  it('неточная дата помечается «примерно», а не выдаётся за точную', () => {
    expect(formatHistDate(d(-3000, 6), 'de')).toContain('≈')
    expect(formatHistDate(d(1789), 'de')).not.toContain('≈')
  })

  it('неизвестный язык не роняет экран', () => {
    expect(formatHistDate(d(1789), 'нет-такого')).toBeTruthy()
  })

  it('год без месяца не выдумывает январь', () => {
    const out = formatHistDate(d(1789), 'ja')
    expect(out).toContain('1789')
    expect(out).not.toContain('1月')
  })
})
