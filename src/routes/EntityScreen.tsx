import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useLibrary } from '@/lib/useLibrary'
import { getEntity, getEntities, nameOf, labelsOf, type Library } from '@/lib/library'
import { formatSpan, wikidataUrl, type Entity } from '@/lib/types'
import { familyOf, hasFamily, rulersOf, neighboursOf, positionsOf, referencedIds } from '@/lib/relations'
import { fetchArticle, WIKIPEDIA_LICENCE, type Article } from '@/lib/wikipedia'
import { useProgress } from '@/store/progress'
import EntityImage from '@/components/EntityImage'
import EntityLink from '@/components/EntityLink'
import FamilyTree from '@/components/FamilyTree'
import RulerTimeline from '@/components/RulerTimeline'
import GuidePanel from '@/components/GuidePanel'

/**
 * Карточка одной вещи: страны, человека, события или династии.
 *
 * Показываем ровно то, что есть в данных, и ничего сверх того. Нет статьи —
 * не выдумываем текст. Нет дат — не пишем «примерно». Под каждой карточкой
 * стоят ссылки на источники, по которым всё это можно проверить.
 */
export default function EntityScreen() {
  const { id = '' } = useParams()
  const { t } = useTranslation()
  const libState = useLibrary()

  const [entity, setEntity] = useState<Entity | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [article, setArticle] = useState<Article | null>(null)
  const [articleTried, setArticleTried] = useState(false)
  const [, forceRedraw] = useState(0)

  const markEntitySeen = useProgress((s) => s.markEntitySeen)
  const bookmarks = useProgress((s) => s.bookmarks)
  const toggleBookmark = useProgress((s) => s.toggleBookmark)

  const lib = libState.lib

  /* Сама карточка: из ядра мгновенно, иначе из сети. */
  useEffect(() => {
    if (!lib) return
    const controller = new AbortController()
    setStatus('loading')
    setEntity(null)
    setArticle(null)
    setArticleTried(false)
    window.scrollTo({ top: 0 })

    void getEntity(lib, id, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return
        setEntity(found)
        setStatus(found ? 'ready' : 'missing')
        if (found) markEntitySeen(found.id)
      })
      .catch(() => {
        if (!controller.signal.aborted) setStatus('missing')
      })

    return () => controller.abort()
  }, [lib, id, markEntitySeen])

  /* Имена для всех, на кого карточка ссылается: без них будут голые номера. */
  useEffect(() => {
    if (!lib || !entity) return
    const controller = new AbortController()
    const missing = referencedIds(entity, lib).filter((rel) => !lib.labels.has(rel))
    if (!missing.length) return
    void getEntities(lib, missing.slice(0, 60), controller.signal)
      .then(() => !controller.signal.aborted && forceRedraw((n) => n + 1))
      .catch(() => undefined)
    return () => controller.abort()
  }, [lib, entity])

  /* Текст статьи из Википедии. */
  useEffect(() => {
    if (!lib || !entity) return
    const title = labelsOf(lib, entity.id)?.wiki
    if (!title) {
      setArticleTried(true)
      return
    }
    const controller = new AbortController()
    void fetchArticle(lib.lang, title, controller.signal)
      .then((found) => {
        if (controller.signal.aborted) return
        setArticle(found)
        setArticleTried(true)
      })
      .catch(() => setArticleTried(true))
    return () => controller.abort()
  }, [lib, entity])

  if (libState.status === 'loading') return <Loading />
  if (libState.status === 'error' || !lib) return <Failed message={libState.error} />

  if (status === 'loading') return <Loading />
  if (status === 'missing' || !entity) {
    return (
      <div className="container">
        <BackLink />
        <div className="stub">
          <p>{t('entity.notFound', { id })}</p>
          <a href={wikidataUrl(id)} target="_blank" rel="noreferrer noopener">
            {t('entity.openWikidata')}
          </a>
        </div>
      </div>
    )
  }

  const labels = labelsOf(lib, entity.id)
  const name = nameOf(lib, entity.id)
  const span = formatSpan(entity, lib.lang)
  const bookmarked = bookmarks.includes(entity.id)

  return (
    <div className="container">
      <BackLink />

      <article className="entity">
        <header className="entity__head">
          <p className="entity__kind">{t(`entity.kind.${entity.type}`)}</p>
          <h1>{name}</h1>
          {span && <p className="entity__span">{span}</p>}
          {labels?.descr && <p className="entity__descr">{labels.descr}</p>}

          <button
            type="button"
            className={`btn btn--sm${bookmarked ? ' btn--gold' : ''}`}
            onClick={() => toggleBookmark(entity.id)}
            aria-pressed={bookmarked}
          >
            {bookmarked ? t('entity.bookmarked') : t('entity.bookmark')}
          </button>
        </header>

        {entity.image && <EntityImage file={entity.image} alt={name} />}

        {article && (
          <section className="entity__section">
            <p className="entity__extract">{article.extract}</p>
            <p className="note">
              <a href={article.url} target="_blank" rel="noreferrer noopener">
                {t('entity.readMore')}
              </a>{' '}
              · {t('entity.textLicence', { licence: WIKIPEDIA_LICENCE })}
            </p>
          </section>
        )}
        {!article && articleTried && (
          <p className="note">{t('entity.noArticle')}</p>
        )}

        {entity.type === 'state' && <StateBody lib={lib} entity={entity} />}
        {entity.type === 'person' && <PersonBody lib={lib} entity={entity} />}
        {(entity.type === 'event' || entity.type === 'dynasty') && (
          <OtherBody lib={lib} entity={entity} />
        )}

        <GuidePanel
          subject={name}
          qid={entity.id}
          material={[span, labels?.descr, article?.extract].filter(Boolean).join('. ')}
        />

        <Sources lib={lib} entity={entity} />
      </article>
    </div>
  )
}

