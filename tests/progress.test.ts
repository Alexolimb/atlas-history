import { describe, it, expect } from 'vitest'
import {
  levelFromXp,
  xpIntoLevel,
  streakLength,
  isoDay,
  exportProgress,
  importProgress,
  emptyProgress,
  PROGRESS_FILE_MAGIC,
  canWriteProgress,
  markHydrated,
  resetHydratedForTests,
} from '@/store/progress'

describe('уровни и опыт', () => {
  it('первый уровень начинается с единицы, а не с нуля', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(499)).toBe(1)
    expect(levelFromXp(500)).toBe(2)
    expect(levelFromXp(1250)).toBe(3)
  })

  it('отрицательный опыт не роняет уровень ниже первого', () => {
    expect(levelFromXp(-100)).toBe(1)
    expect(xpIntoLevel(-100).into).toBe(0)
  })

  it('остаток до следующего уровня считается верно', () => {
    expect(xpIntoLevel(750)).toEqual({ into: 250, need: 500 })
  })
})

describe('серия дней', () => {
  const day = (offset: number) => {
    const d = new Date('2026-09-05T12:00:00')
    d.setDate(d.getDate() + offset)
    return isoDay(d)
  }
  const today = day(0)

  it('без сегодняшнего дня серия обнуляется', () => {
    expect(streakLength([day(-1), day(-2)], today)).toBe(0)
  })

  it('считает подряд идущие дни назад от сегодня', () => {
    expect(streakLength([today, day(-1), day(-2)], today)).toBe(3)
  })

  it('пропущенный день обрывает серию', () => {
    expect(streakLength([today, day(-1), day(-3), day(-4)], today)).toBe(2)
  })

  it('порядок дней в списке не важен', () => {
    expect(streakLength([day(-2), today, day(-1)], today)).toBe(3)
  })
})

describe('файл переноса прогресса', () => {
  it('сохранённое читается обратно без потерь', () => {
    const data = { ...emptyProgress(), xp: 1200, chaptersDone: ['e04c01'], bookmarks: ['Q1048'] }
    const restored = importProgress(exportProgress(data))
    expect(restored).not.toBeNull()
    expect(restored?.xp).toBe(1200)
    expect(restored?.chaptersDone).toEqual(['e04c01'])
    expect(restored?.bookmarks).toEqual(['Q1048'])
  })

  it('чужой или испорченный файл отвергается, а не портит прогресс', () => {
    expect(importProgress(null)).toBeNull()
    expect(importProgress({})).toBeNull()
    expect(importProgress({ magic: 'not-atlas', version: 1, data: {} })).toBeNull()
    expect(importProgress('строка')).toBeNull()
  })

  it('файл из будущей версии не читается вслепую', () => {
    expect(
      importProgress({ magic: PROGRESS_FILE_MAGIC, version: 99, data: emptyProgress() }),
    ).toBeNull()
  })

  it('мусор внутри полей отфильтровывается', () => {
    const restored = importProgress({
      magic: PROGRESS_FILE_MAGIC,
      version: 1,
      data: { xp: 'много', chaptersDone: ['ok', 42, null], bookmarks: 'нет', daysActive: [] },
    })
    expect(restored?.xp).toBe(0)
    expect(restored?.chaptersDone).toEqual(['ok'])
    expect(restored?.bookmarks).toEqual([])
  })
})

describe('защита прогресса от затирания при запуске', () => {
  it('до чтения с устройства писать нельзя, после — можно', () => {
    resetHydratedForTests()
    // Пока прогресс не прочитан, в памяти лежит пустышка. Любая запись
    // в этот момент стёрла бы всё, что человек накопил.
    expect(canWriteProgress()).toBe(false)
    markHydrated()
    expect(canWriteProgress()).toBe(true)
  })
})
