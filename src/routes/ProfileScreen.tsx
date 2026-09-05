import { useTranslation } from 'react-i18next'
import PageHead from '@/components/PageHead'
import Stub from '@/components/Stub'
import { useProgress, levelFromXp, xpIntoLevel, streakLength } from '@/store/progress'

export default function ProfileScreen() {
  const { t } = useTranslation()
  const xp = useProgress((s) => s.xp)
  const daysActive = useProgress((s) => s.daysActive)
  const chaptersDone = useProgress((s) => s.chaptersDone)
  const entitiesSeen = useProgress((s) => s.entitiesSeen)

  const level = levelFromXp(xp)
  const { into, need } = xpIntoLevel(xp)
  const streak = streakLength(daysActive)

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
          caption={t('profile.stats.streakCaption', { count: streak })}
        />
        <Stat
          label={t('profile.stats.chapters')}
          value={chaptersDone.length}
          caption={t('profile.stats.chaptersCaption')}
        />
        <Stat
          label={t('profile.stats.cards')}
          value={entitiesSeen.length}
          caption={t('profile.stats.cardsCaption')}
        />
      </div>

      <div className="xp-bar" aria-label={t('profile.stats.levelCaption', { into, need })}>
        <div className="xp-bar__fill" style={{ width: `${Math.round((into / need) * 100)}%` }} />
      </div>

      <hr className="rule" />
      <Stub part="Часть 5 — достижения и подробная статистика" />
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
