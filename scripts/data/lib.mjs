/**
 * Общие руки для сборки данных: запросы к Wikidata с повторами и кэшем.
 *
 * Wikidata просит вести себя прилично: честный User-Agent, не долбить
 * параллельно, отступать при 429. Живой сервис в 2026 заметно медленнее,
 * чем раньше, поэтому сырые ответы кладём в `data-raw/` — повторный прогон
 * не трогает сеть вовсе.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createHash } from 'node:crypto'

export const ROOT = resolve(process.cwd())
export const RAW = resolve(ROOT, 'data-raw')
export const OUT = resolve(ROOT, 'public', 'data', 'core')

/**
 * ТОЛЬКО латиница: заголовки HTTP не умеют кириллицу вовсе — одна русская
 * буква здесь роняет каждый запрос ещё до выхода в сеть.
 */
export const UA =
  'AtlasHistoryApp/0.1 (https://github.com/Alexolimb/atlas-history; educational history app)'

/**
 * Особый код языка Wikidata. С 2024 года имена, одинаковые во всех языках
 * латиницы («Albert Einstein»), хранятся ОДИН раз под кодом mul, а из
 * английского при этом удаляются. Кто просит только en — получает пустоту
 * у тысяч знаменитых людей: Эйнштейна, Дарвина, Трампа. И не замечает этого,
 * потому что ошибки нет, просто имени нет.
 */
export const MUL = 'mul'

/** 30 языков приложения. Порядок как в src/i18n/languages.ts. */
export const LANGS = [
  'ru', 'en', 'es', 'zh', 'hi', 'ar', 'pt', 'fr', 'de', 'ja',
  'ko', 'it', 'tr', 'pl', 'uk', 'nl', 'vi', 'id', 'th', 'fa',
  'sv', 'cs', 'el', 'he', 'ro', 'hu', 'da', 'fi', 'no', 'bn',
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Кладём сырой ответ на диск: второй прогон скрипта не идёт в сеть. */
function cachePath(key) {
  const hash = createHash('sha1').update(key).digest('hex').slice(0, 16)
  return resolve(RAW, `${hash}.json`)
}

export function readCache(key) {
  const path = cachePath(key)
  if (!existsSync(path)) return null
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

export function writeCache(key, value) {
  const path = cachePath(key)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(value))
}

/**
 * Запрос с повторами. 429 и 5xx — ждём и пробуем снова, а не падаем:
 * прогон длинный, и уронить его на одной заминке сервиса нельзя.
 */
export async function fetchJson(url, { headers = {}, retries = 5, label = '' } = {}) {
  let wait = 2000
  for (let attempt = 1; attempt <= retries; attempt++) {
    let res
    try {
      res = await fetch(url, {
        headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip,deflate', ...headers },
      })
    } catch (err) {
      if (attempt === retries) throw err
      console.warn(`  сеть отвалилась (${label}), попытка ${attempt}: ${err.message}`)
      await sleep(wait)
      wait = Math.min(wait * 2, 60000)
      continue
    }

    if (res.ok) return res.json()

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get('retry-after'))
      const pause = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : wait
      if (attempt === retries) throw new Error(`${label}: ${res.status} после ${retries} попыток`)
      console.warn(`  ${res.status} (${label}), ждём ${Math.round(pause / 1000)} с…`)
      await sleep(pause)
      wait = Math.min(wait * 2, 60000)
      continue
    }

    throw new Error(`${label}: ${res.status} ${res.statusText}`)
  }
  throw new Error(`${label}: не получилось`)
}

