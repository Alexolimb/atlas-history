// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { looksNotLikeCountry } from '../scripts/data/reject-words.mjs'

/**
 * Правило, по которому связывание отказывается принимать находку.
 * Тест нужен потому, что ошибка здесь тихая и обидная: по нажатию на страну
 * откроется карточка утки или фильма, и человек прочитает неправду.
 */
describe('что точно не страна', () => {
  const notCountries = [
    'species of duck',
    '1998 film directed by someone',
    'song by a band',
    'family name',
    'given name',
    'video game',
    '2003 novel',
    'painting by Rembrandt',
    'Norwegian footballer',
  ]

  for (const descr of notCountries) {
    it(`«${descr}» отвергается`, () => {
      expect(looksNotLikeCountry(descr)).toBe(true)
    })
  }

  const countries = [
    'former country in Eurasia (1922–1991)',
    'historical principality in Eastern Europe',
    'empire in the Mediterranean',
    'sovereign state in Western Europe',
    'ancient kingdom',
    'city-state in Mesopotamia',
  ]

  for (const descr of countries) {
    it(`«${descr}» проходит`, () => {
      expect(looksNotLikeCountry(descr)).toBe(false)
    })
  }

  it('проверяются целые слова: Brandenburg не «band», Bookland не «book»', () => {
    expect(looksNotLikeCountry('margraviate around Brandenburg')).toBe(false)
    expect(looksNotLikeCountry('region called Bookland')).toBe(false)
  })

  it('пустое описание ничего не отвергает', () => {
    expect(looksNotLikeCountry(undefined)).toBe(false)
    expect(looksNotLikeCountry('')).toBe(false)
  })
})
