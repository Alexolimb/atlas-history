/**
 * Сборка пути из глав + ПРОВЕРКА КАЖДОГО ФАКТА ПО WIKIDATA.
 *
 *   node scripts/content/build-course.mjs
 *
 * Это главные ворота честности всего приложения. Текст главы пишу я,
 * а значит, могу ошибиться в дате или имени — и человек прочитает
 * неправду, не заметив. Поэтому каждая дата, названная в главе, вынесена
 * в раздел `facts` шапки и сверяется с Wikidata. Разошлось хоть на год —
 * сборка падает, и глава не попадает в приложение.
 *
 * Разбор шапки свой, без внешней библиотеки: формат мы задаём сами,
 * он маленький, и тащить ради него зависимость незачем.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { getEntities, claimTime, ROOT } from '../data/lib.mjs'

const CONTENT = resolve(ROOT, 'content')
// Кладём рядом с остальными данными, а НЕ внутрь кода: с сорока двумя
// главами файл вырастет за полмегабайта, и в первую загрузку ему нельзя.
const OUT_DIR = resolve(ROOT, 'public', 'data')
const OUT = resolve(OUT_DIR, 'course.json')

/**
 * Что означает `prop` в разделе facts.
 *
 * У каждого — цепочка свойств, потому что Wikidata описывает одно и то же
 * по-разному: у государства начало лежит в «дате основания», а у войны —
 * в «времени начала». Цепочка ТА ЖЕ, что в сборке справочника: иначе ворота
 * ругались бы на даты, которые приложение спокойно показывает.
 */
const PROP_MAP = {
  birth: ['P569'],
  death: ['P570'],
  start: ['P571', 'P580'],
  end: ['P576', 'P582'],
}

const problems = []
const fail = (msg) => problems.push(msg)

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const ru = readLanguage('ru')
  const en = readLanguage('en')
  console.log(`Глав: русских ${ru.size}, английских ${en.size}`)

  /* Пары языков должны совпадать: глава без перевода — дырка в пути. */
  for (const id of ru.keys()) if (!en.has(id)) fail(`${id}: есть по-русски, нет по-английски`)
  for (const id of en.keys()) if (!ru.has(id)) fail(`${id}: есть по-английски, нет по-русски`)

  for (const [id, chapter] of ru) {
    const other = en.get(id)
    if (!other) continue
    if (chapter.epoch !== other.epoch || chapter.order !== other.order) {
      fail(`${id}: эпоха или порядок разошлись между языками`)
    }
    if (JSON.stringify(chapter.facts) !== JSON.stringify(other.facts)) {
      fail(`${id}: разделы facts разошлись между языками — проверяться будет не то`)
    }
  }

  /* Проверка фактов по Wikidata — сердце этих ворот. */
  const allFacts = []
  for (const chapter of ru.values()) {
    for (const fact of chapter.facts) allFacts.push({ ...fact, chapter: chapter.id })
  }
  console.log(`Фактов на проверку: ${allFacts.length}`)

  if (allFacts.length) {
    const ids = [...new Set(allFacts.map((f) => f.q))]
    const raw = await getEntities(ids, { props: 'labels|claims' })

    for (const fact of allFacts) {
      const item = raw[fact.q]
      if (!item || item.missing !== undefined) {
        fail(`${fact.chapter}: ${fact.q} — такой карточки в Wikidata нет`)
        continue
      }
      const props = PROP_MAP[fact.prop]
      if (!props) {
        fail(`${fact.chapter}: непонятно, что проверять — «${fact.prop}»`)
        continue
      }
      let actual
      for (const prop of props) {
        actual = claimTime(item, prop)
        if (actual) break
      }
      if (!actual) {
        fail(`${fact.chapter}: у ${fact.q} (${nameOf(item)}) нет даты «${fact.prop}» в Wikidata`)
        continue
      }
      if (actual.year !== fact.year) {
        fail(
          `${fact.chapter}: ${fact.q} (${nameOf(item)}) — в главе ${fact.year}, в Wikidata ${actual.year}`,
        )
      }
    }
  }

  /* Викторина должна опираться на проверенные факты. */
  for (const chapter of ru.values()) {
    const checked = new Set(chapter.facts.map((f) => `${f.q}|${f.prop}`))
    for (const question of chapter.quiz) {
      if (question.type === 'date' && !checked.has(`${question.q}|${question.prop}`)) {
        fail(`${chapter.id}: вопрос про ${question.q}/${question.prop} не опирается на проверенный факт`)
      }
      if (question.type === 'who' && !chapter.cards.includes(question.q)) {
        fail(`${chapter.id}: вопрос «кто это» про ${question.q}, которого нет среди карточек главы`)
      }
      if (question.type === 'order' && (question.items?.length ?? 0) < 2) {
        fail(`${chapter.id}: в вопросе «по порядку» меньше двух пунктов`)
      }
    }
  }

  if (problems.length) {
    console.error('\nГлавы не прошли проверку:')
    for (const p of problems) console.error(`  ✗ ${p}`)
    process.exit(1)
  }

  const course = {
    version: 1,
    builtAt: new Date().toISOString(),
    chapters: [...ru.values()]
      .map((chapter) => ({
        id: chapter.id,
        epoch: chapter.epoch,
        order: chapter.order,
        years: chapter.years,
        globe: chapter.globe,
        cards: chapter.cards,
        facts: chapter.facts,
        quiz: chapter.quiz,
        text: {
          ru: { title: chapter.title, subtitle: chapter.subtitle, body: chapter.body },
          en: {
            title: en.get(chapter.id).title,
            subtitle: en.get(chapter.id).subtitle,
            body: en.get(chapter.id).body,
          },
        },
      })
      )
      .sort((a, b) => a.epoch - b.epoch || a.order - b.order),
  }

  writeFileSync(OUT, JSON.stringify(course))
  const kb = Math.round((Buffer.byteLength(JSON.stringify(course)) / 1024) * 10) / 10
  const words = [...ru.values()].reduce((a, c) => a + c.body.split(/\s+/).length, 0)
  console.log(`\nГотово: ${course.chapters.length} глав, ${words} слов по-русски, ${kb} КБ`)
  console.log('Все факты сошлись с Wikidata ✓')
}