/** Запрос SPARQL. Используем только чтобы выбрать список Q-номеров. */
export async function sparql(query, label) {
  const cached = readCache(`sparql:${query}`)
  if (cached) {
    console.log(`  ${label}: из кэша (${cached.length})`)
    return cached
  }
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`
  const data = await fetchJson(url, { label, retries: 6 })
  const rows = data.results.bindings.map((row) => {
    const out = {}
    for (const [k, v] of Object.entries(row)) {
      out[k] = v.type === 'uri' ? v.value.replace('http://www.wikidata.org/entity/', '') : v.value
    }
    return out
  })
  writeCache(`sparql:${query}`, rows)
  console.log(`  ${label}: ${rows.length}`)
  return rows
}

/**
 * Полные данные по Q-номерам. Идём через wbgetentities, а не SPARQL:
 * этот путь быстрее, не отваливается по таймауту и сразу отдаёт
 * метки на всех нужных языках вместе со связями.
 */
export async function getEntities(ids, { props = 'labels|descriptions|claims|sitelinks', allSites = false } = {}) {
  const out = {}
  const chunkSize = 50 // предел API
  const sitefilter = LANGS.map((l) => `${l}wiki`).join('|')

  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    // v2 в ключе: набор языков поменялся (добавился mul), старые ответы кэша
    // без него читать нельзя — вернут пустые имена и никто не заметит.
    const key = `entities:v2:${props}:${allSites ? 'all' : '30'}:${chunk.join(',')}`
    let data = readCache(key)

    if (!data) {
      const url =
        'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*' +
        `&ids=${chunk.join('|')}` +
        `&props=${encodeURIComponent(props)}` +
        `&languages=${[...LANGS, MUL].join('|')}` +
        // Без sitefilter приходят ВСЕ разделы Википедии — так считается настоящая
        // известность. С фильтром счётчик упирается в 30 и перестаёт различать.
        (allSites ? '' : `&sitefilter=${encodeURIComponent(sitefilter)}`)
      const res = await fetchJson(url, { label: `сущности ${i + 1}…${i + chunk.length}` })
      data = res.entities
      writeCache(key, data)
      await sleep(120) // не долбим API очередью
    }

    Object.assign(out, data)
    process.stdout.write(`\r  получено ${Math.min(i + chunkSize, ids.length)} / ${ids.length}   `)
  }
  process.stdout.write('\n')
  return out
}

/* ------------------------- Разбор ответов Wikidata ------------------------- */

/** Дата Wikidata → наша HistDate. Возвращает null, если дата не настоящая. */
export function parseTime(value) {
  if (!value || typeof value.time !== 'string') return null
  // Формат: +1789-07-14T00:00:00Z или -0044-03-15T00:00:00Z
  const m = /^([+-])(\d{4,})-(\d{2})-(\d{2})/.exec(value.time)
  if (!m) return null
  const sign = m[1] === '-' ? -1 : 1
  const year = sign * Number(m[2])
  const month = Number(m[3])
  const day = Number(m[4])
  const precision = typeof value.precision === 'number' ? value.precision : 9

  const date = { year, precision }
  // Месяц и день Wikidata пишет нулями, когда их не знает.
  if (precision >= 10 && month > 0) date.month = month
  if (precision >= 11 && day > 0) date.day = day
  return date
}

/** Утверждения по свойству, только настоящие (не отвергнутые). */
export function claims(entity, prop) {
  const list = entity?.claims?.[prop]
  if (!Array.isArray(list)) return []
  return list.filter((c) => c.rank !== 'deprecated')
}

/** Первое значение-ссылка: Q-номер. */
export function claimId(entity, prop) {
  for (const c of claims(entity, prop)) {
    const id = c.mainsnak?.datavalue?.value?.id
    if (id) return id
  }
  return undefined
}

/** Первое значение-время. */
export function claimTime(entity, prop) {
  for (const c of claims(entity, prop)) {
    const parsed = parseTime(c.mainsnak?.datavalue?.value)
    if (parsed) return parsed
  }
  return undefined
}

/** Первое значение-строка (имя файла картинки). */
export function claimString(entity, prop) {
  for (const c of claims(entity, prop)) {
    const v = c.mainsnak?.datavalue?.value
    if (typeof v === 'string') return v
  }
  return undefined
}

/** Координаты. */
export function claimCoords(entity, prop = 'P625') {
  for (const c of claims(entity, prop)) {
    const v = c.mainsnak?.datavalue?.value
    if (v && typeof v.latitude === 'number' && typeof v.longitude === 'number') {
      return [round(v.latitude, 4), round(v.longitude, 4)]
    }
  }
  return undefined
}

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits

/**
 * Все связи по свойству со сроками из уточнений.
 * Именно уточнения P580/P582 дают ленту правителей: кто, с какого по какой год.
 */
export function relationList(entity, prop) {
  const out = []
  for (const c of claims(entity, prop)) {
    const id = c.mainsnak?.datavalue?.value?.id
    if (!id) continue
    const rel = { prop, id }
    const from = parseTime(c.qualifiers?.P580?.[0]?.datavalue?.value)
    const to = parseTime(c.qualifiers?.P582?.[0]?.datavalue?.value)
    if (from) rel.from = from
    if (to) rel.to = to
    out.push(rel)
  }
  return out
}

export function ensureDirs() {
  mkdirSync(RAW, { recursive: true })
  mkdirSync(OUT, { recursive: true })
}
