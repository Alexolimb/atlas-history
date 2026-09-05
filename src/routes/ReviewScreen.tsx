import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHead from '@/components/PageHead'
import { useLibrary } from '@/lib/useLibrary'
import { nameOf, labelsOf, type Library } from '@/lib/library'
import { formatHistDate, type HistDate } from '@/lib/types'
import { useProgress, isoDay } from '@/store/progress'
import { dueCards, parseKey, type Answer, type Card } from '@/lib/srs'

const XP_PER_REVIEW = 5

/**
 * Повторение забытого.
 *
 * Карточка показывает вопрос, человек пытается вспомнить сам, потом
 * открывает ответ и честно говорит, вспомнил или нет. Оценивает себя он —
 * приложение не устраивает экзамен, оно помогает не забыть.
 *
 * Ответ всегда берётся из справочника, то есть из Wikidata. Ничего
 * придуманного здесь появиться не может.
 */
export default function ReviewScreen() {
  const { t } = useTranslation()
  const libState = useLibrary()
  const cards = useProgress((s) => s.cards)
  const entitiesSeen = useProgress((s) => s.entitiesSeen)
  const chaptersDone = useProgress((s) => s.chaptersDone)
  const addCards = useProgress((s) => s.addCards)
  const answerCard = useProgress((s) => s.answerCard)
  const addXp = useProgress((s) => s.addXp)

  const today = isoDay()
  const [revealed, setRevealed] = useState(false)
  const [doneToday, setDoneToday] = useState(0)

  const lib = libState.lib

  /**
   * Заводим карточки на то, что человек уже видел. Даты берём только
   * настоящие: у кого нет даты в справочнике, того и спрашивать не о чем.
   */
  useEffect(() => {
    if (!lib) return
    const keys: string[] = []
    for (const id of entitiesSeen) {
      const entity = lib.entities.get(id)
      if (!entity) continue
      if (entity.start) keys.push(`${id}|${entity.type === 'person' ? 'birth' : 'start'}`)
      if (entity.end) keys.push(`${id}|${entity.type === 'person' ? 'death' : 'end'}`)
    }
    if (keys.length) addCards(keys, today)
  }, [lib, entitiesSeen, addCards, today])

  const queue = useMemo(() => dueCards(cards, today), [cards, today])
  const card = queue[0]

  if (libState.status === 'loading') {
    return (
      <div className="container">
        <PageHead ns="review" />
        <p className="note" role="status">
          {t('common.loading')}
        </p>
      </div>
    )
  }

  if (!lib) {
    return (
      <div className="container">
        <PageHead ns="review" />
        <p className="note" role="alert">
          {libState.error}
        </p>
      </div>
    )
  }

  if (!cards.length) {
    return (
      <div className="container">
        <PageHead ns="review" />
        <div className="stub">
          <p>{t('review.empty')}</p>
          <Link className="btn btn--gold" to="/reference">
            {t('nav.reference')}
          </Link>
        </div>
      </div>
    )
  }

  if (!card) {
    return (
      <div className="container">
        <PageHead ns="review" />
        <div className="card review-done">
          <p className="review-done__title">{t('review.allDone')}</p>
          <p className="note">
            {t('review.stats', {
              total: cards.length,
              chapters: chaptersDone.length,
              reviewed: doneToday,
            })}
          </p>
          <p className="note">{t('review.comeBack')}</p>
        </div>
      </div>
    )
  }

  const question = buildCard(lib, card)
  if (!question) {
    // Карточка на сущность, которой больше нет в справочнике — отправляем далеко.
    answerCard(card.key, 'easy', today)
    return null
  }

  const answer = (grade: Answer) => {
    answerCard(card.key, grade, today)
    if (grade !== 'forgot') addXp(XP_PER_REVIEW)
    setDoneToday((n) => n + 1)
    setRevealed(false)
  }

  return (
    <div className="container">
      <PageHead ns="review" />

      <p className="note">{t('review.left', { count: queue.length })}</p>

      <div className="card review">
        <p className="review__prompt">{t(question.prompt)}</p>
        <p className="review__subject">{question.subject}</p>

        {revealed ? (
          <>
            <p className="review__answer">{question.answer}</p>
            <div className="review__grades">
              <button type="button" className="btn btn--danger" onClick={() => answer('forgot')}>
                {t('review.forgot')}
              </button>
              <button type="button" className="btn" onClick={() => answer('hard')}>
                {t('review.hard')}
              </button>
              <button type="button" className="btn btn--gold" onClick={() => answer('easy')}>
                {t('review.easy')}
              </button>
            </div>
            <p className="note">
              <Link to={`/e/${question.id}`}>{t('review.openCard')}</Link>
            </p>
          </>
        ) : (
          <button type="button" className="btn btn--gold" onClick={() => setRevealed(true)}>
            {t('review.reveal')}
          </button>
        )}
      </div>
    </div>
  )
}

interface BuiltCard {
  id: string
  /** Ключ перевода вопроса — переводится на экране, а не тут. */
  prompt: string
  subject: string
  answer: string
}

function buildCard(lib: Library, card: Card): BuiltCard | null {
  const parsed = parseKey(card.key)
  if (!parsed) return null
  const entity = lib.entities.get(parsed.q)
  if (!entity) return null

  const date: HistDate | undefined =
    parsed.prop === 'death' || parsed.prop === 'end' ? entity.end : entity.start
  if (!date) return null

  const name = nameOf(lib, parsed.q)
  const descr = labelsOf(lib, parsed.q)?.descr

  const promptKey =
    parsed.prop === 'birth'
      ? 'review.q.birth'
      : parsed.prop === 'death'
        ? 'review.q.death'
        : parsed.prop === 'start'
          ? 'review.q.start'
          : 'review.q.end'

  return {
    id: parsed.q,
    prompt: promptKey,
    subject: descr ? `${name} — ${descr}` : name,
    answer: formatHistDate(date, lib.lang),
  }
}
