import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHead from '@/components/PageHead'

interface SourceRow {
  name: string
  url: string
  what: string
  licence: string
}

/**
 * Обязательный экран. Wikipedia требует указывать CC BY-SA,
 * Commons — автора снимка, historical-basemaps — автора и GPL-3.
 * Здесь же честно сказано про приблизительность древних границ.
 */
const SOURCES: SourceRow[] = [
  {
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    what: 'Даты, родство, правители, династии, координаты — вся структура справочника',
    licence: 'CC0 1.0 (общественное достояние)',
  },
  {
    name: 'Wikipedia',
    url: 'https://www.wikipedia.org',
    what: 'Описания стран, людей и событий на 30 языках',
    licence: 'CC BY-SA 4.0',
  },
  {
    name: 'Wikimedia Commons',
    url: 'https://commons.wikimedia.org',
    what: 'Портреты, карты, фотографии',
    licence: 'у каждого файла своя — подписана на карточке',
  },
  {
    name: 'historical-basemaps (A. Ourednik)',
    url: 'https://github.com/aourednik/historical-basemaps',
    what: 'Границы государств мира по 54 срезам времени от −123000 до 2010',
    licence: 'GPL-3.0',
  },
  {
    name: 'Pixabay',
    url: 'https://pixabay.com/music/',
    what: 'Фоновая музыка и звуки',
    licence: 'Pixabay Content License',
  },
]

export default function SourcesScreen() {
  const { t } = useTranslation()

  return (
    <div className="container">
      <PageHead ns="sources" />

      <hr className="rule" />

      <h2>{t('sources.dataTitle')}</h2>
      <div className="source-list">
        {SOURCES.map((s) => (
          <article key={s.name} className="card source">
            <h3>
              <a href={s.url} target="_blank" rel="noreferrer noopener">
                {s.name}
              </a>
            </h3>
            <p className="source__what">{s.what}</p>
            <p className="source__licence">{s.licence}</p>
          </article>
        ))}
      </div>

      <p className="note">{t('sources.bordersNote')}</p>

      <hr className="rule" />
      <p>
        <Link to="/settings">← {t('nav.settings')}</Link>
      </p>
    </div>
  )
}