function nameOf(item) {
  return item.labels?.ru?.value ?? item.labels?.en?.value ?? ''
}

function readLanguage(lang) {
  const dir = resolve(CONTENT, lang)
  const chapters = new Map()
  if (!existsSync(dir)) return chapters

  for (const epochDir of readdirSync(dir).filter((d) => /^e\d\d$/.test(d))) {
    for (const file of readdirSync(resolve(dir, epochDir)).filter((f) => f.endsWith('.md'))) {
      const path = resolve(dir, epochDir, file)
      const chapter = parseChapter(readFileSync(path, 'utf8'), `${lang}/${epochDir}/${file}`)
      if (!chapter) continue

      const expectedId = `${epochDir}${file.replace('.md', '')}`
      if (chapter.id !== expectedId) {
        fail(`${lang}/${epochDir}/${file}: id «${chapter.id}», а по пути должен быть «${expectedId}»`)
      }
      if (chapters.has(chapter.id)) fail(`${lang}: глава ${chapter.id} встречается дважды`)
      chapters.set(chapter.id, chapter)
    }
  }
  return chapters
}

/** Разбор файла главы: шапка между --- и текст после неё. */
function parseChapter(source, where) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(source)
  if (!match) {
    fail(`${where}: нет шапки между --- и ---`)
    return null
  }

  let head
  try {
    head = parseHead(match[1])
  } catch (err) {
    fail(`${where}: шапка не разобралась — ${err.message}`)
    return null
  }

  const body = match[2].trim()
  if (!body) {
    fail(`${where}: пустой текст главы`)
    return null
  }

  const words = body.split(/\s+/).length
  if (words < 400) fail(`${where}: всего ${words} слов, глава должна быть 700–1000`)
  if (words > 1400) fail(`${where}: ${words} слов — длиннее, чем человек прочитает за раз`)

  for (const key of ['id', 'epoch', 'order', 'title', 'years']) {
    if (head[key] === undefined) fail(`${where}: в шапке нет «${key}»`)
  }

  return {
    id: String(head.id ?? ''),
    epoch: Number(head.epoch),
    order: Number(head.order),
    title: String(head.title ?? ''),
    subtitle: String(head.subtitle ?? ''),
    years: head.years ?? [],
    globe: head.globe ?? null,
    cards: head.cards ?? [],
    facts: head.facts ?? [],
    quiz: head.quiz ?? [],
    body,
  }
}

/**
 * Маленький разбор шапки. Понимает ровно то, что нужно нашему формату:
 * `ключ: значение`, списки в квадратных скобках, вложенные объекты
 * в фигурных, и списки объектов через «- ».
 */
function parseHead(text) {
  const head = {}
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (/^\s/.test(line)) continue // вложенное разберёт владелец ключа

    const m = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(line)
    if (!m) throw new Error(`непонятная строка: ${line}`)
    const key = m[1]
    const inline = m[2].trim()

    if (inline) {
      head[key] = parseValue(inline)
      continue
    }

    // Значение на следующих строках с отступом.
    const block = []
    while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || !lines[i + 1].trim())) {
      i += 1
      if (lines[i].trim()) block.push(lines[i].trim())
    }
    head[key] = block.length && block[0].startsWith('- ')
      ? block.map((row) => parseValue(row.slice(2).trim()))
      : Object.fromEntries(
          block.map((row) => {
            const pair = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(row)
            if (!pair) throw new Error(`непонятная строка: ${row}`)
            return [pair[1], parseValue(pair[2].trim())]
          }),
        )
  }
  return head
}

function parseValue(raw) {
  const value = raw.trim()
  if (value === '') return ''
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)

  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    return inner ? splitTop(inner).map(parseValue) : []
  }

  if (value.startsWith('{') && value.endsWith('}')) {
    const inner = value.slice(1, -1).trim()
    const out = {}
    for (const part of splitTop(inner)) {
      const pair = /^([A-Za-z_][\w]*):\s*(.*)$/.exec(part.trim())
      if (!pair) throw new Error(`непонятная пара: ${part}`)
      out[pair[1]] = parseValue(pair[2])
    }
    return out
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/**
 * Разбить по запятым верхнего уровня, не трогая вложенные скобки
 * И НЕ ТРОГАЯ ЗАПЯТЫЕ ВНУТРИ КАВЫЧЕК. Последнее важнее, чем кажется:
 * почти в каждом вопросе викторины есть придаточное с запятой, и без
 * этой проверки шапка разваливается на ровном месте.
 */
function splitTop(text) {
  const parts = []
  let depth = 0
  let quote = null
  let current = ''

  for (const char of text) {
    if (quote) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      current += char
      continue
    }
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current)
  return parts
}

main().catch((err) => {
  console.error('\nСборка глав упала:', err.message)
  process.exit(1)
})
