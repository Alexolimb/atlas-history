import type { Feature, FeatureCollection, Geometry } from 'geojson'

/**
 * Карты границ по срезам времени. Один срез — это мир в конкретный год.
 *
 * Грузим строго по одному: 52 карты вместе весят 3,5 МБ, и тянуть их разом
 * ради одного года на ползунке нельзя. Загруженное остаётся в памяти,
 * поэтому елозить ползунком туда-сюда быстро.
 */

const BASE = import.meta.env.BASE_URL

export interface BorderProps {
  name: string
  /** Точность границы по оценке автора карт: 1 — примерно, 3 — по документам. */
  precision?: number
  subjectTo?: string
}

export type BorderFeature = Feature<Geometry, BorderProps>
export type BorderMap = FeatureCollection<Geometry, BorderProps>

export interface BordersIndex {
  version: number
  builtAt: string
  source: string
  licence: string
  note: string
  years: { year: number; file: string; features: number; kb: number }[]
}

let indexPromise: Promise<BordersIndex> | null = null
const mapCache = new Map<number, Promise<BorderMap>>()
let linksPromise: Promise<Record<string, string>> | null = null

export function loadBordersIndex(): Promise<BordersIndex> {
  indexPromise ??= fetch(`${BASE}data/borders/index.json`).then((res) => {
    if (!res.ok) throw new Error('Карты границ не загрузились')
    return res.json() as Promise<BordersIndex>
  })
  return indexPromise
}

export function loadBorderMap(year: number): Promise<BorderMap> {
  const cached = mapCache.get(year)
  if (cached) return cached

  const promise = fetch(`${BASE}data/borders/${year}.json`).then((res) => {
    if (!res.ok) throw new Error(`Карта ${year} не загрузилась`)
    return res.json() as Promise<BorderMap>
  })
  mapCache.set(year, promise)
  return promise
}

/** Подпись страны на карте → Q-номер карточки. Связано не всё, и это честно. */
export function loadBorderLinks(): Promise<Record<string, string>> {
  linksPromise ??= fetch(`${BASE}data/borders/links.json`)
    .then((res) => (res.ok ? res.json() : { links: {} }))
    .then((file: { links?: Record<string, string> }) => file.links ?? {})
    .catch(() => ({}))
  return linksPromise
}

/** Ближайший срез к выбранному году. Карты есть не на каждый год. */
export function nearestYear(index: BordersIndex, year: number): number {
  let best = index.years[0]?.year ?? 0
  let bestDiff = Number.POSITIVE_INFINITY
  for (const row of index.years) {
    const diff = Math.abs(row.year - year)
    if (diff < bestDiff) {
      bestDiff = diff
      best = row.year
    }
  }
  return best
}

/**
 * Цвет страны. Один и тот же для одного имени во все годы — чтобы,
 * двигая ползунок, было видно, как ИМЕННО ЭТА страна росла и сжималась,
 * а не мельтешение случайных цветов.
 *
 * Оттенок берём из имени, а насыщенность и светлоту держим в узком
 * диапазоне: иначе на тёмном фоне часть стран станет неразличимой.
 */
export function colorForCountry(name: string, dim = false): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  const hue = hash % 360
  const sat = dim ? 28 : 46
  const light = dim ? 34 : 52
  const alpha = dim ? 0.5 : 0.72
  return `hsla(${hue}, ${sat}%, ${light}%, ${alpha})`
}

/** Год человеческими словами для подписи под ползунком. */
export function yearLabel(year: number, lang: string): string {
  if (year < 0) return lang === 'ru' ? `${-year} до н. э.` : `${-year} BC`
  return String(year)
}
