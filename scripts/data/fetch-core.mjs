/**
 * Сборка офлайн-ядра справочника.
 *
 *   node scripts/data/fetch-core.mjs
 *
 * Что делает по шагам:
 *   1. Спрашивает у Wikidata Q-номера — по объективному признаку (см. queries.mjs).
 *   2. Забирает по ним полные данные через wbgetentities (быстро, без таймаутов).
 *   3. Вытаскивает из государств их правителей и берёт самых известных в ядро
 *      полноценными карточками — с датами, роднёй и картинкой.
 *   4. Догружает имена всех, на кого ссылаются связи, — чтобы древо читалось
 *      офлайн, а не показывало голые Q-номера.
 *   5. Пишет `public/data/core/`: общий файл + по файлу меток на каждый язык.
 *
 * Сеть трогается один раз: сырые ответы лежат в `data-raw/` (в git не едут).
 */
import { writeFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  OUT,
  LANGS,
  ensureDirs,
  sparql,
  getEntities,
  claimTime,
  claimString,
  claimCoords,
  relationList,
  claimId,
  MUL,
} from './lib.mjs'
import { SELECTION, RULERS_TO_KEEP } from './queries.mjs'

const FAMILY_PROPS = ['P22', 'P25', 'P26', 'P40', 'P3373']
const POSITION_PROP = 'P39' // занимаемая должность: царь такой-то страны, президент, папа
const RULER_PROPS = ['P35', 'P6', 'P1830']
const STATE_PROPS = ['P1365', 'P1366'] // предшественник, преемник
const EVENT_PROPS = ['P710', 'P361'] // участники, часть чего

const CORE_VERSION = 1
const MAX_STUBS = 8000 // берём всех, на кого ссылаемся: иначе древо покажет голые Q-номера
const MAX_RELATIONS_PER_PROP = 60

