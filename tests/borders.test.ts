// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { nearestYear, colorForCountry, yearLabel, type BordersIndex } from '@/lib/borders'

/**
 * Проверка настоящих карт границ. Ловит то, из-за чего глобус либо соврёт,
 * либо встанет: пропавшие срезы, пустые карты, раздутые файлы,
 * бессмысленные подписи.
 */

const DIR = resolve(process.cwd(), 'public', 'data', 'borders')
let index: BordersIndex

beforeAll(() => {
  index = JSON.parse(readFileSync(resolve(DIR, 'index.json'), 'utf8')) as BordersIndex
})

describe('срезы карт', () => {
  it('их достаточно, чтобы ползунок был осмысленным', () => {
    expect(index.years.length).toBeGreaterThanOrEqual(50)
  })

  it('годы идут по возрастанию и не повторяются', () => {
    const years = index.years.map((y) => y.year)
    expect([...years].sort((a, b) => a - b)).toEqual(years)
    expect(new Set(years).size).toBe(years.length)
  })

  it('охватывают весь заявленный размах — от глубокой древности до наших дней', () => {
    expect(index.years[0].year).toBeLessThanOrEqual(-8000)
    expect(index.years.at(-1)!.year).toBeGreaterThanOrEqual(2000)
  })

  it('указан источник и лицензия — иначе картами пользоваться нельзя', () => {
    expect(index.source).toContain('historical-basemaps')
    expect(index.licence).toBe('GPL-3.0')
  })

  it('каждая карта лежит на диске и укладывается в бюджет', () => {
    for (const row of index.years) {
      const path = resolve(DIR, row.file)
      expect(existsSync(path), `нет файла ${row.file}`).toBe(true)
      expect(row.kb, `${row.file} слишком тяжёлая`).toBeLessThan(260)
      expect(row.features, `${row.file} пустая`).toBeGreaterThan(0)
    }
  })
})

describe('содержимое карт', () => {
  const load = (year: number) =>
    JSON.parse(readFileSync(resolve(DIR, `${year}.json`), 'utf8')) as {
      features: { properties: { name: string; subjectTo?: string }; geometry: unknown }[]
    }

  it('в год −1 на карте есть Римская империя', () => {
    const names = load(-1).features.map((f) => f.properties.name)
    expect(names).toContain('Roman Empire')
  })

  it('в 1938 году карта уже про современные государства', () => {
    const names = load(1938).features.map((f) => f.properties.name)
    expect(names.some((n) => /germany|france|soviet/i.test(n))).toBe(true)
  })

  it('«в подчинении» указывает на ДРУГУЮ страну, а не на себя', () => {
    for (const year of [-1, 500, 1500, 1914]) {
      for (const feature of load(year).features) {
        const { name, subjectTo } = feature.properties
        if (subjectTo) expect(subjectTo, `${year}: ${name}`).not.toBe(name)
      }
    }
  })

  it('у каждой страны есть имя и геометрия', () => {
    for (const feature of load(1500).features) {
      expect(feature.properties.name.trim().length).toBeGreaterThan(0)
      expect(feature.geometry).toBeTruthy()
    }
  })

  it('на диске нет лишних карт, о которых не знает список', () => {
    const onDisk = readdirSync(DIR)
      .filter((f) => /^-?\d+\.json$/.test(f))
      .sort()
    const listed = index.years.map((y) => y.file).sort()
    expect(onDisk).toEqual(listed)
  })
})

describe('вспомогательное', () => {
  it('ближайший срез находится в обе стороны', () => {
    expect(nearestYear(index, 1939)).toBe(1938)
    expect(nearestYear(index, -9999)).toBe(-10000)
    expect(nearestYear(index, 3000)).toBe(index.years.at(-1)!.year)
  })

  it('цвет страны не меняется от года к году', () => {
    expect(colorForCountry('Roman Empire')).toBe(colorForCountry('Roman Empire'))
    expect(colorForCountry('Roman Empire')).not.toBe(colorForCountry('Parthia'))
  })

  it('подпись года честно говорит про эру', () => {
    expect(yearLabel(-500, 'ru')).toBe('500 до н. э.')
    expect(yearLabel(-500, 'en')).toBe('500 BC')
    expect(yearLabel(1914, 'ru')).toBe('1914')
  })
})
