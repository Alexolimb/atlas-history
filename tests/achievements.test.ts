import { describe, it, expect } from 'vitest'
import { achievementsOf, earnedCount, pickOfTheDay } from '@/lib/achievements'
import { emptyProgress } from '@/store/progress'
import { isoDay } from '@/store/progress'

const TODAY = isoDay(new Date('2026-09-05T12:00:00'))

describe('достижения', () => {
  it('на чистом прогрессе не выдаётся ни одного — за вход не хвалим', () => {
    const list = achievementsOf(emptyProgress(), TODAY)
    expect(earnedCount(list)).toBe(0)
  })

  it('первая прочитанная глава засчитывается', () => {
    const list = achievementsOf({ ...emptyProgress(), chaptersDone: ['e04c01'] }, TODAY)
    expect(list.find((a) => a.id === 'firstChapter')?.done).toBe(true)
    expect(list.find((a) => a.id === 'fiveChapters')?.done).toBe(false)
  })

  it('показывает, сколько осталось до цели', () => {
    const list = achievementsOf({ ...emptyProgress(), chaptersDone: ['a', 'b'] }, TODAY)
    const five = list.find((a) => a.id === 'fiveChapters')
    expect(five?.have).toBe(2)
    expect(five?.goal).toBe(5)
  })

  it('перевыполнение не показывается как «7 из 5»', () => {
    const many = Array.from({ length: 9 }, (_, i) => `c${i}`)
    const list = achievementsOf({ ...emptyProgress(), chaptersDone: many }, TODAY)
    const five = list.find((a) => a.id === 'fiveChapters')
    expect(five?.have).toBe(5)
    expect(five?.done).toBe(true)
  })

  it('серия дней считается от сегодняшнего дня', () => {
    const days = ['2026-09-05', '2026-09-04', '2026-09-03']
    const list = achievementsOf({ ...emptyProgress(), daysActive: days }, TODAY)
    expect(list.find((a) => a.id === 'streak3')?.done).toBe(true)
    expect(list.find((a) => a.id === 'streak7')?.done).toBe(false)
  })

  it('уровень считается из опыта', () => {
    const list = achievementsOf({ ...emptyProgress(), xp: 600 }, TODAY)
    expect(list.find((a) => a.id === 'level2')?.done).toBe(true)
    expect(list.find((a) => a.id === 'level5')?.done).toBe(false)
  })
})

describe('тайна дня', () => {
  const items = ['a', 'b', 'c', 'd', 'e']

  it('в один день у всех одна и та же', () => {
    expect(pickOfTheDay(items, '2026-09-05')).toBe(pickOfTheDay(items, '2026-09-05'))
  })

  it('на другой день другая', () => {
    const week = ['2026-09-05', '2026-09-06', '2026-09-07', '2026-09-08', '2026-09-09'].map((d) =>
      pickOfTheDay(items, d),
    )
    expect(new Set(week).size).toBeGreaterThan(1)
  })

  it('пустой список не роняет экран', () => {
    expect(pickOfTheDay([], '2026-09-05')).toBeUndefined()
  })
})
