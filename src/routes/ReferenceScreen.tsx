import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import PageHead from '@/components/PageHead'
import { useLibrary } from '@/lib/useLibrary'
import { search, searchCore, nameOf, type Library, type SearchHit } from '@/lib/library'
import { formatSpan, type EntityType } from '@/lib/types'
import { useProgress } from '@/store/progress'

type Filter = 'all' | EntityType | 'bookmarks'

/**
 * Справочник: строка поиска и списки по видам.
 *
 * Поиск начинает с того, что лежит на устройстве, и потом дописывает
 * найденное в сети. Поэтому без интернета он не пустой, а с интернетом —
 * не ограничен восемью сотнями карточек ядра.
 */
export default function ReferenceScreen() {
  const { t } = useTranslation()
  const libState = useLibrary()
  const [params, setParams] = useSearchParams()

  const [query, setQuery] = useState(params.get('q') ?? '')
  const [filter, setFilter] = useState<Filter>('all')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searching, setSearching] = useState(false)
  const bookmarks = useProgress((s) => s.bookmarks)
  const debounce = useRef<number | undefined>(undefined)

  const lib = libState.lib

  /* Поиск: сразу по ядру, а сеть — с задержкой, чтобы не дёргать её на каждую букву. */
  useEffect(() => {
    if (!lib) return
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      setHits([])
      setSearching(false)
      return
    }

    setHits(searchCore(lib, trimmed))
    setSearching(true)
    const controller = new AbortController()
    window.clearTimeout(debounce.current)
    debounce.current = window.setTimeout(() => {
      void search(lib, trimmed, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setHits(found)
        })
        .catch(() => undefined)
        .finally(() => {
          if (!controller.signal.aborted) setSearching(false)
        })
    }, 350)

    return () => {
      controller.abort()
      window.clearTimeout(debounce.current)
    }
  }, [lib, query])

  /* Запрос живёт в адресе — ссылку на поиск можно сохранить и вернуться к ней. */
  useEffect(() => {
    const trimmed = query.trim()
    const current = params.get('q') ?? ''
    if (trimmed === current) return
    const next = new URLSearchParams(params)
    if (trimmed) next.set('q', trimmed)
    else next.delete('q')
    setParams(next, { replace: true })
  }, [query, params, setParams])

  const browse = useMemo(() => {
    if (!lib) return []
    if (filter === 'bookmarks') {
      return bookmarks
        .map((id) => ({ id, name: nameOf(lib, id), offline: lib.entities.has(id) }) as SearchHit)
        .filter((hit) => hit.name !== hit.id || lib.entities.has(hit.id))
    }
    const list: SearchHit[] = []
    for (const [id, entity] of lib.entities) {
      if (filter !== 'all' && entity.type !== filter) continue
      const name = nameOf(lib, id)
      if (name === id) continue
      list.push({ id, name, descr: lib.labels.get(id)?.descr, type: entity.type, offline: true })
    }
    return list
      .sort((a, b) => (lib.entities.get(b.id)?.fame ?? 0) - (lib.entities.get(a.id)?.fame ?? 0))
      .slice(0, 120)
  }, [lib, filter, bookmarks])

  if (libState.status === 'loading') {
    return (
      <div className="container">
        <PageHead ns="reference" />
        <p className="note" role="status">
          {t('common.loading')}
        </p>
      </div>
    )
  }

  if (libState.status === 'error' || !lib) {
    return (
      <div className="container">
        <PageHead ns="reference" />
        <p className="note" role="alert">
          {libState.error}
        </p>
      </div>
    )
  }

  const showing = query.trim().length >= 2 ? hits : browse

  return (
    <div className="container">
      <PageHead ns="reference" />

      <div className="search">
        <input
          className="input search__input"
          type="search"
          value={query}
          placeholder={t('reference.searchPlaceholder')}
          aria-label={t('reference.searchPlaceholder')}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {query.trim().length < 2 && (
        <div className="filters">
          {(['all', 'state', 'person', 'event', 'dynasty', 'bookmarks'] as Filter[]).map((key) => (
            <button
              key={key}
              type="button"
              className="chip chip--button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
            >
              {t(`reference.filter.${key}`)}
            </button>
          ))}
        </div>
      )}

      {searching && query.trim().length >= 2 && (
        <p className="note" role="status">
          {t('reference.searchingWeb')}
        </p>
      )}

      {showing.length === 0 ? (
        <div className="stub">
          <p>
            {query.trim().length >= 2
              ? t('reference.nothingFound')
              : filter === 'bookmarks'
                ? t('reference.noBookmarks')
                : t('common.loading')}
          </p>
        </div>
      ) : (
        <ul className="results">
          {showing.map((hit) => (
            <Result key={hit.id} lib={lib} hit={hit} />
          ))}
        </ul>
      )}

      {query.trim().length < 2 && filter !== 'bookmarks' && (
        <p className="note">{t('reference.browseNote', { count: lib.entities.size })}</p>
      )}
    </div>
  )
}

function Result({ lib, hit }: { lib: Library; hit: SearchHit }) {
  const { t } = useTranslation()
  const entity = lib.entities.get(hit.id)
  const years = entity ? formatSpan(entity, lib.lang) : ''

  return (
    <li>
      <Link className="result" to={`/e/${hit.id}`}>
        <span className="result__main">
          <span className="result__name">{hit.name}</span>
          {years && <span className="result__years">{years}</span>}
        </span>
        {hit.descr && <span className="result__descr">{hit.descr}</span>}
        <span className="result__meta">
          {hit.type && <span className="result__kind">{t(`entity.kind.${hit.type}`)}</span>}
          {!hit.offline && <span className="result__net">{t('reference.fromWeb')}</span>}
        </span>
      </Link>
    </li>
  )
}
