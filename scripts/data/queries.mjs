/**
 * Отбор того, что попадёт в офлайн-ядро.
 *
 * Никакого «мне кажется, это важно»: список собирается запросом по объективному
 * признаку — сколько языковых разделов Википедии написали про эту сущность
 * (`wikibase:sitelinks`). Прогон повторяем: те же запросы дадут тот же список.
 *
 * Глубина справочника этим НЕ ограничена — всё остальное догружается из
 * Wikidata по требованию. Здесь только то, что должно открываться без сети.
 *
 * ВАЖНО про стоимость запросов. У Wikidata на запрос 60 секунд, и в 2026 она
 * заметно медленнее прежнего. Широкий запрос вида «все люди, занимавшие
 * должность» обрывает соединение, не досчитав. Поэтому:
 *   · один запрос — один узкий класс (VALUES из девяти занятий уже слишком много);
 *   · правители НЕ ищутся запросом вовсе — они берутся из свойств «глава
 *     государства» у тех государств, которые мы и так забираем. Это и дешевле,
 *     и честнее: в ядро попадают правители именно тех стран, что в ядре есть.
 */

/** Государства — члены ООН, включая уже исчезнувшие (СССР, Чехословакия). */
export const Q_MODERN_STATES = `
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P463 wd:Q1065 ;
        wikibase:sitelinks ?sitelinks .
}
ORDER BY DESC(?sitelinks)
`

/** Исчезнувшие государства, империи, царства, древние цивилизации. */
export const Q_HISTORICAL_STATES = `
SELECT ?item ?sitelinks WHERE {
  VALUES ?class { wd:Q3024240 wd:Q48349 wd:Q28171280 wd:Q417175 }
  ?item wdt:P31 ?class ;
        wikibase:sitelinks ?sitelinks .
  FILTER NOT EXISTS { ?item wdt:P463 wd:Q1065 }
}
ORDER BY DESC(?sitelinks)
LIMIT 140
`

/** Войны, сражения, революции, договоры — по одному классу на запрос. */
const EVENT_CLASSES = [
  ['Q198', 'войны', 30],
  ['Q178561', 'сражения', 25],
  ['Q10931', 'революции', 12],
  ['Q131569', 'договоры', 10],
]

/** Династии и знатные семьи — из них растут семейные древа. */
const DYNASTY_CLASSES = [
  ['Q164950', 'династии', 30],
  ['Q13417114', 'знатные семьи', 15],
]

/**
 * Занятия, менявшие мир не с трона. По одному запросу на занятие:
 * объединять их через VALUES нельзя — запрос не досчитывается.
 */
const THINKER_OCCUPATIONS = [
  // Правители и полководцы. Монархов ищем именно так: те, кого не найти
  // через свойства государств (Александр Македонский, Чингисхан) иначе
  // выпадают из ядра вовсе.
  ['Q116', 'монархи', 40],
  ['Q82955', 'политики', 40],
  ['Q47064', 'военные', 25],
  ['Q4964182', 'философы', 16],
  ['Q901', 'учёные', 14],
  ['Q170790', 'математики', 10],
  ['Q11063', 'астрономы', 8],
  ['Q39631', 'врачи', 8],
  ['Q36180', 'писатели', 14],
  ['Q1028181', 'художники', 12],
  ['Q36834', 'композиторы', 12],
  ['Q205375', 'изобретатели', 8],
  ['Q11900058', 'путешественники', 8],
]

const byInstanceOf = (qid, limit) => `
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P31 wd:${qid} ;
        wikibase:sitelinks ?sitelinks .
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}
`

const byOccupation = (qid, limit) => `
SELECT ?item ?sitelinks WHERE {
  ?item wdt:P106 wd:${qid} ;
        wikibase:sitelinks ?sitelinks .
}
ORDER BY DESC(?sitelinks)
LIMIT ${limit}
`

export const SELECTION = [
  { type: 'state', query: Q_MODERN_STATES, label: 'государства ООН' },
  { type: 'state', query: Q_HISTORICAL_STATES, label: 'исторические государства' },
  ...EVENT_CLASSES.map(([qid, label, limit]) => ({
    type: 'event',
    query: byInstanceOf(qid, limit),
    label,
  })),
  ...DYNASTY_CLASSES.map(([qid, label, limit]) => ({
    type: 'dynasty',
    query: byInstanceOf(qid, limit),
    label,
  })),
  ...THINKER_OCCUPATIONS.map(([qid, label, limit]) => ({
    type: 'person',
    query: byOccupation(qid, limit),
    label,
  })),
]

/**
 * Сколько правителей, вытянутых из свойств государств, взять в ядро.
 * Отбор — по известности (число языковых разделов Википедии).
 */
export const RULERS_TO_KEEP = 220