/* ------------------------------ Государство ------------------------------ */

function StateBody({ lib, entity }: { lib: Library; entity: Entity }) {
  const { t } = useTranslation()
  const reigns = useMemo(() => rulersOf(lib, entity.id), [lib, entity.id])
  const { before, after } = neighboursOf(entity)

  return (
    <>
      {reigns.length > 0 && (
        <Section title={t('entity.rulers.title', { count: reigns.length })}>
          <RulerTimeline lib={lib} reigns={reigns} />
        </Section>
      )}

      {before.length > 0 && (
        <Section title={t('entity.before')}>
          <LinkRow lib={lib} ids={before} />
        </Section>
      )}
      {after.length > 0 && (
        <Section title={t('entity.after')}>
          <LinkRow lib={lib} ids={after} />
        </Section>
      )}
    </>
  )
}

/* ------------------------------ Человек ------------------------------ */

function PersonBody({ lib, entity }: { lib: Library; entity: Entity }) {
  const { t } = useTranslation()
  const family = useMemo(() => familyOf(entity), [entity])
  const positions = useMemo(() => positionsOf(entity), [entity])

  return (
    <>
      {positions.length > 0 && (
        <Section title={t('entity.positions')}>
          <ul className="plain-list">
            {positions.slice(0, 20).map((rel, index) => {
              const stateId = lib.positions.get(rel.id)
              const years = formatSpan({ start: rel.from, end: rel.to }, lib.lang)
              return (
                <li key={`${rel.id}-${index}`}>
                  <EntityLink lib={lib} id={rel.id} note={years || undefined} />
                  {stateId && (
                    <span className="plain-list__where">
                      {' '}
                      · <EntityLink lib={lib} id={stateId} />
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </Section>
      )}

      {family.dynasty && (
        <Section title={t('entity.dynasty')}>
          <LinkRow lib={lib} ids={[family.dynasty]} />
        </Section>
      )}

      {hasFamily(family) && (
        <Section title={t('entity.family.title')}>
          <FamilyTree lib={lib} family={family} selfId={entity.id} />
        </Section>
      )}
    </>
  )
}

/* --------------------------- Событие и династия --------------------------- */

function OtherBody({ lib, entity }: { lib: Library; entity: Entity }) {
  const { t } = useTranslation()
  const participants = entity.relations.filter((r) => r.prop === 'P710').map((r) => r.id)
  const partOf = entity.relations.filter((r) => r.prop === 'P361').map((r) => r.id)
  const country = entity.relations.find((r) => r.prop === 'P17')?.id

  const members = useMemo(() => {
    if (entity.type !== 'dynasty') return []
    const out: string[] = []
    for (const [id, other] of lib.entities) {
      if (other.type !== 'person') continue
      if (other.relations.some((r) => r.prop === 'P53' && r.id === entity.id)) out.push(id)
    }
    return out.sort((a, b) => (lib.entities.get(a)?.start?.year ?? 0) - (lib.entities.get(b)?.start?.year ?? 0))
  }, [lib, entity])

  return (
    <>
      {country && (
        <Section title={t('entity.country')}>
          <LinkRow lib={lib} ids={[country]} />
        </Section>
      )}
      {partOf.length > 0 && (
        <Section title={t('entity.partOf')}>
          <LinkRow lib={lib} ids={partOf} />
        </Section>
      )}
      {participants.length > 0 && (
        <Section title={t('entity.participants')}>
          <LinkRow lib={lib} ids={participants.slice(0, 40)} />
        </Section>
      )}
      {members.length > 0 && (
        <Section title={t('entity.members', { count: members.length })}>
          <LinkRow lib={lib} ids={members} withYears />
        </Section>
      )}
    </>
  )
}

/* ------------------------------ Кирпичики ------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="entity__section">
      <h2 className="entity__section-title">{title}</h2>
      {children}
    </section>
  )
}

function LinkRow({ lib, ids, withYears }: { lib: Library; ids: string[]; withYears?: boolean }) {
  return (
    <div className="link-row">
      {ids.map((id) => (
        <EntityLink key={id} lib={lib} id={id} showYears={withYears} />
      ))}
    </div>
  )
}

function Sources({ lib, entity }: { lib: Library; entity: Entity }) {
  const { t } = useTranslation()
  const wiki = labelsOf(lib, entity.id)?.wiki

  return (
    <footer className="entity__sources">
      <h2 className="entity__section-title">{t('entity.sources')}</h2>
      <p className="note">{t('entity.sourcesNote')}</p>
      <div className="link-row">
        <a className="chip" href={wikidataUrl(entity.id)} target="_blank" rel="noreferrer noopener">
          Wikidata {entity.id}
        </a>
        {wiki && (
          <a
            className="chip"
            href={`https://${lib.lang}.wikipedia.org/wiki/${encodeURIComponent(wiki.replace(/ /g, '_'))}`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Wikipedia
          </a>
        )}
        <Link className="chip" to="/sources">
          {t('settings.about.sources')}
        </Link>
      </div>
    </footer>
  )
}

function BackLink() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  return (
    <button type="button" className="back-link" onClick={() => navigate(-1)}>
      ← {t('common.back')}
    </button>
  )
}

function Loading() {
  const { t } = useTranslation()
  return (
    <div className="container">
      <p className="note" role="status">
        {t('common.loading')}
      </p>
    </div>
  )
}

function Failed({ message }: { message: string }) {
  return (
    <div className="container">
      <p className="note" role="alert">
        {message}
      </p>
    </div>
  )
}
