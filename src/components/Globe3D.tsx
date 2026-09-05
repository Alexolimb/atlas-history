import { useEffect, useRef, useState } from 'react'
import Globe, { type GlobeMethods } from 'react-globe.gl'
import type { BorderFeature, BorderMap } from '@/lib/borders'
import { colorForCountry } from '@/lib/borders'

/**
 * Объёмный глобус. Грузится отдельным куском кода: внутри three.js,
 * и тащить его в первую загрузку ради тех, кто до глобуса не дойдёт,
 * незачем.
 *
 * Вращение можно погасить настройкой «меньше движения» — тогда шар просто
 * стоит и ждёт, пока его повернут пальцем.
 */
export default function Globe3D({
  map,
  selected,
  onSelect,
  spin,
}: {
  map: BorderMap | null
  selected: string | null
  onSelect: (feature: BorderFeature | null) => void
  spin: boolean
}) {
  const globeRef = useRef<GlobeMethods | undefined>(undefined)
  const boxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 320, height: 320 })
  const [hovered, setHovered] = useState<string | null>(null)

  /* Глобус не умеет сам подстраиваться под размер — меряем контейнер. */
  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const measure = () => {
      const rect = box.getBoundingClientRect()
      // Округляем вниз: дробная ширина canvas заставляет браузер пересчитывать
      // размер снова и снова, и наблюдатель уходит в бесконечный круг.
      const width = Math.max(240, Math.floor(rect.width))
      const height = Math.max(240, Math.floor(rect.height))
      setSize((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(box)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const controls = globeRef.current?.controls()
    if (!controls) return
    controls.autoRotate = spin
    controls.autoRotateSpeed = 0.35
    controls.enableZoom = true
  }, [spin, size])

  return (
    <div className="globe" ref={boxRef}>
      <Globe
        ref={globeRef}
        width={size.width}
        height={size.height}
        backgroundColor="rgba(0,0,0,0)"
        showGlobe
        showAtmosphere
        atmosphereColor="#d4af37"
        atmosphereAltitude={0.16}
        globeImageUrl={undefined}
        polygonsData={map?.features ?? []}
        polygonCapColor={(feature) => {
          const name = (feature as BorderFeature).properties.name
          if (name === selected) return 'rgba(212,175,55,0.92)'
          if (name === hovered) return 'rgba(232,205,119,0.85)'
          return colorForCountry(name, selected !== null)
        }}
        polygonSideColor={() => 'rgba(11,17,32,0.5)'}
        polygonStrokeColor={() => 'rgba(242,234,216,0.35)'}
        polygonAltitude={(feature) =>
          (feature as BorderFeature).properties.name === selected ? 0.035 : 0.008
        }
        polygonLabel={(feature) => (feature as BorderFeature).properties.name}
        onPolygonHover={(feature) =>
          setHovered(feature ? (feature as BorderFeature).properties.name : null)
        }
        onPolygonClick={(feature) => onSelect(feature as BorderFeature)}
        onGlobeClick={() => onSelect(null)}
      />
    </div>
  )
}
