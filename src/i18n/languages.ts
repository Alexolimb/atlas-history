/**
 * 30 языков приложения.
 *
 * `code` — он же код раздела Википедии, поэтому одно и то же значение
 * задаёт и язык интерфейса, и язык, на котором приходят имена и описания
 * из справочника. Второй список кодов заводить нельзя: разъедутся.
 *
 * `uiReady` — есть ли перевод кнопок и меню. Сейчас он есть у всех тридцати:
 * русский и английский лежат в коде, остальные 28 приезжают файлом
 * из `public/locales/` при выборе языка.
 */
export type LangCode = (typeof LANGUAGES)[number]['code']

export const LANGUAGES = [
  { code: 'ru', name: 'Русский', english: 'Russian', rtl: false, uiReady: true },
  { code: 'en', name: 'English', english: 'English', rtl: false, uiReady: true },
  { code: 'es', name: 'Español', english: 'Spanish', rtl: false, uiReady: true },
  { code: 'zh', name: '中文', english: 'Chinese', rtl: false, uiReady: true },
  { code: 'hi', name: 'हिन्दी', english: 'Hindi', rtl: false, uiReady: true },
  { code: 'ar', name: 'العربية', english: 'Arabic', rtl: true, uiReady: true },
  { code: 'pt', name: 'Português', english: 'Portuguese', rtl: false, uiReady: true },
  { code: 'fr', name: 'Français', english: 'French', rtl: false, uiReady: true },
  { code: 'de', name: 'Deutsch', english: 'German', rtl: false, uiReady: true },
  { code: 'ja', name: '日本語', english: 'Japanese', rtl: false, uiReady: true },
  { code: 'ko', name: '한국어', english: 'Korean', rtl: false, uiReady: true },
  { code: 'it', name: 'Italiano', english: 'Italian', rtl: false, uiReady: true },
  { code: 'tr', name: 'Türkçe', english: 'Turkish', rtl: false, uiReady: true },
  { code: 'pl', name: 'Polski', english: 'Polish', rtl: false, uiReady: true },
  { code: 'uk', name: 'Українська', english: 'Ukrainian', rtl: false, uiReady: true },
  { code: 'nl', name: 'Nederlands', english: 'Dutch', rtl: false, uiReady: true },
  { code: 'vi', name: 'Tiếng Việt', english: 'Vietnamese', rtl: false, uiReady: true },
  { code: 'id', name: 'Bahasa Indonesia', english: 'Indonesian', rtl: false, uiReady: true },
  { code: 'th', name: 'ไทย', english: 'Thai', rtl: false, uiReady: true },
  { code: 'fa', name: 'فارسی', english: 'Persian', rtl: true, uiReady: true },
  { code: 'sv', name: 'Svenska', english: 'Swedish', rtl: false, uiReady: true },
  { code: 'cs', name: 'Čeština', english: 'Czech', rtl: false, uiReady: true },
  { code: 'el', name: 'Ελληνικά', english: 'Greek', rtl: false, uiReady: true },
  { code: 'he', name: 'עברית', english: 'Hebrew', rtl: true, uiReady: true },
  { code: 'ro', name: 'Română', english: 'Romanian', rtl: false, uiReady: true },
  { code: 'hu', name: 'Magyar', english: 'Hungarian', rtl: false, uiReady: true },
  { code: 'da', name: 'Dansk', english: 'Danish', rtl: false, uiReady: true },
  { code: 'fi', name: 'Suomi', english: 'Finnish', rtl: false, uiReady: true },
  { code: 'no', name: 'Norsk', english: 'Norwegian', rtl: false, uiReady: true },
  { code: 'bn', name: 'বাংলা', english: 'Bengali', rtl: false, uiReady: true },
] as const

export const LANG_CODES = LANGUAGES.map((l) => l.code)

export function getLanguage(code: string) {
  return LANGUAGES.find((l) => l.code === code)
}

export function isRtl(code: string): boolean {
  return getLanguage(code)?.rtl ?? false
}

/**
 * Есть ли у языка перевод интерфейса. После части 8 он есть у всех тридцати,
 * но поле остаётся: если однажды появится тридцать первый язык, он честно
 * будет помечен как ещё непереведённый, а не притворится готовым.
 */
export function hasUi(code: string): boolean {
  return getLanguage(code)?.uiReady ?? false
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
