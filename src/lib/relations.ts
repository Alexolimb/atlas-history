import type { Entity, HistDate, Relation } from './types'
import type { Library } from './library'

/**
 * Превращение сырых связей Wikidata в то, что человеку понятно:
 * лента правителей страны, семейное древо, соседи по времени.
 *
 * Вся сортировка идёт по датам, а не по порядку в данных: в Wikidata
 * утверждения лежат как попало, и «лента правителей» без сортировки
 * выглядит случайным списком.
 */

export const RELATION_PROPS = {
  father: 'P22',
  mother: 'P25',
  spouse: 'P26',
  child: 'P40',
  sibling: 'P3373',
  position: 'P39',
  headOfState: 'P35',
  headOfGovernment: 'P6',
  monarch: 'P1830',
  replaces: 'P1365',
  replacedBy: 'P1366',
  dynasty: 'P53',
  country: 'P17',
  partOf: 'P361',
  participant: 'P710',
} as const

/** Одна строка ленты правителей. */
export interface Reign {
  personId: string
  /** Должность, если известна: «римский император», «президент России». */
  positionId?: string
  from?: HistDate
  to?: HistDate
}

/**
 * Кто правил этим государством.
 *
 * Два источника, потому что Wikidata описывает это по-разному:
 *   · у современных стран список глав лежит на самой стране (P35/P6);
 *   · у древних — наоборот, у каждого человека висит должность (P39),
 *     привязанная к государству. У Римской империи нет списка императоров,
 *     зато у каждого императора есть должность «римский император».
 * Берём оба и склеиваем, иначе половина мира останется без правителей.
 */
export function rulersOf(lib: Library, stateId: string): Reign[] {
  const found = new Map<string, Reign>()

  const state = lib.entities.get(stateId)
  if (state) {
    for (const rel of state.relations) {
      if (rel.prop !== RELATION_PROPS.headOfState && rel.prop !== RELATION_PROPS.headOfGovernment && rel.prop !== RELATION_PROPS.monarch) {
        continue
      }
      add(found, { personId: rel.id, from: rel.from, to: rel.to })
    }
  }

  for (const entity of lib.entities.values()) {
    if (entity.type !== 'person') continue
    for (const rel of entity.relations) {
      if (rel.prop !== RELATION_PROPS.position) continue
      if (lib.positions.get(rel.id) !== stateId) continue
      add(found, { personId: entity.id, positionId: rel.id, from: rel.from, to: rel.to })
    }
  }

  return [...found.values()].sort(byStart)
}

function add(map: Map<string, Reign>, reign: Reign) {
  const key = `${reign.personId}|${reign.from?.year ?? ''}|${reign.to?.year ?? ''}`
  const existing = map.get(key)
  // Запись с известной должностью полезнее безымянной — она её вытесняет.
  if (!existing || (!existing.positionId && reign.positionId)) map.set(key, reign)
}

function byStart(a: Reign, b: Reign): number {
  const ay = a.from?.year ?? a.to?.year ?? Number.POSITIVE_INFINITY
  const by = b.from?.year ?? b.to?.year ?? Number.POSITIVE_INFINITY
  return ay - by
}

/** Семья человека, разложенная по ролям. */
export interface Family {
  parents: string[]
  spouses: string[]
  children: string[]
  siblings: string[]
  dynasty?: string
}

export function familyOf(entity: Entity): Family {
  const family: Family = { parents: [], spouses: [], children: [], siblings: [] }
  for (const rel of entity.relations) {
    switch (rel.prop) {
      case RELATION_PROPS.father:
      case RELATION_PROPS.mother:
        pushUnique(family.parents, rel.id)
        break
      case RELATION_PROPS.spouse:
        pushUnique(family.spouses, rel.id)
        break
      case RELATION_PROPS.child:
        pushUnique(family.children, rel.id)
        break
      case RELATION_PROPS.sibling:
        pushUnique(family.siblings, rel.id)
        break
      case RELATION_PROPS.dynasty:
        family.dynasty ??= rel.id
        break
      default:
        break
    }
  }
  return family
}

export function hasFamily(family: Family): boolean {
  return Boolean(
    family.parents.length ||
      family.spouses.length ||
      family.children.length ||
      family.siblings.length,
  )
}

/** Должности человека по порядку — «кем он был и когда». */
export function positionsOf(entity: Entity): Relation[] {
  return entity.relations.filter((r) => r.prop === RELATION_PROPS.position).sort(byRelStart)
}

function byRelStart(a: Relation, b: Relation): number {
  const ay = a.from?.year ?? Number.POSITIVE_INFINITY
  const by = b.from?.year ?? Number.POSITIVE_INFINITY
  return ay - by
}

/** Что было до этого государства и что стало после. */
export function neighboursOf(entity: Entity): { before: string[]; after: string[] } {
  const before: string[] = []
  const after: string[] = []
  for (const rel of entity.relations) {
    if (rel.prop === RELATION_PROPS.replaces) pushUnique(before, rel.id)
    if (rel.prop === RELATION_PROPS.replacedBy) pushUnique(after, rel.id)
  }
  return { before, after }
}

/**
 * Все Q-номера, которые понадобятся карточке. По ним экран одним заходом
 * догружает недостающее — вместо десятка отдельных запросов.
 */
export function referencedIds(entity: Entity, lib: Library): string[] {
  const ids = new Set<string>()
  for (const rel of entity.relations) {
    ids.add(rel.id)
    const state = lib.positions.get(rel.id)
    if (state) ids.add(state)
  }
  return [...ids]
}

function pushUnique(list: string[], value: string) {
  if (!list.includes(value)) list.push(value)
}
