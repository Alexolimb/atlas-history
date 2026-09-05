import type { ProgressData } from '@/store/progress'
import { levelFromXp, streakLength } from '@/store/progress'

/**
 * Достижения.
 *
 * Правило одно: достижение отмечает то, что человек ДЕЙСТВИТЕЛЬНО сделал,
 * и считается из настоящего прогресса. Никаких «поздравляем с входом» —
 * такая похвала обесценивает и остальные.
 *
 * Названия и описания лежат в файлах языков (`achievements.<id>.*`).
 */

export interface Achievement {
  id: string
  /** Сколько нужно набрать. */
  goal: number
  /** Сколько уже набрано. */
  have: number
  done: boolean
  icon: string
}

export function achievementsOf(progress: ProgressData, today?: string): Achievement[] {
  const chapters = progress.chaptersDone.length
  const cards = progress.entitiesSeen.length
  const streak = streakLength(progress.daysActive, today)
  const level = levelFromXp(progress.xp)
  const bookmarks = progress.bookmarks.length

  const make = (id: string, icon: string, have: number, goal: number): Achievement => ({
    id,
    icon,
    goal,
    have: Math.min(have, goal),
    done: have >= goal,
  })

  return [
    make('firstChapter', '📖', chapters, 1),
    make('fiveChapters', '📚', chapters, 5),
    make('epoch', '🏛', chapters, 12),
    make('curious', '🔎', cards, 10),
    make('explorer', '🧭', cards, 50),
    make('cartographer', '🗺', cards, 200),
    make('streak3', '🔥', streak, 3),
    make('streak7', '🔥', streak, 7),
    make('streak30', '🔥', streak, 30),
    make('level2', '⭐', level, 2),
    make('level5', '🌟', level, 5),
    make('collector', '🔖', bookmarks, 10),
  ]
}

export function earnedCount(list: Achievement[]): number {
  return list.filter((a) => a.done).length
}

/**
 * «Тайна дня» — одна карточка, одна и та же для всех в течение суток.
 *
 * Выбирается из списка по дате, а не случайно: тогда завтра будет другая,
 * а сегодня у всех одинаковая, и её можно обсудить с кем-то ещё.
 */
export function pickOfTheDay<T>(items: T[], day: string): T | undefined {
  if (!items.length) return undefined
  let hash = 0
  for (let i = 0; i < day.length; i++) hash = (hash * 31 + day.charCodeAt(i)) >>> 0
  return items[hash % items.length]
}
