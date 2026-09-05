/**
 * Границы государств по срезам времени — то, что загорается на глобусе,
 * когда тянешь ползунок.
 *
 *   node scripts/data/fetch-borders.mjs
 *
 * Источник: aourednik/historical-basemaps — 54 карты мира от −123000 до 2010.
 * Лицензия GPL-3, поэтому данные лежат отдельной папкой со своим LICENSE,
 * а код приложения от них не зависит.
 *
 * Сырые файлы весят по 3–20 МБ каждый: телефон такое не потянет. Поэтому
 * каждая карта прореживается — точки, которые на глобусе неразличимы,
 * выбрасываются, а форма остаётся узнаваемой. Прореживание своё
 * (алгоритм Рамера — Дугласа — Пекера), чтобы не тащить в проект ещё
 * одну зависимость ради двадцати строк.
 */
import { writeFileSync, statSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchJson, readCache, writeCache, RAW, ROOT } from './lib.mjs'

const OUT = resolve(ROOT, 'public', 'data', 'borders')
const BASE = 'https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson'

/**
 * Какие срезы берём. Все 54 не нужны: до −2000 карты почти пустые,
 * а рядом стоящие годы различаются мало. Взяты те, что попадают
 * на двенадцать эпох пути.
 */
const YEARS = [
  -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500,
  -400, -323, -300, -200, -100, -1, 100, 200, 300, 400,
  500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300,
  1400, 1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800,
  1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994,
  2000, 2010,
]

const fileFor = (year) => (year < 0 ? `world_bc${Math.abs(year)}.geojson` : `world_${year}.geojson`)

/** Порог упрощения в градусах. Крупнее — легче файл и грубее берег. */
const TOLERANCE = 0.35
/** Кусок меньше этого (в квадратных градусах) на глобусе не виден. */
const MIN_AREA = 0.6
const MAX_KB = 250

async function main() {
  mkdirSync(OUT, { recursive: true })
  mkdirSync(RAW, { recursive: true })

  const index = []
  let totalKb = 0

  for (const year of YEARS) {
    const name = fileFor(year)
    const key = `borders:${name}`
    let raw = readCache(key)

    if (!raw) {
      try {
        raw = await fetchJson(`${BASE}/${name}`, { label: name, retries: 4 })
        writeCache(key, raw)
      } catch (err) {
        console.warn(`  ${name}: пропускаем — ${err.message}`)
        continue
      }
    }

    const simplified = simplifyCollection(raw)
    if (!simplified.features.length) {
      console.warn(`  ${name}: после прореживания ничего не осталось, пропускаем`)
      continue
    }

    const outName = `${year}.json`
    const path = resolve(OUT, outName)
    writeFileSync(path, JSON.stringify(simplified))
    const kb = Math.round((statSync(path).size / 1024) * 10) / 10
    totalKb += kb

    index.push({ year, file: outName, features: simplified.features.length, kb })
    const flag = kb > MAX_KB ? ' ⚠ тяжелее бюджета' : ''
    console.log(`  ${year} → ${simplified.features.length} стран, ${kb} КБ${flag}`)
  }

  if (index.length < 30) throw new Error(`Скачалось всего ${index.length} срезов — этого мало`)

  writeFileSync(
    resolve(OUT, 'index.json'),
    JSON.stringify({
      version: 1,
      builtAt: new Date().toISOString(),
      source: 'https://github.com/aourednik/historical-basemaps',
      licence: 'GPL-3.0',
      note: 'Границы приблизительны. Автор помечает точность полем BORDERPRECISION.',
      years: index,
    }),
  )

  console.log(`\nГотово: ${index.length} срезов, ${Math.round(totalKb)} КБ всего`)
}

/* --------------------------- Прореживание --------------------------- */

