import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

/** Честная полоска: сеть пропала — человек должен понимать, почему нет глубины. */
export default function OfflineBadge() {
  const { t } = useTranslation()
  const [offline, setOffline] = useState(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine,
  )

  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (!offline) return null

  return (
    <div className="container">
      <p className="banner banner--quiet" role="status">
        {t('common.offline')}
      </p>
    </div>
  )
}
