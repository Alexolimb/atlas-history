import { get as idbGet, set as idbSet, keys as idbKeys, del as idbDel } from 'idb-keyval'

/**
 * Кэш того, что догрузилось из сети. Ровно та вещь, ради которой Алекс просил
 * «глубина онлайн с кэшем»: открыл карточку один раз — дальше она открывается
 * без интернета.
 *
 * Взято idb-keyval, а не полноценная база: обращение всегда одно и то же —
 * «дай по Q-номеру». Поиск идёт по ядру, которое и так лежит в памяти,
 * поэтому движок запросов тут ничего бы не дал.
 *
 * Любая ошибка хранилища проглатывается: в приватном окне браузера или при
 * запрете на хранение приложение обязано работать, просто без запоминания.
 */

const PREFIX = 'atlas.cache.'
const MAX_ENTRIES = 4000
/** Через сколько запись считается протухшей: 90 дней. */
const TTL_MS = 90 * 24 * 60 * 60 * 1000

interface Wrapped<T> {
  at: number
  value: T
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const wrapped = await idbGet<Wrapped<T>>(PREFIX + key)
    if (!wrapped) return null
    if (Date.now() - wrapped.at > TTL_MS) {
      void idbDel(PREFIX + key)
      return null
    }
    return wrapped.value
  } catch {
    return null
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    await idbSet(PREFIX + key, { at: Date.now(), value } satisfies Wrapped<T>)
  } catch {
    /* нет права хранить — живём без кэша */
  }
}

/**
 * Подрезка кэша. Вызывается изредка: браузер даёт ограниченное место,
 * и лучше выкинуть старое самим, чем получить отказ на запись.
 */
export async function cacheTrim(): Promise<number> {
  try {
    const all = (await idbKeys()) as string[]
    const ours = all.filter((k) => typeof k === 'string' && k.startsWith(PREFIX))
    if (ours.length <= MAX_ENTRIES) return 0
    const excess = ours.length - MAX_ENTRIES
    // Порядок ключей в IndexedDB стабильный, так что режем начало —
    // этого достаточно, чтобы кэш не рос бесконечно.
    await Promise.all(ours.slice(0, excess).map((k) => idbDel(k)))
    return excess
  } catch {
    return 0
  }
}

export async function cacheClear(): Promise<void> {
  try {
    const all = (await idbKeys()) as string[]
    await Promise.all(
      all.filter((k) => typeof k === 'string' && k.startsWith(PREFIX)).map((k) => idbDel(k)),
    )
  } catch {
    /* см. выше */
  }
}
