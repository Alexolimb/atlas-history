import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import { detectLanguage, type LangCode } from '@/i18n/languages'

export type Theme = 'dark' | 'light' | 'system'
export type TextSize = 'small' | 'normal' | 'large'

export interface SettingsState {
  language: LangCode
  theme: Theme
  textSize: TextSize
  reducedMotion: boolean
  globe3d: boolean
  musicOn: boolean
  musicVolume: number
  pageSounds: boolean
  /** Первый запуск уже был: значит, значения по умолчанию подбирать больше не надо. */
  firstRunDone: boolean
  setLanguage: (v: LangCode) => void
  setTheme: (v: Theme) => void
  setTextSize: (v: TextSize) => void
  setReducedMotion: (v: boolean) => void
  setGlobe3d: (v: boolean) => void
  setMusicOn: (v: boolean) => void
  setMusicVolume: (v: number) => void
  setPageSounds: (v: boolean) => void
  markFirstRunDone: () => void
}

export const SETTINGS_KEY = 'atlas.settings.v1'

/**
 * Хранилище — IndexedDB, а не localStorage: прогресс справочника вырастет
 * до тысяч карточек, и переезжать потом дороже, чем сразу лечь правильно.
 * Любая ошибка чтения не должна ронять приложение — отдаём null и живём
 * на значениях по умолчанию.
 */
const idbStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      return (await idbGet<string>(name)) ?? null
    } catch {
      return null
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    try {
      await idbSet(name, value)
    } catch {
      /* приватный режим или запрет на хранение — работаем без сохранения */
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

export const defaultSettings = {
  theme: 'dark' as Theme,
  textSize: 'normal' as TextSize,
  reducedMotion: false,
  globe3d: true,
  musicOn: false, // Алекс: по умолчанию ВЫКЛЮЧЕНА
  musicVolume: 0.4,
  pageSounds: false,
}

/**
 * Стоит ли включать объёмный глобус на этом устройстве по умолчанию.
 *
 * Код глобуса весит около двух мегабайт, а сам шар считается видеокартой.
 * На слабом телефоне или в экономии трафика человек получит подтормаживающий
 * шар и съеденный интернет, поэтому там по умолчанию плоская карта.
 * Это ТОЛЬКО значение по умолчанию: переключатель в настройках никуда
 * не девается, и решение всегда остаётся за человеком.
 */
export function guessGlobe3d(): boolean {
  if (typeof navigator === 'undefined') return true

  const nav = navigator as Navigator & {
    deviceMemory?: number
    connection?: { saveData?: boolean; effectiveType?: string }
  }

  if (nav.connection?.saveData) return false
  if (nav.deviceMemory !== undefined && nav.deviceMemory <= 2) return false
  if (nav.hardwareConcurrency !== undefined && nav.hardwareConcurrency <= 2) return false
  const type = nav.connection?.effectiveType
  if (type === 'slow-2g' || type === '2g' || type === '3g') return false

  return true
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      language: 'ru',
      firstRunDone: false,
      ...defaultSettings,
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setGlobe3d: (globe3d) => set({ globe3d }),
      setMusicOn: (musicOn) => set({ musicOn }),
      setMusicVolume: (musicVolume) => set({ musicVolume: clamp01(musicVolume) }),
      setPageSounds: (pageSounds) => set({ pageSounds }),
      markFirstRunDone: () => set({ firstRunDone: true }),
    }),
    {
      name: SETTINGS_KEY,
      storage: createJSONStorage(() => idbStorage),
      version: 1,
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return
        // Первый запуск: язык угадываем по устройству, объёмный глобус —
        // по его силе. Дальше только выбор человека.
        if (!state.language) state.setLanguage(detectLanguage())
        if (!state.firstRunDone) {
          state.setGlobe3d(guessGlobe3d())
          state.markFirstRunDone()
        }
      },
    },
  ),
)

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0
  return Math.min(1, Math.max(0, v))
}

/** Тема, которую надо реально нарисовать: 'system' спрашивает устройство. */
export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}
