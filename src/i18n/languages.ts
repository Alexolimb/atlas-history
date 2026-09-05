/**
 * 30 языков приложения.
 *
 * `code` — он же код раздела Википедии, поэтому одно и то же значение
 * задаёт и язык интерфейса, и язык, на котором приходят имена и описания
 * из справочника. Второй список кодов заводить нельзя: разъедутся.
 *
 * `uiReady` — есть ли перевод кнопок и меню. Часть 0 даёт ru и en;
 * остальные 28 включаются в части 8, когда появятся их JSON.
 * Пока uiReady=false интерфейс показывается по-английски, а справочник —
 * уже на выбранном языке.
 */
export type LangCode = (typeof LANGUAGES)[number]['code']

export const LANGUAGES = [
  { code: 'ru', name: 'Русский', english: 'Russian', rtl: false, uiReady: true },
  { code: 'en', name: 'English', english: 'English', rtl: false, uiReady: true },
  { code: 'es', name: 'Español', english: 'Spanish', rtl: false, uiReady: false },
  { code: 'zh', name: '中文', english: 'Chinese', rtl: false, uiReady: false },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', rtl: false, uiReady: false },
  { code: 'ar', name: 'العربية', english: 'Arabic', rtl: true, uiReady: false },
  { code: 'pt', name: 'Português', english: 'Portuguese', rtl: false, uiReady: false },
  { code: 'fr', name: 'Français', english: 'French', rtl: false, uiReady: false },
  { code: 'de', name: 'Deutsch', english: 'German', rtl: false, uiReady: false },
  { code: 'ja', name: '日本語', english: 'Japanese', rtl: false, uiReady: false },
  { code: 'ko', name: '한국어', english: 'Korean', rtl: false, uiReady: false },
  { code: 'it', name: 'Italiano', english: 'Italian', rtl: false, uiReady: false },
  { code: 'tr', name: 'Türkçe', english: 'Turkish', rtl: false, uiReady: false },
  { code: 'pl', name: 'Polski', english: 'Polish', rtl: false, uiReady: false },
  { code: 'uk', name: 'Українська', english: 'Ukrainian', rtl: false, uiReady: false },
  { code: 'nl', name: 'Nederlands', english: 'Dutch', rtl: false, uiReady: false },
  { code: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', rtl: false, uiReady: false },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', rtl: false, uiReady: false },
  { code: 'th', name: 'ไทย', english: 'Thai', rtl: false, uiReady: false },
  { code: 'fa', name: 'فارسی', english: 'Persian', rtl: true, uiReady: false },
  { code: 'sv', name: 'Svenska', english: 'Swedish', rtl: false, uiReady: false },
  { code: 'cs', name: 'Čeština', english: 'Czech', rtl: false, uiReady: false },
  { code: 'el', name: 'Ελληνικά', english: 'Greek', rtl: false, uiReady: false },
  { code: 'he', name: 'עברית', english: 'Hebrew', rtl: true, uiReady: false },
  { code: 'ro', name: 'Română', english: 'Romanian', rtl: false, uiReady: false },
  { code: 'hu', name: 'Magyar', english: 'Hungarian', rtl: false, uiReady: false },
  { code: 'da', name: 'Dansk', english: 'Danish', rtl: false, uiReady: false },
  { code: 'fi', name: 'Suomi', english: 'Finnish', rtl: false, uiReady: false },
  { code: 'no', name: 'Norsk', english: 'Norwegian', rtl: false, uiReady: false },
  { code: 'bn', name: 'বাংলা', english: 'Bengali', rtl: false, uiReady: false },
] as const

export const LANG_CODES = LANGUAGES.map((l) => l.code)

export function getLanguage(code: string) {
  return LANGUAGES.find((l) => l.code === code)
}

export function isRtl(code: string): boolean {
  return getLanguage(code)?.rtl ?? false
}

/** Язык интерфейса: выбранный, если перевод готов, иначе английский. */
export function uiLanguage(code: string): 'ru' | 'en' {
  const lang = getLanguage(code)
  if (lang?.uiReady) return lang.code as 'ru' | 'en'
  return 'en'
}

/** Первое предположение по языку устройства. Не угадали — человек поменяет в настройках. */
export function detectLanguage(): LangCode {
  if (typeof navigator === 'undefined') return 'ru'
  for (const raw of navigator.languages ?? [navigator.language]) {
    const short = raw?.toLowerCase().split('-')[0]
    const hit = LANGUAGES.find((l) => l.code === short)
    if (hit) return hit.code
  }
  return 'en'
}
