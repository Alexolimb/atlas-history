import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHead from '@/components/PageHead'
import { useLibrary } from '@/lib/useLibrary'
import { nameOf, labelsOf } from '@/lib/library'
import { formatSpan } from '@/lib/types'
import { useProgress, levelFromXp, xpIntoLevel, streakLength, isoDay } from '@/store/progress'
import { achievementsOf, earnedCount, pickOfTheDay } from '@/lib/achievements'
import { countDue } from '@/lib/srs'

/**
 * Профиль: сколько пройдено, что заработано и «тайна дня».
 *
 * Цифры считаются из настоящего прогресса, а не хранятся отдельно —
 * тогда они не могут разойтись с тем, что человек на самом деле делал.
 */
export default function ProfileScreen() {
  const { t } = useTranslation()
  const libState = useLibrary()
  const progress = useProgress()

  const today = isoDay()
  const level = levelFromXp(progress.xp)
  const { into, need } = xpIntoLevel(progress.xp)
  const streak = streakLength(progress.daysActive, today)
  const due = countDue(progress.cards, today)

  const achievements = useMemo(
    () =>
      achievementsOf(
        {
          xp: progress.xp,
          chaptersDone: progress.chaptersDone,
          entitiesSeen: progress.entitiesSeen,
          bookmarks: progress.bookmarks,
          daysActive: progress.daysActive,
          cards: progress.cards,
          createdAt: progress.createdAt,
        },
        today,
      ),
    [progress, today],
  )

  /** Тайна дня выбирается из самых известных карточек ядра. */
  const mystery = useMemo(() => {
    const lib = libState.lib
    if (!lib) return null
    const famous = [...lib.entities.values()]
      .filter((e) => e.type === 'person' && e.fame > 120 && (e.start ?? e.end))
      .sort((a, b) => b.fame - a.fame)
      .slice(0, 120)
      .map((e) => e.id)
    const id = pickOfTheDay(famous, today)
    if (!id) return null
    const entity = lib.entities.get(id)
    return {
      id,
      name: nameOf(lib, id),
      descr: labelsOf(lib, id)?.descr,
      span: entity ? formatSpan(entity, lib.lang) : '',
    }
  }, [libState.lib, today])

  return (
    <div className="container">
      <PageHead ns="profile" />

      <div className="stat-row">
        <Stat
          label={t('profile.stats.level')}
          value={level}
          caption={t('profile.stats.levelCaption', { into, need })}
        />
        <Stat
          label={t('profile.stats.streak')}
          value={streak}
          caption={t('profile.stats.streakCaption')}
        />
        <Stat
          label={t('profile.stats.chapters')}
          value={progress.chaptersDone.length}
          caption={t('profile.stats.chaptersCaption')}
        />
        <Stat
          label={t('profile.stats.cards')}
          value={progress.entitiesSeen.length}
          caption={t('profile.stats.cardsCaption')}
        />
      </div>

      <div className="xp-bar" aria-label={t('profile.stats.levelCaption', { into, need })}>
        <div className="xp-bar__fill" style={{ width: `${Math.round((into / need) * 100)}%` }} />
      </div>

      {due > 0 && (
        <p className="note">
          <Link to="/review">{t('review.left', { count: due })}</Link>
        </p>
      )}

      {mystery && (
        <section className="card daily">
          <h2 className="daily__title">{t('daily.title')}</h2>
          <p className="daily__name">{mystery.name}</p>
          {mystery.span && <p className="daily__span">{mystery.span}</p>}
          {mystery.descr && <p className="note">{mystery.descr}</p>}
          <Link className="btn btn--gold btn--sm" to={`/e/${mystery.id}`}>
            {t('daily.open')}
          </Link>
          <p className="note">{t('daily.hint')}</p>
        </section>
      )}

      <hr className="rule" />

      <h2 className="entity__section-title">{t('achievements.title')}</h2>
      <p className="note">
        {t('achievements.earned', { done: earnedCount(achievements), total: achievements.length })}
      </p>

      <ul className="badges">
        {achievements.map((a) => (
          <li key={a.id} className={`badge${a.done ? ' badge--done' : ''}`}>
            <span className="badge__icon" aria-hidden="true">
              {a.icon}
            </span>
            <span className="badge__body">
              <span className="badge__name">{t(`achievements.${a.id}.name`)}</span>
              <span className="badge__hint">{t(`achievements.${a.id}.hint`)}</span>
              {!a.done && (
                <span className="badge__progress">
                  {a.have} / {a.goal}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ label, value, caption }: { label: string; value: number; caption: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <strong className="stat__value">{value}</strong>
      <span className="stat__caption">{caption}</span>
    </div>
  )
}
