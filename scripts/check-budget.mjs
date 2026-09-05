/**
 * Ворота размера. Приложение должно открываться на телефоне по мобильной
 * сети, поэтому вес — не «приятно бы», а условие сборки.
 *
 * Считаем ПЕРВУЮ ЗАГРУЗКУ, а не всё подряд. Это разные вещи: объёмный глобус
 * тянет за собой three.js на без малого два мегабайта, но грузится он только
 * когда человек до глобуса дошёл, и только если не выключил 3D в настройках.
 * Складывать его в первую загрузку — врать себе о скорости открытия.
 *
 * Первая загрузка — это ровно то, что перечислено в index.html:
 * теги <script> и <link rel="modulepreload">. Всё остальное подгружается.
 *
 * Бюджеты из docs/ПЛАН.md §5.
 */
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')

const BUDGETS = {
  firstLoadJsKb: 1536, // то, что грузится сразу
  lazyChunkKb: 2048, // самый крупный кусок по требованию (внутри three.js)
  cssTotalKb: 160,
  assetKb: 900, // картинки, шрифты и прочее
  coreTotalKb: 15360, // справочник на 30 языках
  coreSingleKb: 1500,
  bordersTotalKb: 5120, // 52 карты мира
  bordersSingleKb: 260, // одна карта: её тянут по мобильной сети
  audioTotalKb: 12288, // вся музыка вместе, из docs/ПЛАН.md §5
  localesTotalKb: 700, // 28 языков интерфейса, каждый грузится отдельно
}

if (!existsSync(DIST)) {
  console.error('Нет папки dist. Сначала `npm run build`.')
  process.exit(1)
}

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else out.push({ path: full.slice(DIST.length + 1), bytes: st.size })
  }
  return out
}

const files = walk(DIST)
const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10
const slash = (p) => p.split('\\').join('/')

const isCore = (f) => slash(f.path).includes('data/core/')
const isBorders = (f) => slash(f.path).includes('data/borders/')
const isAudio = (f) => slash(f.path).startsWith('audio/')
const isLocale = (f) => slash(f.path).startsWith('locales/')
const isData = (f) => isCore(f) || isBorders(f)

/** Что перечислено в index.html — то и грузится при открытии. */
function firstLoadFiles() {
  const html = readFileSync(resolve(DIST, 'index.html'), 'utf8')
  const refs = new Set()
  for (const m of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
    refs.add(slash(m[1]).replace(/^.*\/atlas-history\//, '').replace(/^\//, ''))
  }
  return files.filter((f) => refs.has(slash(f.path)))
}

const first = firstLoadFiles()
const firstJsKb = kb(first.filter((f) => extname(f.path) === '.js').reduce((a, f) => a + f.bytes, 0))
const cssKb = kb(
  files.filter((f) => extname(f.path) === '.css' && !isData(f)).reduce((a, f) => a + f.bytes, 0),
)
const allJsKb = kb(
  files.filter((f) => extname(f.path) === '.js' && !isData(f)).reduce((a, f) => a + f.bytes, 0),
)
const coreKb = kb(files.filter(isCore).reduce((a, f) => a + f.bytes, 0))
const bordersKb = kb(files.filter(isBorders).reduce((a, f) => a + f.bytes, 0))
const totalKb = kb(files.reduce((a, f) => a + f.bytes, 0))

const problems = []

if (first.length === 0) problems.push('в index.html не нашлось ни одного файла — сборка пустая?')
if (firstJsKb > BUDGETS.firstLoadJsKb) {
  problems.push(`первая загрузка JS ${firstJsKb} КБ > ${BUDGETS.firstLoadJsKb} КБ`)
}
if (cssKb > BUDGETS.cssTotalKb) problems.push(`CSS ${cssKb} КБ > ${BUDGETS.cssTotalKb} КБ`)

for (const f of files) {
  if (isAudio(f) || isLocale(f)) continue // проверяются общим весом, а не поштучно
  const limit = isBorders(f)
    ? BUDGETS.bordersSingleKb
    : isCore(f)
      ? BUDGETS.coreSingleKb
      : extname(f.path) === '.js'
        ? BUDGETS.lazyChunkKb
        : BUDGETS.assetKb
  if (kb(f.bytes) > limit) problems.push(`${f.path} — ${kb(f.bytes)} КБ > ${limit} КБ`)
}

if (coreKb > BUDGETS.coreTotalKb) problems.push(`справочник ${coreKb} КБ > ${BUDGETS.coreTotalKb} КБ`)
if (bordersKb > BUDGETS.bordersTotalKb) {
  problems.push(`карты границ ${bordersKb} КБ > ${BUDGETS.bordersTotalKb} КБ`)
}

const audioKb = kb(files.filter(isAudio).reduce((a, f) => a + f.bytes, 0))
if (audioKb > BUDGETS.audioTotalKb) problems.push(`музыка ${audioKb} КБ > ${BUDGETS.audioTotalKb} КБ`)

const localeFiles = files.filter(isLocale)
const localesKb = kb(localeFiles.reduce((a, f) => a + f.bytes, 0))
if (localesKb > BUDGETS.localesTotalKb) {
  problems.push(`языки интерфейса ${localesKb} КБ > ${BUDGETS.localesTotalKb} КБ`)
}
if (localeFiles.length < 28) problems.push(`языков интерфейса только ${localeFiles.length}, ожидали 28`)

// Пустые данные в сборке — та же неправда, что и неверные данные.
const coreCount = files.filter(isCore).length
const borderCount = files.filter(isBorders).length
if (coreCount < 32) problems.push(`файлов справочника только ${coreCount}, ожидали 33`)
if (borderCount < 50) problems.push(`карт границ только ${borderCount}, ожидали 53`)

// Без них Pages отдаст 404 на маршрутах, а телефон не поставит приложение.
for (const must of ['index.html', '404.html', 'manifest.webmanifest', 'sw.js']) {
  if (!files.some((f) => f.path === must)) problems.push(`нет ${must} в dist`)
}
for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  if (!files.some((f) => slash(f.path) === icon)) problems.push(`нет ${icon}`)
}

console.log(`Сборка: ${files.length} файлов, ${totalKb} КБ`)
console.log(`  первая загрузка: JS ${firstJsKb} КБ, CSS ${cssKb} КБ`)
console.log(`  по требованию: ещё ${Math.round(allJsKb - firstJsKb)} КБ кода (глобус)`)
console.log(
  `  данные: справочник ${coreKb} КБ, карты ${bordersKb} КБ, языки ${localesKb} КБ, музыка ${audioKb} КБ`,
)

if (problems.length) {
  console.error('\nБюджет не сошёлся:')
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('Бюджет в порядке ✓')
