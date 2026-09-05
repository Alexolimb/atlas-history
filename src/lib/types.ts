/**
 * Форма данных справочника. Один и тот же файл читают и сборочные скрипты,
 * и приложение — поэтому разъехаться они не могут.
 *
 * Железное правило: у всего, что показывается человеку, есть `id` вида Q1234.
 * По нему всегда собирается ссылка на источник. Нет Q-номера — нет карточки.
 */

export type EntityType = 'state' | 'person' | 'event' | 'dynasty'

/** Дата в Wikidata бывает известна с точностью до года, десятилетия или века. */
export interface HistDate {
  /** Год. Отрицательный — до нашей эры. −44 это 44 год до н. э. */
  year: number
  month?: number
  day?: number
  /** 9 — год, 8 — десятилетие, 7 — век, 11 — точный день. Как в Wikidata. */
  precision: number
}

/** Связь между сущностями: кто чей отец, кто чем правил. */
export interface Relation {
  /** Свойство Wikidata: P22 отец, P35 глава государства, P40 ребёнок… */
  prop: string
  /** Q-номер того, с кем связь. */
  id: string
  /** Начало, если у связи есть срок (правление, брак). */
  from?: HistDate
  to?: HistDate
}

/** Языконезависимая часть карточки. Лежит в общем файле для всех языков. */
export interface Entity {
  id: string
  type: EntityType
  start?: HistDate
  end?: HistDate
  /** Точка на карте: [широта, долгота]. */
  coords?: [number, number]
  /** Имя файла на Викискладе. Полный адрес собирается на лету. */
  image?: string
  /** Насколько сущность известна: число языковых разделов Википедии. */
  fame: number
  relations: Relation[]
}

/** Имя и описание на одном языке. Лежат в отдельном файле на язык. */
export interface Labels {
  name: string
  descr?: string
  /** Заголовок статьи Википедии на этом языке. Есть не у всех. */
  wiki?: string
}

/** Пакет ядра: то, что уезжает внутрь приложения и работает офлайн. */
export interface CorePack {
  version: number
  builtAt: string
  entities: Entity[]
}

export interface LabelPack {
  lang: string
  labels: Record<string, Labels>
}

/* ------------------------- Свойства, которыми пользуемся ------------------------- */

export const PROPS = {
  father: 'P22',
  mother: 'P25',
  spouse: 'P26',
  child: 'P40',
  sibling: 'P3373',
  headOfState: 'P35',
  headOfGovernment: 'P6',
  monarch: 'P1830',
  positionHeld: 'P39',
  country: 'P17',
  dynasty: 'P53',
  replaces: 'P1365',
  replacedBy: 'P1366',
  partOf: 'P361',
  participant: 'P710',
  location: 'P276',
} as const

/** Родственные связи — из них строятся семейные древа. */
export const FAMILY_PROPS: string[] = [
  PROPS.father,
  PROPS.mother,
  PROPS.spouse,
  PROPS.child,
  PROPS.sibling,
]

/** Связи «кто правил» — из них строится лента правителей государства. */
export const RULER_PROPS: string[] = [PROPS.headOfState, PROPS.headOfGovernment, PROPS.monarch]

/* --------------------------------- Помощники --------------------------------- */

/** Адрес карточки в Wikidata — та самая кнопка «Источник». */
export function wikidataUrl(id: string): string {
  return `https://www.wikidata.org/wiki/${id}`
}

/** Адрес статьи Википедии на нужном языке. */
export function wikipediaUrl(lang: string, title: string): string {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

/** Картинка с Викисклада нужной ширины. Отдаётся уменьшенной, чтобы не жечь трафик. */
export function commonsImageUrl(file: string, width = 640): string {
  const name = file.replace(/ /g, '_')
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name)}?width=${width}`
}

/** Страница файла на Викискладе — там автор и лицензия снимка. */
export function commonsFilePage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`
}

