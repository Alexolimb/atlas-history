import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru.json'
import en from './locales/en.json'
import { getLanguage } from './languages'

/**
 * Языки интерфейса.
 *
 * Русский и английский лежат внутри кода: это язык по умолчанию и язык,
 * на который всё падает, если перевода нет. Остальные 28 подгружаются
 * файлами из `public/locales/` при выборе — класть их все в первую
 * загрузку значило бы заставить каждого качать 360 КБ чужих языков.
 */

const BASE = import.meta.env.BASE_URL

void i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
  },
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

/** Языки, файлы которых уже привезли. */
const loaded = new Set(['ru', 'en'])
const loading = new Map<string, Promise<boolean>>()

/**
 * Привезти перевод языка. Возвращает, получилось ли:
 * не получилось — интерфейс останется на английском, и это не беда,
 * потому что весь справочник всё равно будет на выбранном языке.
 */
async function fetchTranslation(code: string): Promise<boolean> {
  if (loaded.has(code)) return true
  const already = loading.get(code)
  if (already) return already

  const task = (async () => {
    try {
      const res = await fetch(`${BASE}locales/${code}.json`)
      if (!res.ok) return false
      const table = (await res.json()) as Record<string, unknown>
      i18n.addResourceBundle(code, 'translation', table, true, true)
      loaded.add(code)
      return true
    } catch {
      return false
    } finally {
      loading.delete(code)
    }
  })()

  loading.set(code, task)
  return task
}

/**
 * Поставить язык интерфейса. Пока файл едет, экран остаётся на прежнем
 * языке — мигать английским на полсекунды хуже, чем подождать.
 */
export async function applyUiLanguage(code: string): Promise<void> {
  const lang = getLanguage(code)
  if (!lang) return

  // Русский и английский уже внутри — переключаемся мгновенно.
  if (loaded.has(code)) {
    if (i18n.language !== code) await i18n.changeLanguage(code)
    return
  }

  const ok = await fetchTranslation(code)
  const target = ok ? code : 'en'
  if (i18n.language !== target) await i18n.changeLanguage(target)
}

export default i18n
