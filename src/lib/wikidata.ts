import type { Entity, EntityType, HistDate, Labels, Relation } from './types'
import { cacheGet, cacheSet } from './cache'

/**
 * Догрузка карточек, которых нет в офлайн-ядре.
 *
 * Ядро — это ~800 самых известных вещей. Всё остальное (а это миллионы
 * карточек) приезжает отсюда по требованию и остаётся в кэше устройства.
 *
 * Идём через API Wikidata, а не через SPARQL: он открыт из браузера,
 * отвечает за доли секунды и не падает по таймауту.
 */

const API = 'https://www.wikidata.org/w/api.php'

/**
 * Код языка для имён, одинаковых во всех языках латиницы. Wikidata с 2024 года
 * хранит их один раз здесь и удаляет из английского — кто просит только en,
 * не находит имени у Эйнштейна, Дарвина и Трампа.
 */
export const MUL = 'mul'

const P = {
  instanceOf: 'P31',
  birth: 'P569',
  death: 'P570',
  inception: 'P571',
  dissolved: 'P576',
  startTime: 'P580',
  endTime: 'P582',
  coords: 'P625',
  image: 'P18',
  flag: 'P41',
} as const

const RELATION_PROPS = [
  'P22', 'P25', 'P26', 'P40', 'P3373', // родство
  'P39', // должность
  'P35', 'P6', 'P1830', // правители
  'P1365', 'P1366', // предшественник, преемник
  'P53', 'P17', 'P361', 'P710',
]

/** Классы, по которым понимаем, что за карточка перед нами. */
const TYPE_BY_CLASS: Record<string, EntityType> = {
  Q5: 'person',
  Q3624078: 'state',
  Q3024240: 'state',
  Q48349: 'state',
  Q417175: 'state',
  Q28171280: 'state',
  Q6256: 'state',
  Q198: 'event',
  Q178561: 'event',
  Q10931: 'event',
  Q131569: 'event',
  Q1656682: 'event',
  Q164950: 'dynasty',
  Q13417114: 'dynasty',
}

export interface FetchedEntity {
  entity: Entity
  labels: Labels
}

/**
 * Одна или несколько карточек по Q-номерам. Сначала смотрим в кэш,
 * в сеть идём только за тем, чего там нет.
 */
export async function fetchEntities(
  ids: string[],
  lang: string,
  signal?: AbortSignal,
): Promise<Map<string, FetchedEntity>> {
  const result = new Map<string, FetchedEntity>()
  const missing: string[] = []

  for (const id of ids) {
    const hit = await cacheGet<FetchedEntity>(`e.${lang}.${id}`)
    if (hit) result.set(id, hit)
    else missing.push(id)
  }
  if (!missing.length) return result

  for (let i = 0; i < missing.length; i += 50) {
    const chunk = missing.slice(i, i + 50)
    const url =
      `${API}?action=wbgetentities&format=json&origin=*` +
      `&ids=${chunk.join('|')}` +
      `&props=labels|descriptions|claims|sitelinks` +
      `&languages=${[lang, 'en', MUL].join('|')}` +
      `&sitefilter=${lang}wiki|enwiki`

    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`Wikidata ответила ${res.status}`)
    const data = (await res.json()) as { entities?: Record<string, RawEntity> }

    for (const id of chunk) {
      const raw = data.entities?.[id]
      if (!raw || raw.missing !== undefined) continue
      const parsed = parseEntity(id, raw, lang)
      result.set(id, parsed)
      void cacheSet(`e.${lang}.${id}`, parsed)
    }
  }
  return result
}

/** Поиск по Wikidata — то, чего нет в ядре, ищется прямо в сети. */
export async function searchWikidata(
  query: string,
  lang: string,
  signal?: AbortSignal,
): Promise<{ id: string; name: string; descr?: string }[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const url =
    `${API}?action=wbsearchentities&format=json&origin=*` +
    `&search=${encodeURIComponent(trimmed)}` +
    `&language=${lang}&uselang=${lang}&limit=20&type=item`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`Поиск Wikidata ответил ${res.status}`)
  const data = (await res.json()) as {
    search?: { id: string; label?: string; description?: string }[]
  }
  return (data.search ?? [])
    .filter((hit) => /^Q[1-9]\d*$/.test(hit.id) && hit.label)
    .map((hit) => ({ id: hit.id, name: hit.label as string, descr: hit.description }))
}

/* --------------------------- Разбор ответа --------------------------- */

