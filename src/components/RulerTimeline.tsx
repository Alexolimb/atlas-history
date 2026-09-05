import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { Library } from '@/lib/library'
import { nameOf } from '@/lib/library'
import { formatHistDate } from '@/lib/types'
import type { Reign } from '@/lib/relations'

/**
 * Лента правителей государства по порядку. Именно то, ради чего Алекс просил
 * «открыть страну и увидеть всех её правителей: кто за кем, где, когда».
 *
 * Годы слева, имя и должность справа. Кто без дат — уходит в конец списка,
 * потому что вставить его в ленту честно некуда.
 */
export default function RulerTimeline({ lib, reigns }: { lib: Library; reigns: Reign[] }) {
  const { t } = useTranslation()
  const dated = reigns.filter((r) => r.from ?? r.to)
  const undated = reigns.filter((r) => !r.from && !r.to)

  return (
    <div className="timeline">
      {dated.map((reign) => (
        <Row key={key(reign)} lib={lib} reign={reign} />
      ))}

      {undated.length > 0 && (
        <div className="timeline__undated">
          <span className="timeline__undated-label">{t('entity.rulers.undated')}</span>
          <div className="timeline__undated-list">
            {undated.map((reign) => (
              <Link key={key(reign)} className="chip" to={`/e/${reign.personId}`}>
                {nameOf(lib, reign.personId)}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ lib, reign }: { lib: Library; reign: Reign }) {
  const from = formatHistDate(reign.from, lib.lang)
  const to = formatHistDate(reign.to, lib.lang)
  const position = reign.positionId ? nameOf(lib, reign.positionId) : ''
  const showPosition = position && !position.startsWith('Q')

  return (
    <Link className="timeline__row" to={`/e/${reign.personId}`}>
      <span className="timeline__years">
        {from || '?'}
        {to && to !== from ? ` — ${to}` : ''}
      </span>
      <span className="timeline__body">
        <span className="timeline__name">{nameOf(lib, reign.personId)}</span>
        {showPosition && <span className="timeline__role">{position}</span>}
      </span>
    </Link>
  )
}

const key = (reign: Reign) =>
  `${reign.personId}|${reign.positionId ?? ''}|${reign.from?.year ?? ''}|${reign.to?.year ?? ''}`