/**
 * Дата человеческими словами, на языке человека.
 *
 * Русский и английский написаны вручную: у них есть свои привычные обороты
 * («5 век до н. э.», «1920-е»), которые машинный формат не даёт.
 * Остальные 28 языков форматирует сам браузер — он знает, что «до нашей эры»
 * по-японски будет 紀元前, а на иврите לפנה״ס, и делает это правильнее,
 * чем вышло бы у меня по словарю.
 *
 * Календарь всюду принудительно григорианский, а цифры — обычные. Иначе,
 * например, тайский по умолчанию покажет буддийский год, и человек увидит
 * «500» там, где во всём остальном приложении стоит «−44».
 */
export function formatHistDate(date: HistDate | undefined, lang: string): string {
  if (!date) return ''
  if (lang === 'ru' || lang === 'en') return formatRuEn(date, lang)
  return formatIntl(date, lang)
}

/** Форматирование средствами браузера — для всех языков, кроме ru и en. */
function formatIntl(date: HistDate, lang: string): string {
  const base = { calendar: 'gregory', numberingSystem: 'latn', timeZone: 'UTC' } as const

  // Год в JavaScript: 1 год до н. э. — это 0, 44 до н. э. — это −43.
  const jsYear = date.year <= 0 ? date.year + 1 : date.year
  const value = new Date(Date.UTC(2000, date.month ? date.month - 1 : 0, date.day ?? 1))
  value.setUTCFullYear(jsYear)

  const era = date.year <= 0 ? { era: 'short' as const } : {}

  try {
    if (date.precision >= 11 && date.day && date.month) {
      return new Intl.DateTimeFormat(lang, { ...base, ...era, year: 'numeric', month: 'long', day: 'numeric' }).format(value)
    }
    if (date.precision >= 10 && date.month) {
      return new Intl.DateTimeFormat(lang, { ...base, ...era, year: 'numeric', month: 'long' }).format(value)
    }
    const year = new Intl.DateTimeFormat(lang, { ...base, ...era, year: 'numeric' }).format(value)
    // Точность ниже года — честно помечаем, что это примерно.
    return date.precision < 9 ? `≈ ${year}` : year
  } catch {
    // Неизвестный язык — лучше английская дата, чем пустое место.
    return formatRuEn(date, 'en')
  }
}

/** Русский и английский: свои обороты для веков, десятилетий и тысячелетий. */
function formatRuEn(date: HistDate, lang: string): string {
  const bc = date.year < 0
  const year = Math.abs(date.year)
  const ru = lang === 'ru'
  const era = bc ? (ru ? ' до н. э.' : ' BC') : ''

  if (date.precision <= 6) {
    const millennium = Math.ceil(year / 1000)
    return ru ? `${millennium}-е тысячелетие${era}` : `${millennium}th millennium${era}`
  }
  if (date.precision === 7) {
    const century = Math.ceil(year / 100)
    return ru ? `${century} век${era}` : `${century}th century${era}`
  }
  if (date.precision === 8) {
    return ru ? `${Math.floor(year / 10) * 10}-е${era}` : `${Math.floor(year / 10) * 10}s${era}`
  }
  if (date.precision >= 10 && date.month) {
    const monthName = MONTHS[ru ? 'ru' : 'en'][date.month - 1]
    if (date.precision >= 11 && date.day) {
      return ru ? `${date.day} ${monthName} ${year}${era}` : `${monthName} ${date.day}, ${year}${era}`
    }
    return `${monthName} ${year}${era}`
  }
  return `${year}${era}`
}


/** Месяцы в родительном падеже: «14 июля», а не «14 июль». */
const MONTHS = {
  ru: [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
} as const

/** Срок жизни или существования одной строкой: «−753 — 476». */
export function formatSpan(entity: Pick<Entity, 'start' | 'end'>, lang: string): string {
  const from = formatHistDate(entity.start, lang)
  const to = formatHistDate(entity.end, lang)
  if (from && to) return `${from} — ${to}`
  if (from) return lang === 'ru' ? `с ${from}` : `from ${from}`
  if (to) return lang === 'ru' ? `до ${to}` : `until ${to}`
  return ''
}

/** Существовала ли сущность в этот год. Нужно ползунку времени на глобусе. */
export function existsInYear(entity: Pick<Entity, 'start' | 'end'>, year: number): boolean {
  const from = entity.start?.year
  const to = entity.end?.year
  if (from !== undefined && year < from) return false
  if (to !== undefined && year > to) return false
  return from !== undefined || to !== undefined
}
