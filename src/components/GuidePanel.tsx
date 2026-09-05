import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/store/settings'
import { askGuide, type GuideIntent, type GuideState } from '@/lib/guide'

/**
 * Панель гида под карточкой или главой.
 *
 * Три кнопки вместо поля ввода — это сознательно. Свободный чат превратил бы
 * приложение в «спроси у модели», и справочник с проверенными фактами стал бы
 * не нужен. Кнопки задают гиду ровно ту роль, о которой договорились:
 * объяснить проще, сказать почему это важно, подсказать, что дальше.
 */
export default function GuidePanel({
  subject,
  material,
  qid,
}: {
  subject: string
  material: string
  qid?: string
}) {
  const { t } = useTranslation()
  const lang = useSettings((s) => s.language)
  const [state, setState] = useState<GuideState>({ status: 'idle' })
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setState({ status: 'idle' })
    return () => abortRef.current?.abort()
  }, [subject, qid])

  const ask = (intent: GuideIntent) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'asking' })
    void askGuide(intent, { subject, material, qid, lang }, controller.signal).then((next) => {
      if (!controller.signal.aborted) setState(next)
    })
  }

  return (
    <section className="guide">
      <div className="guide__head">
        <span className="guide__mark" aria-hidden="true">
          ✦
        </span>
        <h2 className="guide__title">{t('guide.title')}</h2>
      </div>

      <div className="guide__buttons">
        <button type="button" className="chip chip--button" onClick={() => ask('explain')}>
          {t('guide.explain')}
        </button>
        <button type="button" className="chip chip--button" onClick={() => ask('why')}>
          {t('guide.why')}
        </button>
        <button type="button" className="chip chip--button" onClick={() => ask('next')}>
          {t('guide.next')}
        </button>
      </div>

      {state.status === 'asking' && (
        <p className="note" role="status">
          {t('guide.asking')}
        </p>
      )}

      {state.status === 'answer' && (
        <>
          <p className="guide__answer">{state.text}</p>
          <p className="note">{t('guide.disclaimer')}</p>
        </>
      )}

      {state.status === 'error' && (
        <p className="note" role="status">
          {t(`guide.errors.${state.reason}`)}
        </p>
      )}

      {state.status === 'idle' && <p className="note">{t('guide.hint')}</p>}
    </section>
  )
}
