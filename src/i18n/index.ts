import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './locales/ru.json'
import en from './locales/en.json'
import { uiLanguage } from './languages'

/**
 * Часть 0 везёт только ru и en. Остальные 28 языков приезжают в части 8,
 * до этого их интерфейс падает на английский (см. uiLanguage).
 */
export const resources = {
  ru: { translation: ru },
  en: { translation: en },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: 'ru',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
})

export function applyUiLanguage(code: string) {
  const ui = uiLanguage(code)
  if (i18n.language !== ui) void i18n.changeLanguage(ui)
}

export default i18n
