/**
 * Ворота размера. Приложение должно открываться на телефоне по мобильной
 * сети, поэтому вес — не «приятно бы», а условие сборки.
 * Превысили бюджет — сборка падает, и это видно сразу, а не через месяц.
 *
 * Бюджеты взяты из docs/ПЛАН.md §5.
 */
import { readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, join, extname } from 'node:path'

const DIST = resolve(process.cwd(), 'dist')

const BUDGETS = {
  jsTotalKb: 1536, // первая загрузка JS, ≤ 1,5 МБ
  cssTotalKb: 160,
  singleFileKb: 900,
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

const js = files.filter((f) => extname(f.path) === '.js')
const css = files.filter((f) => extname(f.path) === '.css')
const jsKb = kb(js.reduce((a, f) => a + f.bytes, 0))
const cssKb = kb(css.reduce((a, f) => a + f.bytes, 0))
const totalKb = kb(files.reduce((a, f) => a + f.bytes, 0))

const problems = []
if (jsKb > BUDGETS.jsTotalKb) problems.push(`JS ${jsKb} КБ > ${BUDGETS.jsTotalKb} КБ`)
if (cssKb > BUDGETS.cssTotalKb) problems.push(`CSS ${cssKb} КБ > ${BUDGETS.cssTotalKb} КБ`)
for (const f of files) {
  if (kb(f.bytes) > BUDGETS.singleFileKb) {
    problems.push(`${f.path} — ${kb(f.bytes)} КБ > ${BUDGETS.singleFileKb} КБ`)
  }
}

// Обязательные файлы: без них Pages отдаст 404 на маршрутах, а телефон не поставит приложение.
for (const must of ['index.html', '404.html', 'manifest.webmanifest', 'sw.js']) {
  if (!files.some((f) => f.path === must)) problems.push(`нет ${must} в dist`)
}
for (const icon of ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png']) {
  if (!files.some((f) => f.path.replace(/\\/g, '/') === icon)) problems.push(`нет ${icon}`)
}

console.log(`Сборка: ${files.length} файлов, ${totalKb} КБ · JS ${jsKb} КБ · CSS ${cssKb} КБ`)

if (problems.length) {
  console.error('\nБюджет не сошёлся:')
  for (const p of problems) console.error(`  ✗ ${p}`)
  process.exit(1)
}
console.log('Бюджет в порядке ✓')
