import { useTranslation } from 'react-i18next'

/** Шапка экрана: надзаголовок золотом, заголовок с засечками, подпись. */
export default function PageHead({ ns }: { ns: string }) {
  const { t } = useTranslation()
  return (
    <header className="page-head">
      <p className="page-head__kicker">{t(`${ns}.kicker`)}</p>
      <h1>{t(`${ns}.title`)}</h1>
      <p className="page-head__sub">{t(`${ns}.sub`)}</p>
    </header>
  )
}
