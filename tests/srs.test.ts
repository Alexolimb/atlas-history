import { describe, it, expect } from 'vitest'
import {
  newCard,
  review,
  nextEase,
  dueCards,
  countDue,
  addDays,
  parseKey,
  cardKey,
  MIN_EASE,
  START_EASE,
  type Card,
} from '@/lib/srs'

const TODAY = '2026-09-05'

describe('интервальное повторение', () => {
  it('новая карточка показывается сразу', () => {
    const card = newCard('Q1048|death', TODAY)
    expect(card.due).toBe(TODAY)
    expect(card.interval).toBe(0)
    expect(card.ease).toBe(START_EASE)
  })

  it('вспомнил — интервал растёт: 1 день, 6 дней, дальше умножается', () => {
    let card = newCard('Q1048|death', TODAY)
    card = review(card, 'easy', TODAY)
    expect(card.interval).toBe(1)

    card = review(card, 'easy', addDays(TODAY, 1))
    expect(card.interval).toBe(6)

    card = review(card, 'easy', addDays(TODAY, 7))
    expect(card.interval).toBeGreaterThan(6)
  })

  it('забыл — интервал сбрасывается на завтра, серия обнуляется', () => {
    let card = newCard('Q1|start', TODAY)
    card = review(card, 'easy', TODAY)
    card = review(card, 'easy', addDays(TODAY, 1))
    expect(card.streak).toBe(2)

    card = review(card, 'forgot', addDays(TODAY, 7))
    expect(card.interval).toBe(1)
    expect(card.streak).toBe(0)
    expect(card.due).toBe(addDays(addDays(TODAY, 7), 1))
  })

  it('трудный ответ растит интервал медленнее лёгкого', () => {
    const base = review(review(newCard('Q1|start', TODAY), 'easy', TODAY), 'easy', TODAY)
    const easy = review(base, 'easy', TODAY)
    const hard = review(base, 'hard', TODAY)
    expect(hard.interval).toBeLessThan(easy.interval)
  })

  it('лёгкость не падает ниже предела — иначе карточка застрянет навсегда', () => {
    let ease = START_EASE
    for (let i = 0; i < 30; i++) ease = nextEase(ease, 2)
    expect(ease).toBe(MIN_EASE)
  })

  it('интервал не уходит дальше года', () => {
    let card: Card = { ...newCard('Q1|start', TODAY), interval: 300, streak: 9, ease: 2.9 }
    card = review(card, 'easy', TODAY)
    expect(card.interval).toBeLessThanOrEqual(365)
  })
})

describe('очередь на сегодня', () => {
  const make = (key: string, due: string, ease = 2.5): Card => ({
    key,
    due,
    ease,
    interval: 1,
    streak: 1,
    created: TODAY,
  })

  it('берутся только те, которым пора', () => {
    const cards = [make('a', TODAY), make('b', addDays(TODAY, 3)), make('c', addDays(TODAY, -2))]
    expect(dueCards(cards, TODAY).map((c) => c.key)).toEqual(['c', 'a'])
    expect(countDue(cards, TODAY)).toBe(2)
  })

  it('самые просроченные идут первыми', () => {
    const cards = [make('new', TODAY), make('old', addDays(TODAY, -10))]
    expect(dueCards(cards, TODAY)[0].key).toBe('old')
  })

  it('за раз не вываливается больше, чем человек осилит', () => {
    const many = Array.from({ length: 100 }, (_, i) => make(`k${i}`, TODAY))
    expect(dueCards(many, TODAY).length).toBe(20)
  })
})

describe('ключи карточек', () => {
  it('собираются и разбираются обратно', () => {
    const key = cardKey('Q1048', 'death')
    expect(key).toBe('Q1048|death')
    expect(parseKey(key)).toEqual({ q: 'Q1048', prop: 'death' })
  })

  it('мусор не разбирается', () => {
    expect(parseKey('просто строка')).toBeNull()
    expect(parseKey('')).toBeNull()
  })
})

describe('сдвиг дат', () => {
  it('переходит через конец месяца', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})
