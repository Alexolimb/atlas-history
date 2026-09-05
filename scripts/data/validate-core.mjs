/**
 * Ворота честности данных. Входит в `npm run check`.
 *
 * Проверяет не «файл существует», а то, из-за чего приложение соврёт человеку:
 * битые Q-номера, даты-невидимки, ссылки в никуда, пропавшие имена.
 * Не сошлось — сборка падает, и неправда не уезжает на живой адрес.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const OUT = resolve(process.cwd(), 'public', 'data', 'core')
const problems = []
const warnings = []

const fail = (msg) => problems.push(msg)
const warn = (msg) => warnings.push(msg)

function read(name) {
  const path = resolve(OUT, name)
  if (!existsSync(path)) {
    fail(`нет файла ${name} — запустите: node scripts/data/fetch-core.mjs`)
    return null
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (err) {
    fail(`${name} не читается как JSON: ${err.message}`)
    return null
  }
}

const stats = read('stats.json')
const pack = read('entities.json')
const positionsFile = read('positions.json')
const ru = read('labels.ru.json')
const en = read('labels.en.json')

if (problems.length) finish()

const LANGS = stats.languages
const entities = pack.entities
const known = new Set(entities.map((e) => e.id))
const QID = /^Q[1-9]\d*$/

/* ------------------------------ Форма пакета ------------------------------ */

if (!Array.isArray(entities) || entities.length < 500) {
  fail(`сущностей ${entities?.length ?? 0}, ожидали хотя бы 500`)
}
if (new Set(entities.map((e) => e.id)).size !== entities.length) {
  fail('в пакете есть повторяющиеся Q-номера')
}

const TYPES = new Set(['state', 'person', 'event', 'dynasty'])
const byType = {}

for (const e of entities) {
  if (!QID.test(e.id)) fail(`кривой идентификатор: ${JSON.stringify(e.id)}`)
  if (!TYPES.has(e.type)) fail(`${e.id}: неизвестный тип ${e.type}`)
  byType[e.type] = (byType[e.type] ?? 0) + 1

  if (typeof e.fame !== 'number' || e.fame < 0) fail(`${e.id}: известность не число`)

  for (const key of ['start', 'end']) {
    const d = e[key]
    if (d === undefined) continue
    if (typeof d.year !== 'number' || !Number.isInteger(d.year)) fail(`${e.id}: ${key}.year не целое`)
    if (d.year < -13000 || d.year > 2100) fail(`${e.id}: ${key}.year вне разумного (${d.year})`)
    if (typeof d.precision !== 'number') fail(`${e.id}: ${key}.precision не число`)
    if (d.month !== undefined && (d.month < 1 || d.month > 12)) fail(`${e.id}: ${key}.month=${d.month}`)
    if (d.day !== undefined && (d.day < 1 || d.day > 31)) fail(`${e.id}: ${key}.day=${d.day}`)
  }

  // Конец не может быть раньше начала. Такое в Wikidata встречается, и это
  // ровно тот сорт неправды, ради которого ворота и стоят.
  if (e.start && e.end && e.end.year < e.start.year) {
    fail(`${e.id}: конец (${e.end.year}) раньше начала (${e.start.year})`)
  }

  if (e.coords) {
    const [lat, lon] = e.coords
    if (typeof lat !== 'number' || lat < -90 || lat > 90) fail(`${e.id}: широта ${lat}`)
    if (typeof lon !== 'number' || lon < -180 || lon > 180) fail(`${e.id}: долгота ${lon}`)
  }

  if (!Array.isArray(e.relations)) fail(`${e.id}: связи не список`)
  for (const rel of e.relations ?? []) {
    if (!/^P[1-9]\d*$/.test(rel.prop)) fail(`${e.id}: кривое свойство ${rel.prop}`)
    if (!QID.test(rel.id)) fail(`${e.id}: связь ведёт в ${JSON.stringify(rel.id)}`)
  }
}

/* ------------------------------ Имена ------------------------------ */

