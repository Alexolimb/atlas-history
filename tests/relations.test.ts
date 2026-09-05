import { describe, it, expect } from 'vitest'
import { familyOf, hasFamily, rulersOf, neighboursOf, positionsOf, referencedIds } from '@/lib/relations'
import type { Library } from '@/lib/library'
import type { Entity, Relation } from '@/lib/types'

const rel = (prop: string, id: string, from?: number, to?: number): Relation => ({
  prop,
  id,
  ...(from !== undefined ? { from: { year: from, precision: 9 } } : {}),
  ...(to !== undefined ? { to: { year: to, precision: 9 } } : {}),
})

function lib(entities: Entity[], positions: Record<string, string> = {}): Library {
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    labels: new Map(entities.map((e) => [e.id, { name: e.id }])),
    positions: new Map(Object.entries(positions)),
    lang: 'ru',
    builtAt: '',
  }
}

const person = (id: string, relations: Relation[] = [], start?: number): Entity => ({
  id,
  type: 'person',
  fame: 10,
  relations,
  ...(start !== undefined ? { start: { year: start, precision: 9 } } : {}),
})

describe('лента правителей', () => {
  it('собирается из свойств самого государства', () => {
    const state: Entity = {
      id: 'Q159',
      type: 'state',
      fame: 400,
      relations: [rel('P35', 'Q7747', 2000, 2008), rel('P35', 'Q23530', 2008, 2012)],
    }
    const reigns = rulersOf(lib([state]), 'Q159')
    expect(reigns.map((r) => r.personId)).toEqual(['Q7747', 'Q23530'])
  })

  it('собирается из должностей людей, когда у государства списка нет', () => {
    // Так устроена вся древность: у Римской империи нет перечня императоров,
    // зато у каждого императора есть должность с датами.
    const rome: Entity = { id: 'Q2277', type: 'state', fame: 300, relations: [] }
    const augustus = person('Q1405', [rel('P39', 'Q842606', -27, 14)])
    const trajan = person('Q1425', [rel('P39', 'Q842606', 98, 117)])
    const library = lib([rome, augustus, trajan], { Q842606: 'Q2277' })

    const reigns = rulersOf(library, 'Q2277')
    expect(reigns.map((r) => r.personId)).toEqual(['Q1405', 'Q1425'])
    expect(reigns[0].positionId).toBe('Q842606')
  })

  it('идёт по возрастанию годов, а не в порядке из данных', () => {
    const state: Entity = {
      id: 'Q1',
      type: 'state',
      fame: 1,
      relations: [rel('P35', 'Q_late', 1900), rel('P35', 'Q_early', 1800), rel('P35', 'Q_mid', 1850)],
    }
    expect(rulersOf(lib([state]), 'Q1').map((r) => r.personId)).toEqual([
      'Q_early',
      'Q_mid',
      'Q_late',
    ])
  })

  it('без дат правитель не выкидывается, а уходит в конец', () => {
    const state: Entity = {
      id: 'Q1',
      type: 'state',
      fame: 1,
      relations: [rel('P35', 'Q_unknown'), rel('P35', 'Q_dated', 1800)],
    }
    const reigns = rulersOf(lib([state]), 'Q1')
    expect(reigns.map((r) => r.personId)).toEqual(['Q_dated', 'Q_unknown'])
  })

  it('один человек с двумя сроками показывается дважды — это не ошибка', () => {
    const state: Entity = {
      id: 'Q159',
      type: 'state',
      fame: 1,
      relations: [rel('P35', 'Q7747', 2000, 2008), rel('P35', 'Q7747', 2012, 2026)],
    }
    expect(rulersOf(lib([state]), 'Q159')).toHaveLength(2)
  })

  it('чужие должности в ленту не попадают', () => {
    const rome: Entity = { id: 'Q2277', type: 'state', fame: 1, relations: [] }
    const someone = person('Q9', [rel('P39', 'Q_french_king', 1600)])
    const library = lib([rome, someone], { Q_french_king: 'Q142' })
    expect(rulersOf(library, 'Q2277')).toEqual([])
  })
})

describe('семья', () => {
  const napoleon = person('Q517', [
    rel('P22', 'Q_father'),
    rel('P25', 'Q_mother'),
    rel('P26', 'Q_wife1'),
    rel('P26', 'Q_wife2'),
    rel('P40', 'Q_son'),
    rel('P3373', 'Q_brother'),
    rel('P53', 'Q_dynasty'),
    rel('P39', 'Q_emperor'),
  ])

  it('раскладывается по ролям', () => {
    const family = familyOf(napoleon)
    expect(family.parents).toEqual(['Q_father', 'Q_mother'])
    expect(family.spouses).toEqual(['Q_wife1', 'Q_wife2'])
    expect(family.children).toEqual(['Q_son'])
    expect(family.siblings).toEqual(['Q_brother'])
    expect(family.dynasty).toBe('Q_dynasty')
  })

  it('должность в семью не затесалась', () => {
    const family = familyOf(napoleon)
    const all = [...family.parents, ...family.spouses, ...family.children, ...family.siblings]
    expect(all).not.toContain('Q_emperor')
  })

  it('одинаковые родственники не двоятся', () => {
    const twice = person('Q1', [rel('P40', 'Q_son'), rel('P40', 'Q_son')])
    expect(familyOf(twice).children).toEqual(['Q_son'])
  })

  it('у одинокой карточки древо не рисуется', () => {
    expect(hasFamily(familyOf(person('Q1', [rel('P53', 'Q_dynasty')])))).toBe(false)
    expect(hasFamily(familyOf(napoleon))).toBe(true)
  })
})

describe('должности человека', () => {
  it('идут по возрастанию годов', () => {
    const p = person('Q1', [
      rel('P39', 'Q_late', 1804),
      rel('P39', 'Q_early', 1799),
      rel('P22', 'Q_father'),
    ])
    expect(positionsOf(p).map((r) => r.id)).toEqual(['Q_early', 'Q_late'])
  })
})

describe('соседи по времени', () => {
  it('что было до и что стало после', () => {
    const state: Entity = {
      id: 'Q159',
      type: 'state',
      fame: 1,
      relations: [rel('P1365', 'Q15180'), rel('P1366', 'Q_next')],
    }
    expect(neighboursOf(state)).toEqual({ before: ['Q15180'], after: ['Q_next'] })
  })
})

describe('что нужно догрузить для карточки', () => {
  it('в список попадают и связи, и государства их должностей', () => {
    const p = person('Q1', [rel('P39', 'Q_position'), rel('P22', 'Q_father')])
    const ids = referencedIds(p, lib([p], { Q_position: 'Q_state' }))
    expect(ids.sort()).toEqual(['Q_father', 'Q_position', 'Q_state'])
  })
})
