/**
 * ИИ-гид.
 *
 * Роль у него узкая и намеренно скромная: объяснить проще то, что человек
 * УЖЕ открыл, и подсказать, куда двинуться дальше. Не «спроси что угодно» —
 * иначе смысл приложения теряется, и справочник с проверенными фактами
 * подменяется болтовнёй, которую никто не сверял.
 *
 * Ключа модели в приложении нет: запрос уходит на воркфлоу n8n на сервере
 * Алексея, ключ живёт там. Отсюда — только адрес.
 *
 * ЗАЩИТА ОТ ЧУЖОГО МОЗГА. На NEXUS был случай: адрес указывал на воркфлоу
 * другого приложения, и «наставник по коду» бодро учил инвестициям. Поймали
 * только глазами. Поэтому воркфлоу обязан подписывать ответ полем `app`
 * со значением `atlas`, а приложение отказывается показывать неподписанный
 * ответ. Лучше сказать «гид недоступен», чем показать чужие слова.
 */

export const GUIDE_ENDPOINT = 'https://178-105-123-85.nip.io/webhook/atlas/v1/guide'
export const GUIDE_APP_TAG = 'atlas'
const TIMEOUT_MS = 25000
const MAX_ANSWER = 900

export type GuideState =
  | { status: 'idle' }
  | { status: 'asking' }
  | { status: 'answer'; text: string }
  | { status: 'error'; reason: GuideError }

export type GuideError = 'offline' | 'unavailable' | 'foreign' | 'empty'

export interface GuideContext {
  /** О чём спрашиваем: название карточки или главы. */
  subject: string
  /** Текст, который человек видит на экране. Гид отвечает ТОЛЬКО по нему. */
  material: string
  /** Q-номер, если это карточка справочника. */
  qid?: string
  lang: string
}

export type GuideIntent = 'explain' | 'next' | 'why'

/**
 * Спросить гида. Возвращает состояние, а не бросает исключение:
 * молчащий гид — не повод показывать человеку красный экран.
 */
export async function askGuide(
  intent: GuideIntent,
  context: GuideContext,
  signal?: AbortSignal,
): Promise<GuideState> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { status: 'error', reason: 'offline' }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  signal?.addEventListener('abort', () => controller.abort())

  try {
    const res = await fetch(GUIDE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        app: GUIDE_APP_TAG,
        intent,
        lang: context.lang,
        subject: context.subject,
        qid: context.qid ?? null,
        // Обрезаем: гиду нужен смысл, а не весь текст статьи целиком.
        material: context.material.slice(0, 2500),
      }),
    })

    if (!res.ok) return { status: 'error', reason: 'unavailable' }

    const data = (await res.json()) as { app?: string; answer?: string; text?: string }

    // Подпись обязательна — см. историю с чужим мозгом в шапке файла.
    if (data.app !== GUIDE_APP_TAG) return { status: 'error', reason: 'foreign' }

    const answer = (data.answer ?? data.text ?? '').trim()
    if (!answer) return { status: 'error', reason: 'empty' }

    return { status: 'answer', text: answer.slice(0, MAX_ANSWER) }
  } catch {
    return { status: 'error', reason: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
