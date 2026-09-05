import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHead from '@/components/PageHead'
import FlatMap from '@/components/FlatMap'
import { useSettings } from '@/store/settings'
import {
  loadBordersIndex,
  loadBorderMap,
  loadBorderLinks,
  yearLabel,
  type BorderFeature,
  type BorderMap,
  type BordersIndex,
} from '@/lib/borders'

/**
 * Главный экран: мир в выбранном году.
 *
 * Ползунок ходит не по годам, а по срезам карт — тогда каждое положение
 * ползунка показывает настоящую карту, а не выдуманную середину между двумя.
 * Срезов 52, от −10000 до 2010, и подпись всегда говорит, какой год перед
 * человеком.
 */

// three.js весит много и нужен только здесь — грузим отдельным куском.
const Globe3D = lazy(() => import('@/components/Globe3D'))

export default function GlobeScreen() {
  const { t } = useTranslation()
  const globe3d = useSettings((s) => s.globe3d)
  const reducedMotion = useSettings((s) => s.reducedMotion)
  const lang = useSettings((s) => s.language)

  const [index, setIndex] = useState<BordersIndex | null>(null)
  const [step, setStep] = useState(0)
  const [map, setMap] = useState<BorderMap | null>(null)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [selected, setSelected] = useState<BorderFeature | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMap, setLoadingMap] = useState(false)

  /* Список срезов и связи «страна на карте → карточка». */
  useEffect(() => {
    let alive = true
    void loadBordersIndex()
      .then((loaded) => {
        if (!alive) return
        setIndex(loaded)
        // Начинаем не с каменного века, а с античности: там уже есть что смотреть.
        const start = loaded.years.findIndex((row) => row.year >= -1)
        setStep(start >= 0 ? start : loaded.years.length - 1)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    void loadBorderLinks().then((loaded) => alive && setLinks(loaded))
    return () => {
      alive = false
    }
  }, [])

  const year = index?.years[step]?.year ?? 0

  /* Карта выбранного года. */
  useEffect(() => {
    if (!index) return
    let alive = true
    setLoadingMap(true)
    void loadBorderMap(year)
      .then((loaded) => {
        if (!alive) return
        setMap(loaded)
        setSelected(null)
      })
      .catch(() => undefined)
      .finally(() => alive && setLoadingMap(false))
    return () => {
      alive = false
    }
  }, [index, year])

  const selectedName = selected?.properties.name ?? null
  const selectedLink = selectedName ? links[selectedName] : undefined

  const stats = useMemo(() => {
    if (!index) return null
    return { count: index.years[step]?.features ?? 0, total: index.years.length }
  }, [index, step])

  if (error) {
    return (
      <div className="container container--wide">
        <PageHead ns="globe" />
        <p className="note" role="alert">
          {error}
        </p>
      </div>
    )
  }

  return (
    <div className="container container--wide globe-screen">
      <PageHead ns="globe" />

      <div className="globe-stage">
        {globe3d ? (
          // Пока грузится код глобуса (внутри three.js, почти два мегабайта),
          // показываем плоскую карту. Пустой чёрный прямоугольник с надписью
          // «загружаю» — худшее, что можно показать на главном экране.
          <Suspense fallback={<FlatMap map={map} selected={selectedName} onSelect={setSelected} />}>
            <Globe3D map={map} selected={selectedName} onSelect={setSelected} spin={!reducedMotion} />
          </Suspense>
        ) : (
          <FlatMap map={map} selected={selectedName} onSelect={setSelected} />
        )}

        {loadingMap && (
          <p className="globe-stage__loading" role="status">
            {t('common.loading')}
          </p>
        )}
      </div>

      <div className="timebar">
        <div className="timebar__head">
          <span className="timebar__year">{yearLabel(year, lang)}</span>
          {stats && (
            <span className="timebar__count">{t('globe.countries', { count: stats.count })}</span>
          )}
        </div>

        <input
          className="timebar__slider"
          type="range"
          min={0}
          max={(index?.years.length ?? 1) - 1}
          step={1}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          aria-label={t('globe.sliderLabel')}
          aria-valuetext={yearLabel(year, lang)}
        />

        <div className="timebar__buttons">
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            aria-label={t('globe.earlier')}
          >
            ←
          </button>
          <div className="timebar__marks">
            {MARKS.map((mark) => (
              <button
                key={mark.year}
                type="button"
                className="chip chip--button"
                aria-pressed={year === nearestStepYear(index, mark.year)}
                onClick={() => setStep(stepFor(index, mark.year))}
              >
                {t(`globe.marks.${mark.key}`)}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn btn--sm"
            onClick={() => setStep((s) => Math.min((index?.years.length ?? 1) - 1, s + 1))}
            disabled={!index || step >= index.years.length - 1}
            aria-label={t('globe.later')}
          >
            →
          </button>
        </div>
      </div>

      {selected ? (
        <div className="card globe-pick">
          <h2 className="globe-pick__name">{selectedName}</h2>
          {selected.properties.subjectTo && (
            <p className="note">{t('globe.subjectTo', { of: selected.properties.subjectTo })}</p>
          )}
          {selectedLink ? (
            <Link className="btn btn--gold" to={`/e/${selectedLink}`}>
              {t('globe.openCard')}
            </Link>
          ) : (
            <p className="note">{t('globe.noCard')}</p>
          )}
        </div>
      ) : (
        <p className="note globe-hint">{t('globe.hint')}</p>
      )}

      <p className="note">
        {t('globe.bordersNote')} <Link to="/sources">{t('settings.about.sources')}</Link>
      </p>
    </div>
  )
}

/** Быстрые метки: эпохи, к которым чаще всего хочется прыгнуть. */
const MARKS = [
  { key: 'ancient', year: -500 },
  { key: 'rome', year: 100 },
  { key: 'middle', year: 1000 },
  { key: 'discovery', year: 1500 },
  { key: 'empires', year: 1800 },
  { key: 'wars', year: 1938 },
  { key: 'today', year: 2010 },
]

function stepFor(index: BordersIndex | null, year: number): number {
  if (!index) return 0
  let best = 0
  let bestDiff = Number.POSITIVE_INFINITY
  index.years.forEach((row, i) => {
    const diff = Math.abs(row.year - year)
    if (diff < bestDiff) {
      bestDiff = diff
      best = i
    }
  })
  return best
}

function nearestStepYear(index: BordersIndex | null, year: number): number | null {
  if (!index) return null
  return index.years[stepFor(index, year)]?.year ?? null
}

