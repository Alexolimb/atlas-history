import { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSettings } from '@/store/settings'
import { useProgress } from '@/store/progress'
import { useLibrary } from '@/lib/useLibrary'
import { getEntities } from '@/lib/library'
import {
  loadCourse,
  findChapter,
  nextChapter,
  prevChapter,
  textOf,
  parseBody,
  readingMinutes,
  type Chapter,
  type Course,
} from '@/lib/course'
import { epochOf, epochSpan } from '@/lib/epochs'
import EntityLink from '@/components/EntityLink'
import Quiz from '@/components/Quiz'

const XP_FOR_CHAPTER = 60
const XP_PER_RIGHT_ANSWER = 15

/**
 * Одна глава пути: рассказ, карточки справочника, момент на глобусе
 * и короткая проверка.
 *
 * Проверка не обязательна и ничего не запирает: её можно пропустить
 * и пойти дальше. Опыт даётся за прочтение, а за верные ответы добавляется.
 */
export default function ChapterScreen() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const lang = useSettings((s) => s.language)
  const libState = useLibrary()

  const [course, setCourse] = useState<Course | null>(null)
  const [showQuiz, setShowQuiz] = useState(false)
  const [result, setResult] = useState<{ correct: number; total: number } | null>(null)
  const [, redraw] = useState(0)

  const chaptersDone = useProgress((s) => s.chaptersDone)
  const markChapterDone = useProgress((s) => s.markChapterDone)
  const addXp = useProgress((s) => s.addXp)

  useEffect(() => {
    let alive = true
    void loadCourse().then((loaded) => alive && setCourse(loaded))
    return () => {
      alive = false
    }
  }, [])

  const chapter = course ? findChapter(course, id) : undefined

  useEffect(() => {
    window.scrollTo({ top: 0 })
    setShowQuiz(false)
    setResult(null)
  }, [id])

  /* Имена карточек главы: без них внизу будут голые Q-номера. */
  useEffect(() => {
    const lib = libState.lib
    if (!lib || !chapter) return
    const missing = chapter.cards.filter((q) => !lib.labels.has(q))
    if (!missing.length) return
    const controller = new AbortController()
    void getEntities(lib, missing, controller.signal)
      .then(() => !controller.signal.aborted && redraw((n) => n + 1))
      .catch(() => undefined)
    return () => controller.abort()
  }, [libState.lib, chapter])

  if (!course || libState.status === 'loading') {
    return (
      <div className="container">
        <p className="note" role="status">
          {t('common.loading')}
        </p>
      </div>
    )
  }

  if (!chapter) {
    return (
      <div className="container">
        <p className="note" role="alert">
          {t('path.chapterMissing')}
        </p>
        <Link to="/path">← {t('nav.path')}</Link>
      </div>
    )
  }

  const lib = libState.lib
  const text = textOf(chapter, lang)
  const blocks = parseBody(text.body)
  const epoch = epochOf(chapter.epoch)
  const done = chaptersDone.includes(chapter.id)
  const next = nextChapter(course, chapter.id)
  const prev = prevChapter(course, chapter.id)

  const finish = () => {
    if (!done) {
      markChapterDone(chapter.id)
      addXp(XP_FOR_CHAPTER)
    }
    if (chapter.quiz.length) setShowQuiz(true)
  }

  return (
    <div className="container">
      <button type="button" className="back-link" onClick={() => navigate(-1)}>
        ← {t('common.back')}
      </button>

      <article className="chapter-page">
        <header className="chapter-page__head">
          <p className="entity__kind">
            {t(`path.epochs.${chapter.epoch}`)}
            {epoch && ` · ${epochSpan(epoch, lang)}`}
          </p>
          <h1>{text.title}</h1>
          {text.subtitle && <p className="chapter-page__sub">{text.subtitle}</p>}
          <p className="note">
            {t('path.minutes', { count: readingMinutes(text.body) })}
            {done && ` · ${t('path.alreadyRead')}`}
            {!text.translated && ` · ${t('path.englishOnly')}`}
          </p>
        </header>

        <div className="chapter-page__body">
          {blocks.map((block, i) =>
            block.kind === 'heading' ? (
              <h2 key={i} className="chapter-page__heading">
                {block.text}
              </h2>
            ) : (
              <p key={i}>
                {block.parts.map((part, j) =>
                  part.bold ? (
                    <strong key={j}>{part.text}</strong>
                  ) : part.italic ? (
                    <em key={j}>{part.text}</em>
                  ) : (
                    <span key={j}>{part.text}</span>
                  ),
                )}
              </p>
            ),
          )}
        </div>

        {chapter.globe && (
          <p className="chapter-page__globe">
            <Link className="chip" to="/">
              {t('path.seeOnGlobe', { year: yearWords(chapter.globe.year, lang) })}
            </Link>
          </p>
        )}

        {lib && chapter.cards.length > 0 && (
          <section className="entity__section">
            <h2 className="entity__section-title">{t('path.cards')}</h2>
            <div className="link-row">
              {chapter.cards.map((q) => (
                <EntityLink key={q} lib={lib} id={q} showYears />
              ))}
            </div>
          </section>
        )}

        <section className="entity__section">
          {!showQuiz && !result && (
            <button type="button" className="btn btn--gold" onClick={finish}>
              {chapter.quiz.length
                ? t('path.checkMe')
                : done
                  ? t('path.alreadyRead')
                  : t('path.markRead')}
            </button>
          )}

          {showQuiz && lib && !result && (
            <Quiz
              questions={chapter.quiz}
              lib={lib}
              onFinish={(correct, total) => {
                addXp(correct * XP_PER_RIGHT_ANSWER)
                setResult({ correct, total })
                setShowQuiz(false)
              }}
            />
          )}

          {result && (
            <div className="quiz-result">
              <p className="quiz-result__score">
                {t('quiz.result', { correct: result.correct, total: result.total })}
              </p>
              <p className="note">
                +{XP_FOR_CHAPTER + result.correct * XP_PER_RIGHT_ANSWER} XP
              </p>
            </div>
          )}
        </section>

        <nav className="chapter-page__nav">
          {prev ? (
            <Link className="btn btn--sm" to={`/c/${prev.id}`}>
              ← {textOf(prev, lang).title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link className="btn btn--sm btn--gold" to={`/c/${next.id}`}>
              {textOf(next, lang).title} →
            </Link>
          ) : (
            <Link className="btn btn--sm" to="/path">
              {t('nav.path')}
            </Link>
          )}
        </nav>
      </article>
    </div>
  )
}

function yearWords(year: number, lang: string): string {
  if (year < 0) return lang === 'ru' ? `${-year} до н. э.` : `${-year} BC`
  return String(year)
}

export type { Chapter }