interface RawSnak {
  datavalue?: { value?: unknown }
}
interface RawClaim {
  rank?: string
  mainsnak?: RawSnak
  qualifiers?: Record<string, RawSnak[]>
}
interface RawEntity {
  missing?: unknown
  labels?: Record<string, { value: string }>
  descriptions?: Record<string, { value: string }>
  claims?: Record<string, RawClaim[]>
  sitelinks?: Record<string, { title: string }>
}

function parseEntity(id: string, raw: RawEntity, lang: string): FetchedEntity {
  const type = detectType(raw)

  const relations: Relation[] = []
  for (const prop of RELATION_PROPS) {
    for (const claim of live(raw, prop)) {
      const target = idOf(claim.mainsnak)
      if (!target) continue
      const rel: Relation = { prop, id: target }
      const from = timeOf(claim.qualifiers?.P580?.[0])
      const to = timeOf(claim.qualifiers?.P582?.[0])
      if (from) rel.from = from
      if (to) rel.to = to
      relations.push(rel)
    }
  }

  const entity: Entity = {
    id,
    type,
    fame: Object.keys(raw.sitelinks ?? {}).length,
    relations,
  }

  const start =
    firstTime(raw, type === 'person' ? P.birth : P.inception) ?? firstTime(raw, P.startTime)
  const end = firstTime(raw, type === 'person' ? P.death : P.dissolved) ?? firstTime(raw, P.endTime)
  if (start) entity.start = start
  if (end) entity.end = end

  const coords = firstCoords(raw)
  if (coords) entity.coords = coords

  const image = firstString(raw, P.image) ?? firstString(raw, P.flag)
  if (image) entity.image = image

  const name =
    raw.labels?.[lang]?.value ?? raw.labels?.[MUL]?.value ?? raw.labels?.en?.value ?? id
  const labels: Labels = { name }
  const descr = raw.descriptions?.[lang]?.value ?? raw.descriptions?.en?.value
  if (descr) labels.descr = descr
  const wiki = raw.sitelinks?.[`${lang}wiki`]?.title
  if (wiki) labels.wiki = wiki

  return { entity, labels }
}

function detectType(raw: RawEntity): EntityType {
  for (const claim of live(raw, P.instanceOf)) {
    const cls = idOf(claim.mainsnak)
    if (cls && TYPE_BY_CLASS[cls]) return TYPE_BY_CLASS[cls]
  }
  // Не опознали — считаем событием: у него самая нейтральная карточка.
  return 'event'
}

function live(raw: RawEntity, prop: string): RawClaim[] {
  const list = raw.claims?.[prop]
  if (!Array.isArray(list)) return []
  return list.filter((c) => c.rank !== 'deprecated')
}

function idOf(snak: RawSnak | undefined): string | undefined {
  const value = snak?.datavalue?.value as { id?: string } | undefined
  return typeof value?.id === 'string' ? value.id : undefined
}

function timeOf(snak: RawSnak | undefined): HistDate | undefined {
  const value = snak?.datavalue?.value as { time?: string; precision?: number } | undefined
  if (typeof value?.time !== 'string') return undefined
  const m = /^([+-])(\d{4,})-(\d{2})-(\d{2})/.exec(value.time)
  if (!m) return undefined
  const year = (m[1] === '-' ? -1 : 1) * Number(m[2])
  const precision = typeof value.precision === 'number' ? value.precision : 9
  const date: HistDate = { year, precision }
  const month = Number(m[3])
  const day = Number(m[4])
  if (precision >= 10 && month > 0) date.month = month
  if (precision >= 11 && day > 0) date.day = day
  return date
}

function firstTime(raw: RawEntity, prop: string): HistDate | undefined {
  for (const claim of live(raw, prop)) {
    const t = timeOf(claim.mainsnak)
    if (t) return t
  }
  return undefined
}

function firstString(raw: RawEntity, prop: string): string | undefined {
  for (const claim of live(raw, prop)) {
    const value = claim.mainsnak?.datavalue?.value
    if (typeof value === 'string') return value
  }
  return undefined
}

function firstCoords(raw: RawEntity): [number, number] | undefined {
  for (const claim of live(raw, P.coords)) {
    const value = claim.mainsnak?.datavalue?.value as
      | { latitude?: number; longitude?: number }
      | undefined
    if (typeof value?.latitude === 'number' && typeof value?.longitude === 'number') {
      return [value.latitude, value.longitude]
    }
  }
  return undefined
}
