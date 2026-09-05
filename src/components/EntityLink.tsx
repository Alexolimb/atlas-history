import { Link } from 'react-router-dom'
import { nameOf, isOffline, type Library } from '@/lib/library'
import { formatSpan } from '@/lib/types'

/**
 * Ссылка на другую карточку. Из таких ссылок и получается «ходить по истории»:
 * от страны к правителю, от правителя к отцу, от отца к его стране.
 *
 * Если карточки нет в офлайн-ядре, она всё равно кликабельна — просто
 * откроется из сети. Ничего не заперто, как и договаривались.
 */
export default function EntityLink({
  lib,
  id,
  note,
  showYears = false,
}: {
  lib: Library
  id: string
  note?: string
  showYears?: boolean
}) {
  const entity = lib.entities.get(id)
  const years = showYears && entity ? formatSpan(entity, lib.lang) : ''
  const name = nameOf(lib, id)
  const unknownName = name === id

  return (
    <Link className="entity-link" to={`/e/${id}`}>
      <span className="entity-link__name">
        {unknownName ? id : name}
        {!isOffline(lib, id) && <span className="entity-link__net" title="загрузится из сети">↓</span>}
      </span>
      {(years || note) && (
        <span className="entity-link__note">{[note, years].filter(Boolean).join(' · ')}</span>
      )}
    </Link>
  )
}
