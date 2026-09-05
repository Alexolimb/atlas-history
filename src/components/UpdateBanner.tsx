import { useRegisterSW } from 'virtual:pwa-register/react'
import { useTranslation } from 'react-i18next'

/**
 * Приложение обновляется само, но перезагружать страницу под руками
 * у читающего человека нельзя — предлагаем кнопкой.
 */
export default function UpdateBanner() {
  const { t } = useTranslation()
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })

  if (!needRefresh) return null

  return (
    <div className="container">
      <div className="banner">
        <span>{t('common.updateReady')}</span>
        <button
          type="button"
          className="btn btn--gold btn--sm"
          onClick={() => void updateServiceWorker(true)}
        >
          {t('common.updateAction')}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setNeedRefresh(false)}
          aria-label={t('common.installLater')}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
