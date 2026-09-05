import { describe, it, expect } from 'vitest'
import { searchCore, nameOf, isOffline, type Library } from '@/lib/library'
import type { Entity, Labels } from '@/lib/types'

function makeLib(rows: [string, Partial<Entity>, Labels][]): Library {
  const entities = new Map<string, Entity>()
  const labels = new Map<string, Labels>()
  for (const [id, entity, label] of rows) {
    entities.set(id, { id, type: 'person', fame: 0, relations: [], ...entity })
    labels.set(id, label)
  }
  return { entities, labels, positions: new Map(), lang: 'ru', builtAt: '' }
}

const lib = makeLib([
  ['Q517', { fame: 400 }, { name: 'Наполеон I', descr: 'император французов' }],
  ['Q1048', { fame: 300 }, { name: 'Гай Юлий Цезарь' }],
  ['Q8409', { fame: 350 }, { name: 'Александр Македонский' }],
  ['Q15180', { type: 'state', fame: 250 }, { name: 'СССР' }],
  ['Q999999', { fame: 5 }, { name: 'Наполеон Динамит' }],
  ['Q42', { fame: 10 }, { name: 'Пётр Первый' }],
])

describe('поиск по ядру', () => {
  it('находит по началу имени', () => {
    expect(searchCore(lib, 'напол').map((h) => h.id)).toContain('Q517')
  })

  it('находит по началу любого слова, а не только первого', () => {
    const ids = searchCore(lib, 'македон').map((h) => h.id)
    expect(ids).toEqual(['Q8409'])
  })

  it('при равном совпадении первым идёт более известный', () => {
    const ids = searchCore(lib, 'наполеон').map((h) => h.id)
    expect(ids[0]).toBe('Q517')
    expect(ids).toContain('Q999999')
  })

  it('точное совпадение обгоняет совпадение по началу', () => {
    expect(searchCore(lib, 'СССР')[0].id).toBe('Q15180')
  })

  it('не различает регистр и букву ё', () => {
    expect(searchCore(lib, 'петр').map((h) => h.id)).toContain('Q42')
    expect(searchCore(lib, 'ПЁТР').map((h) => h.id)).toContain('Q42')
  })

  it('на одну букву не ищет: иначе вывалит полсправочника', () => {
    expect(searchCore(lib, 'н')).toEqual([])
    expect(searchCore(lib, ' ')).toEqual([])
  })

  it('находки из ядра помечены как доступные офлайн', () => {
    expect(searchCore(lib, 'цезарь').every((h) => h.offline)).toBe(true)
  })

  it('не находит того, чего нет', () => {
    expect(searchCore(lib, 'зюзюкин')).toEqual([])
  })
})

describe('чтение', () => {
  it('имя берётся из меток', () => {
    expect(nameOf(lib, 'Q517')).toBe('Наполеон I')
  })

  it('без имени показываем Q-номер, а не пустоту', () => {
    expect(nameOf(lib, 'Q7777')).toBe('Q7777')
  })

  it('видно, что откроется без сети', () => {
    expect(isOffline(lib, 'Q517')).toBe(true)
    expect(isOffline(lib, 'Q7777')).toBe(false)
  })
})