function simplifyCollection(geojson) {
  const features = []

  for (const feature of geojson.features ?? []) {
    const name = pickName(feature.properties)
    if (!name) continue

    const geometry = simplifyGeometry(feature.geometry)
    if (!geometry) continue

    const props = { name }
    // Автор помечает, насколько граница достоверна. Показываем это честно.
    const precision = feature.properties?.BORDERPRECISION ?? feature.properties?.borderprecision
    if (precision !== undefined && precision !== null) props.precision = Number(precision)
    // «В подчинении» держим, только если там ДРУГАЯ страна. У независимых
    // это поле повторяет собственное имя, и без проверки на карточке
    // появляется бессмыслица вроде «Франция в подчинении: Франция».
    const subject = feature.properties?.SUBJECTO ?? feature.properties?.subjecto
    if (subject && String(subject).trim() && String(subject).trim() !== name) {
      props.subjectTo = String(subject).trim()
    }

    features.push({ type: 'Feature', properties: props, geometry })
  }

  return { type: 'FeatureCollection', features }
}

/** Имя страны у автора лежит в разных полях в зависимости от года карты. */
function pickName(props) {
  if (!props) return null
  for (const key of ['NAME', 'name', 'Name', 'SUBJECTO', 'ABBREVN']) {
    const value = props[key]
    if (typeof value === 'string' && value.trim() && value.trim() !== 'unclaimed') {
      return value.trim()
    }
  }
  return null
}

function simplifyGeometry(geometry) {
  if (!geometry) return null

  if (geometry.type === 'Polygon') {
    const rings = simplifyPolygon(geometry.coordinates)
    return rings ? { type: 'Polygon', coordinates: rings } : null
  }

  if (geometry.type === 'MultiPolygon') {
    const polygons = geometry.coordinates.map(simplifyPolygon).filter(Boolean)
    if (!polygons.length) return null
    if (polygons.length === 1) return { type: 'Polygon', coordinates: polygons[0] }
    return { type: 'MultiPolygon', coordinates: polygons }
  }

  return null
}

function simplifyPolygon(rings) {
  const outer = rings[0]
  if (!Array.isArray(outer) || outer.length < 4) return null
  if (Math.abs(ringArea(outer)) < MIN_AREA) return null

  const simplifiedOuter = closeRing(douglasPeucker(outer, TOLERANCE))
  if (simplifiedOuter.length < 4) return null

  const out = [simplifiedOuter]
  // Дырки (например, анклавы) держим только заметные.
  for (const hole of rings.slice(1)) {
    if (!Array.isArray(hole) || Math.abs(ringArea(hole)) < MIN_AREA * 4) continue
    const simplified = closeRing(douglasPeucker(hole, TOLERANCE))
    if (simplified.length >= 4) out.push(simplified)
  }
  return out
}

function closeRing(points) {
  const rounded = points.map(([x, y]) => [round(x), round(y)])
  const first = rounded[0]
  const last = rounded[rounded.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) rounded.push([first[0], first[1]])
  return rounded
}

const round = (n) => Math.round(n * 100) / 100

/** Площадь кольца — по формуле шнурков. Знак не важен, важен размер. */
function ringArea(points) {
  let sum = 0
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[i + 1]
    sum += x1 * y2 - x2 * y1
  }
  return sum / 2
}

/**
 * Рамер — Дуглас — Пекер: выкидываем точки, которые лежат почти на прямой
 * между соседями. Реализовано без рекурсии — у береговых линий бывают
 * десятки тысяч точек, и глубина рекурсии их не выдержит.
 */
function douglasPeucker(points, tolerance) {
  if (points.length < 3) return points.slice()

  const keep = new Uint8Array(points.length)
  keep[0] = 1
  keep[points.length - 1] = 1

  const stack = [[0, points.length - 1]]
  while (stack.length) {
    const [start, end] = stack.pop()
    let maxDist = 0
    let index = -1

    for (let i = start + 1; i < end; i++) {
      const dist = perpendicularDistance(points[i], points[start], points[end])
      if (dist > maxDist) {
        maxDist = dist
        index = i
      }
    }

    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1
      stack.push([start, index], [index, end])
    }
  }

  const out = []
  for (let i = 0; i < points.length; i++) if (keep[i]) out.push(points[i])
  return out
}

function perpendicularDistance(point, lineStart, lineEnd) {
  const [x, y] = point
  const [x1, y1] = lineStart
  const [x2, y2] = lineEnd
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  const clamped = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + clamped * dx), y - (y1 + clamped * dy))
}

main().catch((err) => {
  console.error('\nГраницы не собрались:', err.message)
  process.exit(1)
})
