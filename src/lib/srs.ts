/**
 * Интервальное повторение.
 *
 * Смысл: факт возвращается человеку ровно тогда, когда он начинает
 * выветриваться из памяти. Вспомнил легко — следующий раз нескоро.
 * Не вспомнил — завтра снова.
 *
 * Взят алгоритм SM-2 — тот же, на котором работают Anki и Duolingo.
 * Он старый, простой и проверенный десятилетиями; выдумывать свой,
 * когда речь о чужой памяти, незачем.
 */

export type Grade = 0 | 1 | 2 | 3 | 4 | 5

/** Как человек ответил. Три кнопки вместо шести — их проще выбрать не думая. */
export type Answer = 'forgot' | 'hard' | 'easy'

export const GRADE_OF: Record<Answer, Grade> = {
  forgot: 2, // не вспомнил
  hard: 3, // вспомнил с трудом
  easy: 5, // вспомнил сразу
}

export interface Card {
  /** Что повторяем: `<Q-номер>|<свойство>`, например `Q1048|death`. */
  key: string
  /** Насколько легко даётся эта карточка. Меньше — чаще показываем. */
  ease: number
  /** Через сколько дней показать снова. */
  interval: number
  /** Сколько раз подряд вспомнил. */
  streak: number
  /** Когда показать: ГГГГ-ММ-ДД. */
  due: string
  /** Когда завели. */
  created: string
}

export const MIN_EASE = 1.3
export const START_EASE = 2.5

export function newCard(key: string, today: string): Card {
  return { key, ease: START_EASE, interval: 0, streak: 0, due: today, created: today }
}

/**
 * Пересчёт карточки после ответа.
 *
 * Забыл — интервал сбрасывается в один день, и лёгкость чуть падает.
 * Вспомнил — интервал растёт: 1 день, 6 дней, дальше умножается на лёгкость.
 */
export function review(card: Card, answer: Answer, today: string): Card {
  const grade = GRADE_OF[answer]
  const ease = nextEase(card.ease, grade)

  if (grade < 3) {
    return { ...card, ease, interval: 1, streak: 0, due: addDays(today, 1) }
  }

  const streak = card.streak + 1
  const interval =
    streak === 1 ? 1 : streak === 2 ? 6 : Math.round(card.interval * ease)

  // Дальше года не заглядываем: за такой срок и сам справочник поменяется.
  const capped = Math.min(interval, 365)
  return { ...card, ease, interval: capped, streak, due: addDays(today, capped) }
}

/** Формула лёгкости из SM-2. Ниже MIN_EASE не опускается — иначе карточка застрянет. */
export function nextEase(ease: number, grade: Grade): number {
  const next = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02))
  return Math.max(MIN_EASE, Math.round(next * 100) / 100)
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00`)
  date.setDate(date.getDate() + days)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Карточки, которым пора. Самые просроченные — первыми. */
export function dueCards(cards: Card[], today: string, limit = 20): Card[] {
  return cards
    .filter((card) => card.due <= today)
    .sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.ease - b.ease))
    .slice(0, limit)
}

export function countDue(cards: Card[], today: string): number {
  return cards.filter((card) => card.due <= today).length
}

/** Разбор ключа карточки обратно в Q-номер и свойство. */
export function parseKey(key: string): { q: string; prop: string } | null {
  const [q, prop] = key.split('|')
  if (!q || !prop) return null
  return { q, prop }
}

export function cardKey(q: string, prop: string): string {
  return `${q}|${prop}`
}
