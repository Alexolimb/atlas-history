/**
 * Связывает страны на карте с карточками справочника.
 *
 *   node scripts/data/link-borders.mjs   (после fetch-borders.mjs)
 *
 * На картах границ страны подписаны по-английски: «Roman Empire», «Muscovy».
 * Чтобы касание по стране открывало её карточку, нужно сопоставить это имя
 * с Q-номером Wikidata.
 *
 * Главное правило здесь — лучше не связать, чем связать неверно. Открыть
 * по нажатию на Русь карточку Румынии хуже, чем не открыть ничего: человек
 * прочитает неправду и не поймёт, что она неправда. Поэтому:
 *   · сначала точное совпадение с английскими именами нашего ядра;
 *   · потом поиск в Wikidata, но результат принимается ТОЛЬКО если найденное
 *     имя совпадает с подписью на карте буква в букву (после приведения
 *     к нижнему регистру и снятия скобок);
 *   · всё сомнительное остаётся несвязанным. Страна на глобусе всё равно
 *     видна и подписана, просто не открывается по нажатию.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchJson, readCache, writeCache, ROOT } from './lib.mjs'
import { looksNotLikeCountry } from './reject-words.mjs'

const BORDERS = resolve(ROOT, 'public', 'data', 'borders')
const CORE = resolve(ROOT, 'public', 'data', 'core')

async function main() {
  /* 1. Все подписи, встречающиеся на картах. */
  const files = readdirSync(BORDERS).filter((f) => /^-?\d+\.json$/.test(f))
  const names = new Map() // подпись → сколько раз встретилась
  for (const file of files) {
    const geo = JSON.parse(readFileSync(resolve(BORDERS, file), 'utf8'))
    for (const feature of geo.features) {
      const name = feature.properties?.name
      if (name) names.set(name, (names.get(name) ?? 0) + 1)
    }
  }
  console.log(`Разных подписей на картах: ${names.size}`)

  /* 2. Точное совпадение с английскими именами ядра — это бесплатно и надёжно. */
  const enLabels = JSON.parse(readFileSync(resolve(CORE, 'labels.en.json'), 'utf8')).labels
  const entities = JSON.parse(readFileSync(resolve(CORE, 'entities.json'), 'utf8')).entities
  const isState = new Set(entities.filter((e) => e.type === 'state').map((e) => e.id))

  const byEnglish = new Map()
  for (const [id, rec] of Object.entries(enLabels)) {
    if (!isState.has(id) || !rec.name) continue
    const key = normalize(rec.name)
    if (!byEnglish.has(key)) byEnglish.set(key, id)
  }

  const links = {}
  const unresolved = []
  for (const name of names.keys()) {
    const hit = byEnglish.get(normalize(name))
    if (hit) links[name] = hit
    else unresolved.push(name)
  }
  console.log(`  совпало с ядром: ${Object.keys(links).length}`)
  console.log(`  осталось выяснить: ${unresolved.length}`)

  /* 3. Остальные ищем в Wikidata, но принимаем только точное попадание. */
  let found = 0
  let rejected = 0
  for (let i = 0; i < unresolved.length; i++) {
    const name = unresolved[i]
    const hit = await searchExact(name)
    if (hit) {
      links[name] = hit
      found += 1
    } else {
      rejected += 1
    }
    if ((i + 1) % 50 === 0) {
      process.stdout.write(`\r  проверено ${i + 1} / ${unresolved.length}   `)
    }
  }
  process.stdout.write('\n')
  console.log(`  нашлось в Wikidata: ${found}`)
  console.log(`  оставлено несвязанными (имя не совпало точно): ${rejected}`)

  writeFileSync(
    resolve(BORDERS, 'links.json'),
    JSON.stringify({
      version: 1,
      builtAt: new Date().toISOString(),
      note: 'Подпись страны на карте → Q-номер. Связывается только при точном совпадении имени.',
      total: names.size,
      linked: Object.keys(links).length,
      links,
    }),
  )

  const share = Math.round((Object.keys(links).length / names.size) * 100)
  console.log(`\nГотово: связано ${Object.keys(links).length} из ${names.size} (${share}%)`)
  if (share < 40) throw new Error('Связалось слишком мало — половина глобуса будет мёртвой')
}

async function searchExact(name) {
  // v2: правило приёма изменилось (добавлены прозвища), старые отказы
  // перепроверяем заново — иначе половина древних карт осталась бы мёртвой.
  const key = `bordersearch:v2:${name}`
  const cached = readCache(key)
  if (cached !== null) return cached || null

  const url =
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*' +
    `&search=${encodeURIComponent(name)}&language=en&uselang=en&limit=5&type=item`

  let data
  try {
    data = await fetchJson(url, { label: `поиск «${name}»`, retries: 3 })
  } catch {
    return null
  }

  const target = normalize(name)
  let byAlias = null

  for (const hit of data.search ?? []) {
    // Отсекаем заведомо не-государства по описанию: фильм, песня, порода утки.
    if (looksNotLikeCountry(hit.description)) continue

    // Лучший случай: основное имя совпало буква в букву.
    if (hit.label && normalize(hit.label) === target) {
      writeCache(key, hit.id)
      return hit.id
    }

    // Совпадение с прозвищем. «Muscovy» — прозвище Великого княжества
    // Московского, «USSR» — Советского Союза. Без этого половина старых карт
    // остаётся без карточек. Берём, только если Wikidata сама сказала, что
    // попала именно в прозвище, и текст совпал буква в букву.
    if (!byAlias && hit.match?.type === 'alias' && normalize(hit.match.text ?? '') === target) {
      byAlias = hit.id
    }
  }

  if (byAlias) {
    writeCache(key, byAlias)
    return byAlias
  }

  writeCache(key, '')
  return null
}

/** «Kingdom of France (1791)» → «kingdom of france». */
function normalize(text) {
  return text
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,;:'"«»]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

main().catch((err) => {
  console.error('\nСвязывание границ упало:', err.message)
  process.exit(1)
})