for (const [name, pack] of [
  ['ru', ru],
  ['en', en],
]) {
  const labels = pack?.labels ?? {}
  const missing = entities.filter((e) => !labels[e.id]?.name)
  // Совсем без имени карточку показать нельзя. Немного пропусков на редких
  // языках допустимо, но не на русском и английском.
  if (missing.length > entities.length * 0.05) {
    fail(`${name}: без имени ${missing.length} из ${entities.length} карточек`)
  } else if (missing.length) {
    warn(`${name}: без имени ${missing.length} карточек (${missing.slice(0, 5).map((e) => e.id).join(', ')})`)
  }

  for (const [id, rec] of Object.entries(labels)) {
    if (!QID.test(id)) fail(`${name}: кривой ключ ${id}`)
    if (typeof rec.name !== 'string' || !rec.name.trim()) fail(`${name}/${id}: пустое имя`)
  }
}

/* ---------------- Связи должны быть читаемы, а не голыми номерами ---------------- */

const ruLabels = ru?.labels ?? {}
const enLabels = en?.labels ?? {}
let danglingRu = 0
let totalRelations = 0
for (const e of entities) {
  for (const rel of e.relations ?? []) {
    totalRelations += 1
    if (!ruLabels[rel.id]?.name && !enLabels[rel.id]?.name && !known.has(rel.id)) danglingRu += 1
  }
}
const danglingShare = totalRelations ? danglingRu / totalRelations : 0
if (danglingShare > 0.12) {
  fail(
    `${danglingRu} связей из ${totalRelations} ведут в никуда (${Math.round(danglingShare * 100)}%) — древо покажет голые Q-номера`,
  )
} else if (danglingRu) {
  warn(`${danglingRu} связей без имени (${Math.round(danglingShare * 100)}%) — покажем как ссылку «загрузить»`)
}

/* ------------------------------ Должности ------------------------------ */

const positions = positionsFile?.positions ?? {}
for (const [pos, state] of Object.entries(positions)) {
  if (!QID.test(pos) || !QID.test(state)) fail(`должности: кривая пара ${pos} → ${state}`)
}

/* ------------------------------ Языки ------------------------------ */

for (const lang of LANGS) {
  if (!existsSync(resolve(OUT, `labels.${lang}.json`))) fail(`нет файла имён для языка ${lang}`)
}
if (LANGS.length !== 30) fail(`языков ${LANGS.length}, а договаривались про 30`)

/* ------------------------------ Здравый смысл ------------------------------ */

const withDates = entities.filter((e) => e.start || e.end).length
if (withDates / entities.length < 0.8) {
  fail(`только у ${withDates} из ${entities.length} карточек есть даты — данные пришли пустыми`)
}
if ((byType.state ?? 0) < 150) fail(`государств всего ${byType.state}, ожидали хотя бы 150`)
if ((byType.person ?? 0) < 150) fail(`людей всего ${byType.person}, ожидали хотя бы 150`)

// Опорные факты. Если Wikidata переедет или запрос сломается, это заметит
// именно эта проверка, а не человек, который прочитает неправду.
const anchors = [
  ['Q1048', 'person', -100, -44], // Гай Юлий Цезарь
  ['Q8409', 'person', -356, -323], // Александр Македонский
  ['Q517', 'person', 1769, 1821], // Наполеон
  ['Q15180', 'state', 1922, 1991], // СССР
  ['Q1747689', 'state', -753, 476], // Древний Рим
]
const byId = new Map(entities.map((e) => [e.id, e]))
for (const [id, type, start, end] of anchors) {
  const e = byId.get(id)
  if (!e) {
    fail(`опорная сущность ${id} пропала из ядра`)
    continue
  }
  if (e.type !== type) fail(`${id}: тип стал ${e.type}, ожидали ${type}`)
  if (e.start?.year !== start) fail(`${id}: начало ${e.start?.year}, ожидали ${start}`)
  if (e.end?.year !== end) fail(`${id}: конец ${e.end?.year}, ожидали ${end}`)
}

finish()

function finish() {
  if (stats) {
    console.log(
      `Ядро: ${entities?.length ?? 0} карточек ${JSON.stringify(byType)} · связей ${totalRelations ?? 0} · языков ${LANGS?.length ?? 0}`,
    )
  }
  for (const w of warnings) console.log(`  · ${w}`)
  if (problems.length) {
    console.error('\nДанные не прошли проверку:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }
  console.log('Данные в порядке ✓')
}
