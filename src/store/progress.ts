import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'

/**
 * Прогресс человека. Живёт на устройстве, учётных записей нет.
 * Переносится файлом: «Сохранить в файл» здесь → «Загрузить из файла» там.
 *
 * Части 4–5 добавят сюда поля (ответы на проверки, карточки повторения).
 * Формат файла версионируется: PROGRESS_FILE_VERSION поднимается,
 * а importProgress учит старые версии читаться — иначе люди потеряют прогресс.
 */
export const PROGRESS_KEY = 'atlas.progress.v1'
export const PROGRESS_FILE_VERSION = 1
export const PROGRESS_FILE_MAGIC = 'atlas-progress'

export interface ProgressData {
  xp: number
  /** Ключи пройденных глав, например 'e04c02'. */
  chaptersDone: string[]
  /** Q-номера открытых карточек — по ним считается «сколько мира изучено». */
  entitiesSeen: string[]
  /** Q-номера закладок. */
  bookmarks: string[]
  /** Дни захода в формате ГГГГ-ММ-ДД, по ним считается серия. */
  daysActive: string[]
  createdAt: string
}

export interface ProgressState extends ProgressData {
  addXp: (amount: number) => void
  markChapterDone: (id: string) => void
  markEntitySeen: (qid: string) => void
  toggleBookmark: (qid: string) => void
  touchToday: (today?: string) => void
  replaceAll: (data: ProgressData) => void
  reset: () => void
}

export function emptyProgress(): ProgressData {
  return {
    xp: 0,
    chaptersDone: [],
    entitiesSeen: [],
    bookmarks: [],
    daysActive: [],
    createdAt: new Date().toISOString(),
  }
}

/**
 * Прочитан ли прогресс с устройства.
 *
 * Пока нет — писать НЕЛЬЗЯ. Хранилище асинхронное: в первые мгновения после
 * запуска в памяти лежит пустой прогресс, и любая запись в этот момент
 * стирает на устройстве всё, что человек накопил. Один такой вызов
 * («отметить сегодняшний день») уже стёр пройденную главу при проверке.
 */
let hydrated = false

export function markHydrated() {
  hydrated = true
}

/** Можно ли уже писать прогресс на устройство. Вынесено ради теста. */
export function canWriteProgress(): boolean {
  return hydrated
}

/** Только для тестов: вернуть хранилище в состояние «ещё не прочитано». */
export function resetHydratedForTests() {
  hydrated = false
}

const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return (await idbGet<string>(name)) ?? null
    } catch {
      return null
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    if (!canWriteProgress()) return // см. комментарий у hydrated
    try {
      await idbSet(name, value)
    } catch {
      /* нет права на хранение — не роняем приложение */
    }
  },
  removeItem: async (name: string): Promise<void> => {
    try {
      await idbDel(name)
    } catch {
      /* см. выше */
    }
  },
}

const addUnique = (list: string[], value: string) =>
  list.includes(value) ? list : [...list, value]

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      ...emptyProgress(),
      addXp: (amount) => set((s) => ({ xp: Math.max(0, s.xp + amount) })),
      markChapterDone: (id) => set((s) => ({ chaptersDone: addUnique(s.chaptersDone, id) })),
      markEntitySeen: (qid) => set((s) => ({ entitiesSeen: addUnique(s.entitiesSeen, qid) })),
      toggleBookmark: (qid) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(qid)
            ? s.bookmarks.filter((x) => x !== qid)
            : [...s.bookmarks, qid],
        })),
      touchToday: (today = isoDay()) =>
        set((s) => ({ daysActive: addUnique(s.daysActive, today) })),
      replaceAll: (data) => set({ ...data }),
      reset: () => set({ ...emptyProgress() }),
    }),
    {
      name: PROGRESS_KEY,
      storage: createJSONStorage(() => idbStorage),
      version: 1,
      // Хранилище прочитано (пусть даже с ошибкой) — с этого мгновения
      // писать можно. До него — нет.
      onRehydrateStorage: () => () => markHydrated(),
      partialize: (s): ProgressData => ({
        xp: s.xp,
        chaptersDone: s.chaptersDone,
        entitiesSeen: s.entitiesSeen,
        bookmarks: s.bookmarks,
        daysActive: s.daysActive,
        createdAt: s.createdAt,
      }),
    },
  ),
)

export function isoDay(date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Уровень: каждые 500 опыта. Первый уровень — 1, не 0. */
export function levelFromXp(xp: number): number {
  return Math.floor(Math.max(0, xp) / 500) + 1
}

export function xpIntoLevel(xp: number): { into: number; need: number } {
  const into = Math.max(0, xp) % 500
  return { into, need: 500 }
}

/** Серия — сколько дней подряд, считая назад от сегодня. */
export function streakLength(daysActive: string[], today = isoDay()): number {
  const set = new Set(daysActive)
  if (!set.has(today)) return 0
  let streak = 0
  const cursor = new Date(`${today}T00:00:00`)
  while (set.has(isoDay(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

export interface ProgressFile {
  magic: typeof PROGRESS_FILE_MAGIC
  version: number
  savedAt: string
  data: ProgressData
}

export function exportProgress(data: ProgressData): ProgressFile {
  return {
    magic: PROGRESS_FILE_MAGIC,
    version: PROGRESS_FILE_VERSION,
    savedAt: new Date().toISOString(),
    data,
  }
}

/**
 * Читает файл переноса. Возвращает null на любом мусоре —
 * молча испортить прогресс хуже, чем отказаться его читать.
 */
export function importProgress(raw: unknown): ProgressData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const file = raw as Partial<ProgressFile>
  if (file.magic !== PROGRESS_FILE_MAGIC) return null
  if (typeof file.version !== 'number' || file.version > PROGRESS_FILE_VERSION) return null
  const d = file.data
  if (typeof d !== 'object' || d === null) return null

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []

  return {
    xp: typeof d.xp === 'number' && Number.isFinite(d.xp) ? Math.max(0, d.xp) : 0,
    chaptersDone: strings(d.chaptersDone),
    entitiesSeen: strings(d.entitiesSeen),
    bookmarks: strings(d.bookmarks),
    daysActive: strings(d.daysActive),
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date().toISOString(),
  }
}
