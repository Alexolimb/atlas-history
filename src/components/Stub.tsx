import { useTranslation } from 'react-i18next'

/**
 * Честная заглушка для экранов, которые строятся в следующих частях.
 * Лучше сказать «скоро», чем показать выдуманное содержимое.
 */
export default function Stub({ part }: { part: string }) {
  const { t } = useTranslation()
  return (
    <div className="stub">
      <span className="stub__badge">{t('common.soon')}</span>
      <p>{t('common.soonHint')}</p>
      <p className="stub__part">{part}</p>
    </div>
  )
}
