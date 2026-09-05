import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHead from '@/components/PageHead'
import { EPOCHS, epochSpan } from '@/lib/epochs'
import { loadCourse, chaptersOfEpoch, textOf, readingMinutes, type Course } from '@/lib/course'
import { useSettings } from '@/store/settings'
import { useProgress } from '@/store/progress'

/**
 * Путь: двенадцать эпох сверху вниз, в каждой — её главы.
 *
 * Порядок предложен, но ничего не заперто. Это прямое требование Алекса:
 * человек в любой момент открывает что угодно, и приложение не делает вид,
 * что имеет право ему что-то запретить. Пройденное помечается, непройденное —
 * просто не помечено, а не «закрыто».
 */
export default function PathScreen() {
  const { t } = useTranslation()
  const lang = useSettings((s) => s.language)
  const chaptersDone = useProgress((s) => s.chaptersDone)

  const [course, setCourse] = useState<Course | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadCourse()
      .then((loaded) => alive && setCourse(loaded))
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const doneCount = course
    ? course.chapters.filter((c) => chaptersDone.includes(c.id)).length
    : 0

  return (
    <div className="container">
      <PageHead ns="path" />

      {error && (
        <p className="note" role="alert">
          {error}
        </p>
      )}

      {course && (
        <p className="note">
          {t('path.progress', { done: doneCount, total: course.chapters.length })}
        </p>
      )}

      <div className="epochs">
        {EPOCHS.map((epoch) => {
          const chapters = course ? chaptersOfEpoch(course, epoch.n) : []
          const doneHere = chapters.filter((c) => chaptersDone.includes(c.id)).length

          return (
            <section key={epoch.n} className="epoch">
              <header className="epoch__head">
                <span className="epoch__num">{epoch.n}</span>
                <div className="epoch__title-box">
                  <h2 className="epoch__title">{t(`path.epochs.${epoch.n}`)}</h2>
                  <span className="epoch__years">{epochSpan(epoch, lang)}</span>
                </div>
                {chapters.length > 0 && (
                  <span className="epoch__count">
                    {doneHere} / {chapters.length}
                  </span>
                )}
              </header>

              {chapters.length === 0 ? (
                <p className="epoch__soon">{t('path.epochSoon')}</p>
              ) : (
                <ol className="chapters">
                  {chapters.map((chapter) => {
                    const text = textOf(chapter, lang)
                    const done = chaptersDone.includes(chapter.id)
                    return (
                      <li key={chapter.id}>
                        <Link className={`chapter${done ? ' chapter--done' : ''}`} to={`/c/${chapter.id}`}>
                          <span className="chapter__mark" aria-hidden="true">
                            {done ? '✓' : chapter.order}
                          </span>
                          <span className="chapter__body">
                            <span className="chapter__title">{text.title}</span>
                            <span className="chapter__sub">{text.subtitle}</span>
                            <span className="chapter__meta">
                              {t('path.minutes', { count: readingMinutes(text.body) })}
                              {!text.translated && ` · ${t('path.englishOnly')}`}
                            </span>
                          </span>
                        </Link>
                      </li>
                    )
                  })}
                </ol>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
