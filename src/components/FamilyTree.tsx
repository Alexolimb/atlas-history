import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import type { Library } from '@/lib/library'
import { nameOf } from '@/lib/library'
import { formatSpan } from '@/lib/types'
import type { Family } from '@/lib/relations'

/**
 * Семейное древо в три ряда: родители → человек и супруги → дети.
 *
 * Больше трёх поколений разом рисовать бессмысленно — на телефоне это
 * превращается в кашу. Вместо этого любой человек в древе кликабелен:
 * нажал на отца — древо перестроилось вокруг него. Так по семье можно
 * идти вглубь сколько угодно, и каждый шаг остаётся читаемым.
 */
export default function FamilyTree({
  lib,
  family,
  selfId,
}: {
  lib: Library
  family: Family
  selfId: string
}) {
  const { t } = useTranslation()

  return (
    <div className="tree">
      {family.parents.length > 0 && (
        <>
          <div className="tree__row tree__row--parents">
            {family.parents.map((id) => (
              <Person key={id} lib={lib} id={id} role={t('entity.family.parent')} />
            ))}
          </div>
          <div className="tree__link tree__link--down" aria-hidden="true" />
        </>
      )}

      <div className="tree__row tree__row--self">
        <Person lib={lib} id={selfId} self />
        {family.spouses.map((id) => (
          <Person key={id} lib={lib} id={id} role={t('entity.family.spouse')} />
        ))}
      </div>

      {family.children.length > 0 && (
        <>
          <div className="tree__link tree__link--down" aria-hidden="true" />
          <div className="tree__row tree__row--children">
            {family.children.map((id) => (
              <Person key={id} lib={lib} id={id} role={t('entity.family.child')} />
            ))}
          </div>
        </>
      )}

      {family.siblings.length > 0 && (
        <div className="tree__siblings">
          <span className="tree__siblings-label">{t('entity.family.siblings')}</span>
          <div className="tree__row">
            {family.siblings.map((id) => (
              <Person key={id} lib={lib} id={id} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Person({
  lib,
  id,
  role,
  self,
  compact,
}: {
  lib: Library
  id: string
  role?: string
  self?: boolean
  compact?: boolean
}) {
  const entity = lib.entities.get(id)
  const years = entity ? formatSpan(entity, lib.lang) : ''
  const name = nameOf(lib, id)

  const body = (
    <>
      <span className="tree__name">{name}</span>
      {!compact && years && <span className="tree__years">{years}</span>}
      {!compact && role && <span className="tree__role">{role}</span>}
    </>
  )

  if (self) {
    return (
      <div className={`tree__person tree__person--self${compact ? ' tree__person--compact' : ''}`}>
        {body}
      </div>
    )
  }

  return (
    <Link
      className={`tree__person${compact ? ' tree__person--compact' : ''}`}
      to={`/e/${id}`}
      title={name}
    >
      {body}
    </Link>
  )
}
