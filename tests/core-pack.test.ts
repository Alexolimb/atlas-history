// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { searchCore, nameOf, type Library } from '@/lib/library'
import { formatSpan, existsInYear, type CorePack, type Entity, type LabelPack } from '@/lib/types'

/**
 * Проверка НАСТОЯЩЕГО собранного справочника, а не выдуманных данных.
 * Ловит то, из-за чего человек прочитал бы неправду: пропавшие карточки,
 * съехавшие даты, поиск, который не находит очевидного.
 */

const CORE = resolve(process.cwd(), 'public', 'data', 'core')
const read = <T,>(name: string): T => JSON.parse(readFileSync(resolve(CORE, name), 'utf8')) as T

let lib: Library
let entities: Entity[]

beforeAll(() => {
  const pack = read<CorePack>('entities.json')
  const labels = read<LabelPack>('labels.ru.json')
  const positions = read<{ positions: Record<string, string> }>('positions.json')
  entities = pack.entities
  lib = {
    entities: new Map(entities.map((e) => [e.id, e])),
    labels: new Map(Object.entries(labels.labels)),
    positions: new Map(Object.entries(positions.positions)),
    lang: 'ru',
    builtAt: pack.builtAt,
  }
})

describe('собранный справочник', () => {
  it('в ядре есть чем пользоваться', () => {
    expect(entities.length).toBeGreaterThan(600)
  })

  it('государств и людей хватает на обе стороны справочника', () => {
    const byType = new Map<string, number>()
    for (const e of entities) byType.set(e.type, (byType.get(e.type) ?? 0) + 1)
    expect(byType.get('state') ?? 0).toBeGreaterThan(200)
    expect(byType.get('person') ?? 0).toBeGreaterThan(200)
    expect(byType.get('event') ?? 0).toBeGreaterThan(40)
  })

  it('почти у всех есть даты — иначе на ленту времени их не поставить', () => {
    const withDates = entities.filter((e) => e.start ?? e.end).length
    expect(withDates / entities.length).toBeGreaterThan(0.85)
  })

  it('ни одна карточка не заканчивается раньше, чем началась', () => {
    const broken = entities.filter((e) => e.start && e.end && e.end.year < e.start.year)
    expect(broken.map((e) => e.id)).toEqual([])
  })
})

describe('опорные факты', () => {
  const anchors: [string, string, number, number][] = [
    ['Q1048', 'Гай Юлий Цезарь', -100, -44],
    ['Q8409', 'Александр Македонский', -356, -323],
    ['Q517', 'Наполеон', 1769, 1821],
    ['Q15180', 'СССР', 1922, 1991],
    ['Q1747689', 'Древний Рим', -753, 476],
  ]

  for (const [id, hint, start, end] of anchors) {
    it(`${hint} (${id}) на месте и с верными датами`, () => {
      const entity = lib.entities.get(id)
      expect(entity, `${id} пропал из ядра`).toBeDefined()
      expect(entity?.start?.year).toBe(start)
      expect(entity?.end?.year).toBe(end)
      expect(nameOf(lib, id)).not.toBe(id)
    })
  }

  it('срок Древнего Рима пишется словами без «undefined»', () => {
    const rome = lib.entities.get('Q1747689')
    expect(formatSpan(rome!, 'ru')).toBe('753 до н. э. — 476')
  })

  it('в 100 году Древний Рим существовал, а СССР ещё нет', () => {
    expect(existsInYear(lib.entities.get('Q1747689')!, 100)).toBe(true)
    expect(existsInYear(lib.entities.get('Q15180')!, 100)).toBe(false)
    expect(existsInYear(lib.entities.get('Q15180')!, 1980)).toBe(true)
  })
})

describe('поиск по настоящим данным', () => {
  const cases: [string, string][] = [
    ['цезарь', 'Q1048'],
    ['наполеон', 'Q517'],
    ['ссср', 'Q15180'],
    ['македонский', 'Q8409'],
    ['франц', 'Q142'],
  ]

  for (const [query, expected] of cases) {
    it(`«${query}» находит ${expected}`, () => {
      expect(searchCore(lib, query).map((h) => h.id)).toContain(expected)
    })
  }

  it('всё найденное имеет имя, а не голый Q-номер', () => {
    for (const query of ['рим', 'война', 'король']) {
      for (const hit of searchCore(lib, query)) {
        expect(hit.name).not.toMatch(/^Q\d+$/)
      }
    }
  })
})

describe('связи читаемы', () => {
  it('у большинства связей есть имя — иначе древо покажет номера', () => {
    let total = 0
    let named = 0
    for (const e of entities) {
      for (const rel of e.relations) {
        total += 1
        if (lib.labels.has(rel.id)) named += 1
      }
    }
    expect(total).toBeGreaterThan(3000)
    expect(named / total).toBeGreaterThan(0.9)
  })

  it('должности привязаны к государствам, иначе лента правителей не соберётся', () => {
    expect(lib.positions.size).toBeGreaterThan(300)
  })

  it('у России находятся её правители через должности', () => {
    const rulers = entities.filter(
      (e) => e.type === 'person' && e.relations.some((r) => r.prop === 'P39' && lib.positions.get(r.id) === 'Q159'),
    )
    expect(rulers.length).toBeGreaterThan(2)
  })

  it('у Древнего Рима находятся его магистраты и императоры', () => {
    const romans = entities.filter(
      (e) =>
        e.type === 'person' &&
        e.relations.some((r) => r.prop === 'P39' && lib.positions.get(r.id) === 'Q1747689'),
    )
    expect(romans.length).toBeGreaterThan(5)
  })
})