async function main() {
  ensureDirs()

  /* ---------------- Шаг 1: кого берём ---------------- */
  console.log('Шаг 1. Отбор Q-номеров\n')
  const chosen = new Map() // id → тип
  for (const group of SELECTION) {
    const rows = await sparql(group.query, group.label)
    for (const row of rows) if (!chosen.has(row.item)) chosen.set(row.item, group.type)
  }
  console.log(`\nОтобрано запросами: ${chosen.size}`)
  if (chosen.size < 300) throw new Error('Отобрано подозрительно мало — Wikidata ответила не тем')

  /* ---------------- Шаг 2: полные данные ---------------- */
  console.log('\nШаг 2. Полные данные по отобранным')
  const raw = await getEntities([...chosen.keys()])

  /* ---------------- Шаг 3: правители из государств ---------------- */
  console.log('\nШаг 3. Правители, вытянутые из государств')
  const rulerIds = new Set()
  for (const [id, type] of chosen) {
    if (type !== 'state') continue
    const item = raw[id]
    if (!item || item.missing !== undefined) continue
    for (const prop of RULER_PROPS) {
      for (const rel of relationList(item, prop)) {
        if (!chosen.has(rel.id)) rulerIds.add(rel.id)
      }
    }
  }
  console.log(`  всего упомянуто правителей: ${rulerIds.size}`)

  // Сначала дёшево спрашиваем только известность, потом берём верхушку.
  const rulerBrief = await getEntities([...rulerIds], { props: 'sitelinks', allSites: true })
  const ranked = [...rulerIds]
    .map((id) => ({ id, fame: Object.keys(rulerBrief[id]?.sitelinks ?? {}).length }))
    .filter((r) => r.fame > 0)
    .sort((a, b) => b.fame - a.fame)
    .slice(0, RULERS_TO_KEEP)
  console.log(`  берём в ядро: ${ranked.length} (порог известности: ${ranked.at(-1)?.fame ?? 0})`)

  const rulerFull = await getEntities(ranked.map((r) => r.id))
  for (const { id } of ranked) {
    chosen.set(id, 'person')
    raw[id] = rulerFull[id]
  }

  /* ---------------- Шаг 4: разбор в карточки ---------------- */
  console.log('\nШаг 4. Разбор в наши карточки')
  const entities = []
  const labelsByLang = new Map(LANGS.map((l) => [l, {}]))
  const referenced = new Set()
  const positionIds = new Set()

  for (const [id, type] of chosen) {
    const item = raw[id]
    if (!item || item.missing !== undefined) continue

    const relations = []
    const props =
      type === 'person'
        ? FAMILY_PROPS
        : type === 'state'
          ? [...RULER_PROPS, ...STATE_PROPS]
          : type === 'event'
            ? EVENT_PROPS
            : ['P361']

    for (const prop of props) {
      const list = relationList(item, prop).slice(0, MAX_RELATIONS_PER_PROP)
      for (const rel of list) referenced.add(rel.id)
      relations.push(...list)
    }

    // Должности человека. Именно отсюда берётся лента правителей древних
    // государств: у Римской империи в Wikidata нет списка императоров, зато
    // у каждого императора есть должность «римский император» со сроком.
    if (type === 'person') {
      const positions = relationList(item, POSITION_PROP).slice(0, MAX_RELATIONS_PER_PROP)
      for (const rel of positions) {
        referenced.add(rel.id)
        positionIds.add(rel.id)
      }
      relations.push(...positions)
    }

    // Династия человека и страна события — связь без срока.
    if (type === 'person') {
      const dynasty = claimId(item, 'P53')
      if (dynasty) {
        relations.push({ prop: 'P53', id: dynasty })
        referenced.add(dynasty)
      }
    }
    if (type === 'event') {
      const country = claimId(item, 'P17')
      if (country) {
        relations.push({ prop: 'P17', id: country })
        referenced.add(country)
      }
    }

    const entity = {
      id,
      type,
      fame: Object.keys(item.sitelinks ?? {}).length,
      relations: [],
    }

    // У людей — рождение и смерть, у остального — основание и упразднение.
    const start = claimTime(item, type === 'person' ? 'P569' : 'P571') ?? claimTime(item, 'P580')
    const end = claimTime(item, type === 'person' ? 'P570' : 'P576') ?? claimTime(item, 'P582')
    if (start) entity.start = start
    if (end) entity.end = end

    const coords = claimCoords(item)
    if (coords) entity.coords = coords

    const image = claimString(item, 'P18') ?? claimString(item, 'P41')
    if (image) entity.image = image

    // Одинаковые связи иногда лежат в Wikidata по нескольку раз (одно и то же
    // с разными источниками). Человеку это ни о чём не говорит, а файл растит.
    entity.relations = dedupeRelations(relations)

    entities.push(entity)

    for (const lang of LANGS) {
      // Своё имя, а если языку его не завели — общее (см. MUL в lib.mjs).
      const name =
        item.labels?.[lang]?.value ?? item.labels?.[MUL]?.value ?? item.labels?.en?.value
      if (!name) continue
      const record = { name }
      const descr = item.descriptions?.[lang]?.value
      if (descr) record.descr = descr
      // Заголовок статьи Википедии на ЭТОМ языке лежит рядом с именем:
      // приложение грузит один язык, а не тридцать. Это режет общий файл вдвое.
      const title = item.sitelinks?.[`${lang}wiki`]?.title
      if (title) record.wiki = title
      labelsByLang.get(lang)[id] = record
    }
  }
  console.log(`  карточек собрано: ${entities.length}`)

  /* ---------------- Шаг 4б: настоящая известность ---------------- */
  console.log('\nШаг 4б. Настоящая известность (все разделы Википедии, не только наши 30)')
  const fameRaw = await getEntities(
    entities.map((e) => e.id),
    { props: 'sitelinks', allSites: true },
  )
  for (const entity of entities) {
    const count = Object.keys(fameRaw[entity.id]?.sitelinks ?? {}).length
    if (count > 0) entity.fame = count
  }

  /* ---------------- Шаг 4в: справочник должностей ---------------- */
  console.log('\nШаг 4в. Должности и страны, к которым они относятся')
  console.log(`  должностей встретилось: ${positionIds.size}`)
  const positions = {}
  if (positionIds.size) {
    const posRaw = await getEntities([...positionIds], { props: 'labels|claims' })
    for (const id of positionIds) {
      const item = posRaw[id]
      if (!item || item.missing !== undefined) continue
      // P1001 «действует на территории» и P17 «страна» связывают должность с государством.
      const of = claimId(item, 'P1001') ?? claimId(item, 'P17')
      if (of) {
        positions[id] = of
        referenced.add(of)
      }
      for (const lang of LANGS) {
        const name = item.labels?.[lang]?.value
        if (name && !labelsByLang.get(lang)[id]) labelsByLang.get(lang)[id] = { name }
      }
    }
  }
  console.log(`  привязано к государствам: ${Object.keys(positions).length}`)

  /* ---------------- Шаг 5: имена для связей ---------------- */
  console.log('\nШаг 5. Имена для тех, на кого ссылаются связи')
  const known = new Set(entities.map((e) => e.id))
  const stubs = [...referenced].filter((id) => !known.has(id)).slice(0, MAX_STUBS)
  console.log(`  нужно имён: ${stubs.length}`)

  if (stubs.length) {
    const stubRaw = await getEntities(stubs, { props: 'labels' })
    for (const id of stubs) {
      const item = stubRaw[id]
      if (!item || item.missing !== undefined) continue
      for (const lang of LANGS) {
        const name =
        item.labels?.[lang]?.value ?? item.labels?.[MUL]?.value ?? item.labels?.en?.value
        if (name) labelsByLang.get(lang)[id] = { name }
      }
    }
  }

  /* ---------------- Шаг 6: запись ---------------- */
  console.log('\nШаг 6. Запись файлов')
  const pack = {
    version: CORE_VERSION,
    builtAt: new Date().toISOString(),
    entities: entities.sort((a, b) => b.fame - a.fame),
  }
  write('entities.json', pack)
  write('positions.json', { version: CORE_VERSION, positions })
  for (const lang of LANGS) {
    write(`labels.${lang}.json`, { lang, labels: labelsByLang.get(lang) })
  }

  const stats = {
    version: CORE_VERSION,
    builtAt: pack.builtAt,
    total: entities.length,
    byType: countBy(entities, (e) => e.type),
    withDates: entities.filter((e) => e.start || e.end).length,
    withCoords: entities.filter((e) => e.coords).length,
    withImage: entities.filter((e) => e.image).length,
    relations: entities.reduce((a, e) => a + e.relations.length, 0),
    positions: Object.keys(positions).length,
    namesPerLang: Object.fromEntries(LANGS.map((l) => [l, Object.keys(labelsByLang.get(l)).length])),
    languages: LANGS,
  }
  write('stats.json', stats)

  console.log('\nГотово.')
  console.log(`  сущностей: ${stats.total} ${JSON.stringify(stats.byType)}`)
  console.log(
    `  с датами: ${stats.withDates} · с координатами: ${stats.withCoords} · с картинкой: ${stats.withImage}`,
  )
  console.log(`  связей: ${stats.relations}`)
  console.log(`  имён: ru ${stats.namesPerLang.ru}, en ${stats.namesPerLang.en}`)
}

function write(name, data) {
  const path = resolve(OUT, name)
  writeFileSync(path, JSON.stringify(data))
  const kb = Math.round((statSync(path).size / 1024) * 10) / 10
  if (name.startsWith('labels.') && !name.includes('.ru.') && !name.includes('.en.')) return
  console.log(`  ${name} — ${kb} КБ`)
}

/** Убирает повторы: одна и та же связь с тем же сроком встречается дважды. */
function dedupeRelations(relations) {
  const seen = new Set()
  const out = []
  for (const rel of relations) {
    const key = `${rel.prop}|${rel.id}|${rel.from?.year ?? ''}|${rel.to?.year ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(rel)
  }
  return out
}

function countBy(list, fn) {
  const out = {}
  for (const item of list) {
    const key = fn(item)
    out[key] = (out[key] ?? 0) + 1
  }
  return out
}

main().catch((err) => {
  console.error('\nСборка данных упала:', err.message)
  process.exit(1)
})
