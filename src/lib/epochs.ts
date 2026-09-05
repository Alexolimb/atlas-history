/**
 * Двенадцать эпох пути. Порядок и границы утверждены в docs/ПЛАН.md §3.
 *
 * Эпоха — это не «параграф учебника», а слой времени: внутри неё главы идут
 * по регионам мира, чтобы было видно, что происходило ОДНОВРЕМЕННО в Риме,
 * в Китае и в Америке. Школа этого почти никогда не даёт.
 *
 * Названия эпох лежат в файлах языков (`path.epochs.<номер>`), здесь — только
 * числа и оформление, одинаковые на всех языках.
 */

export interface Epoch {
  n: number
  from: number
  to: number
  /** Год, на который встаёт глобус, когда открываешь эпоху. */
  globeYear: number
}

export const EPOCHS: Epoch[] = [
  { n: 1, from: -10000, to: -3500, globeYear: -5000 },
  { n: 2, from: -3500, to: -1200, globeYear: -2000 },
  { n: 3, from: -1200, to: -500, globeYear: -700 },
  { n: 4, from: -500, to: 0, globeYear: -300 },
  { n: 5, from: 0, to: 500, globeYear: 200 },
  { n: 6, from: 500, to: 1000, globeYear: 800 },
  { n: 7, from: 1000, to: 1300, globeYear: 1200 },
  { n: 8, from: 1300, to: 1500, globeYear: 1400 },
  { n: 9, from: 1500, to: 1650, globeYear: 1600 },
  { n: 10, from: 1650, to: 1789, globeYear: 1715 },
  { n: 11, from: 1789, to: 1914, globeYear: 1815 },
  { n: 12, from: 1914, to: 2026, globeYear: 1945 },
]

export function epochOf(n: number): Epoch | undefined {
  return EPOCHS.find((e) => e.n === n)
}

/** Номер эпохи с ведущим нулём — так же, как в именах файлов глав. */
export function epochKey(n: number): string {
  return String(n).padStart(2, '0')
}

/** Границы эпохи словами: «−500 … 0». */
export function epochSpan(epoch: Epoch, lang: string): string {
  const y = (year: number) =>
    year < 0 ? (lang === 'ru' ? `${-year} до н. э.` : `${-year} BC`) : String(year)
  return `${y(epoch.from)} — ${y(epoch.to)}`
}
