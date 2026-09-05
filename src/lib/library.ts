import type { CorePack, Entity, Labels, LabelPack } from './types'
import { fetchEntities, searchWikidata } from './wikidata'

/**
 * Единая точка входа в справочник для всего приложения.
 *
 * Порядок обращения всегда один и тот же:
 *   ядро в памяти → кэш устройства → сеть.
 * Экраны не знают, откуда пришла карточка, и не должны знать.
 *
 * Ядро грузится один раз при первом обращении и больше не перечитывается.
 * Файлы лежат в `public/data/core/` и не попадают в основной свёрток —
 * иначе первая загрузка приложения потяжелела бы на мегабайт.
 */

const BASE = import.meta.env.BASE_URL

export interface Library {
  /** Карточки ядра по Q-номеру. */
  entities: Map<string, Entity>
  /** Имена и описания на выбранном языке — и для ядра, и для тех, на кого оно ссылается. */
  labels: Map<string, Labels>
  /** Должность → государство, к которому она относится. */
  positions: Map<string, string>
  lang: string
  builtAt: string
}

let loading: Promise<Library> | null = null
let loadedLang: string | null = null

/** Ядро на нужном языке. Повторный вызов с тем же языком ничего не грузит. */
export function loadLibrary(lang: string): Promise<Library> {
  if (loading && loadedLang === lang) return loading
  loadedLang = lang
  loading = load(lang)
  return loading
}

async function load(lang: string): Promise<Library> {
  const [packRes, labelsRes, positionsRes] = await Promise.all([
    fetch(`${BASE}data/core/entities.json`),
    fetch(`${BASE}data/core/labels.${lang}.json`),
    fetch(`${BASE}data/core/positions.json`),
  ])

  if (!packRes.ok) throw new Error('Не удалось загрузить ядро справочника')
  const pack = (await packRes.json()) as CorePack

  // Имена на редком языке могут не приехать — тогда падаем на английский,
  // но саму карточку всё равно показываем.
  let labelPack: LabelPack
  if (labelsRes.ok) {
    labelPack = (await labelsRes.json()) as LabelPack
  } else {
    const fallback = await fetch(`${BASE}data/core/labels.en.json`)
    labelPack = fallback.ok
      ? ((await fallback.json()) as LabelPack)
      : { lang: 'en', labels: {} }
  }

  const positions = new Map<string, string>()
  if (positionsRes.ok) {
    const file = (await positionsRes.json()) as { positions: Record<string, string> }
    for (const [pos, state] of Object.entries(file.positions ?? {})) positions.set(pos, state)
  }

  return {
    entities: new Map(pack.entities.map((e) => [e.id, e])),
    labels: new Map(Object.entries(labelPack.labels ?? {})),
    positions,
    lang,
    builtAt: pack.builtAt,
  }
}

/* ------------------------------ Чтение ------------------------------ */

/**
 * Имя карточки. Никогда не возвращает пустоту: если имени нет ни на каком
 * языке, показываем Q-номер — человеку видно, что тут пробел, а не тишина.
 */
export function nameOf(lib: Library, id: string): string {
  return lib.labels.get(id)?.name ?? id
}

export function labelsOf(lib: Library, id: string): Labels | undefined {
  return lib.labels.get(id)
}

/** Есть ли карточка в офлайн-ядре — то есть откроется ли она без сети. */
export function isOffline(lib: Library, id: string): boolean {
  return lib.entities.has(id)
}

/**
 * Карточка по номеру: из ядра, а если её там нет — из сети (с кэшем).
 * Догруженное кладём в ту же память, чтобы второй раз не ходить никуда.
 */
export async function getEntity(
  lib: Library,
  id: string,
  signal?: AbortSignal,
): Promise<Entity | null> {
  const local = lib.entities.get(id)
  if (local) return local

  const fetched = await fetchEntities([id], lib.lang, signal)
  const hit = fetched.get(id)
  if (!hit) return null

  lib.entities.set(id, hit.entity)
  if (!lib.labels.has(id)) lib.labels.set(id, hit.labels)
  return hit.entity
}

/** Несколько карточек разом — для лент правителей и семейных древ. */
export async function getEntities(
  lib: Library,
  ids: string[],
  signal?: AbortSignal,
): Promise<Map<string, Entity>> {
  const out = new Map<string, Entity>()
  const missing: string[] = []
  for (const id of ids) {
    const local = lib.entities.get(id)
    if (local) out.set(id, local)
    else missing.push(id)
  }
  if (missing.length) {
    const fetched = await fetchEntities(missing, lib.lang, signal)
    for (const [id, hit] of fetched) {
      lib.entities.set(id, hit.entity)
      if (!lib.labels.has(id)) lib.labels.set(id, hit.labels)
      out.set(id, hit.entity)
    }
  }
  return out
}

/* ------------------------------ Поиск ------------------------------ */

export interface SearchHit {
  id: string
  name: string
  descr?: string
  type?: Entity['type']
  /** Найдено в ядре (значит, откроется офлайн) или в сети. */
  offline: boolean
}

/**
 * Поиск по ядру. Работает офлайн и мгновенно: сравниваем начало слов,
 * чтобы «риб» находил «Рибера», а «ор» не вытаскивал пол-справочника.
 */
export function searchCore(lib: Library, query: string, limit = 30): SearchHit[] {
  const needle = normalize(query)
  if (needle.length < 2) return []

  const hits: (SearchHit & { score: number })[] = []
  for (const [id, entity] of lib.entities) {
    const labels = lib.labels.get(id)
    if (!labels?.name) continue
    const score = matchScore(normalize(labels.name), needle, entity.fame)
    if (score <= 0) continue
    hits.push({ id, name: labels.name, descr: labels.descr, type: entity.type, offline: true, score })
  }

  return hits
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _score, ...hit }) => hit)
}

/**
 * Поиск, который сначала показывает своё, а потом добирает из Wikidata.
 * Сеть — дополнение, а не условие: без неё ядро всё равно ищется.
 */
export async function search(
  lib: Library,
  query: string,
  signal?: AbortSignal,
): Promise<SearchHit[]> {
  const local = searchCore(lib, query)
  const seen = new Set(local.map((h) => h.id))

  try {
    const remote = await searchWikidata(query, lib.lang, signal)
    for (const hit of remote) {
      if (seen.has(hit.id)) continue
      seen.add(hit.id)
      local.push({ ...hit, offline: false })
    }
  } catch {
    /* сети нет — отдаём то, что нашли в ядре */
  }
  return local
}

/** Убираем регистр и диакритику, чтобы «Тюдоры» находились как «тюдоры». */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .trim()
}

/**
 * Насколько имя подходит запросу. Больше — выше в списке.
 * Известность добавляется маленькой добавкой: при равном совпадении
 * первым должен идти Наполеон, а не его однофамилец.
 */
function matchScore(name: string, needle: string, fame: number): number {
  const famePart = Math.min(fame, 400) / 1000

  if (name === needle) return 100 + famePart
  if (name.startsWith(needle)) return 60 + famePart

  // Совпадение с начала любого слова: «македон» находит «Александр Македонский».
  for (const word of name.split(/[\s,()«»„“-]+/)) {
    if (word && word.startsWith(needle)) return 40 + famePart
  }
  if (name.includes(needle)) return 20 + famePart
  return 0
}
