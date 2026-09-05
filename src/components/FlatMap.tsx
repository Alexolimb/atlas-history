import { useMemo } from 'react'
import type { BorderFeature, BorderMap } from '@/lib/borders'
import { colorForCountry } from '@/lib/borders'

/**
 * Плоская карта — запасной вид для слабых устройств и для тех, кто выключил
 * объёмный глобус. Рисуется обычным SVG без единой библиотеки: проекция
 * тут школьная (долгота по горизонтали, широта по вертикали), и тащить ради
 * неё лишние сотни килобайт незачем.
 */
export default function FlatMap({
  map,
  selected,
  onSelect,
}: {
  map: BorderMap | null
  selected: string | null
  onSelect: (feature: BorderFeature | null) => void
}) {
  const shapes = useMemo(() => {
    if (!map) return []
    return map.features
      .map((feature) => ({ feature, d: pathFor(feature) }))
      .filter((shape) => shape.d.length > 0)
  }, [map])

  return (
    <svg
      className="flatmap"
      viewBox="0 0 360 180"
      role="img"
      aria-label="Карта мира"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null)
      }}
    >
      <rect x="0" y="0" width="360" height="180" className="flatmap__ocean" />
      {shapes.map(({ feature, d }, index) => {
        const name = feature.properties.name
        const isSelected = selected === name
        return (
          <path
            key={`${name}-${index}`}
            d={d}
            fill={colorForCountry(name, !isSelected && selected !== null)}
            className={`flatmap__land${isSelected ? ' flatmap__land--selected' : ''}`}
            onClick={() => onSelect(feature)}
          >
            <title>{name}</title>
          </path>
        )
      })}
    </svg>
  )
}

/** GeoJSON → атрибут d, с переносом координат в систему картинки. */
function pathFor(feature: BorderFeature): string {
  const { geometry } = feature
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : []

  const parts: string[] = []
  for (const rings of polygons) {
    for (const ring of rings) {
      if (ring.length < 3) continue
      const points = ring.map(([lon, lat]) => `${(lon + 180).toFixed(2)},${(90 - lat).toFixed(2)}`)
      parts.push(`M${points.join('L')}Z`)
    }
  }
  return parts.join('')
}
