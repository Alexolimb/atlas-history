/**
 * Живая проверка: работает ли догрузка из сети прямо сейчас.
 *
 *   node scripts/data/smoke.mjs
 *
 * Сознательно НЕ входит в `npm run check`: ворота сборки не должны падать
 * оттого, что у Wikipedia профилактика. Запускается руками и в ревизии.
 *
 * Проверяем ровно то, на чём приложение может тихо соврать:
 *   · карточка, которой нет в ядре, догружается и разбирается;
 *   · у знаменитых людей находится имя (ловушка кода языка mul);
 *   · поиск отвечает;
 *   · выжимка статьи приходит вместе со ссылкой на источник;
 *   · у картинки есть автор и лицензия.
 */
import { UA } from './lib.mjs'

const checks = []
const record = (name, ok, note = '') => {
  checks.push({ name, ok, note })
  console.log(`  ${ok ? '✓' : '✗'} ${name}${note ? ` — ${note}` : ''}`)
}

const api = async (url) => {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

console.log('Живая проверка источников\n')

/* 1. Карточка, которой заведомо нет в ядре. */
try {
  const id = 'Q7314' // Игорь Стравинский — известен, но в ядро не входит
  const data = await api(
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json' +
      `&ids=${id}&props=labels|descriptions|claims|sitelinks&languages=ru|en|mul&sitefilter=ruwiki|enwiki`,
  )
  const item = data.entities?.[id]
  const name = item?.labels?.ru?.value ?? item?.labels?.mul?.value ?? item?.labels?.en?.value
  const birth = item?.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time
  record('догрузка карточки вне ядра', Boolean(name && birth), `${name}, рождение ${birth}`)
} catch (err) {
  record('догрузка карточки вне ядра', false, err.message)
}

/* 2. Ловушка mul: у Эйнштейна английского имени нет, есть общее. */
try {
  const data = await api(
    'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json' +
      '&ids=Q937|Q1035&props=labels&languages=ru|en|mul',
  )
  const ok = ['Q937', 'Q1035'].every((id) => {
    const l = data.entities?.[id]?.labels
    return Boolean(l?.en?.value ?? l?.mul?.value)
  })
  const einstein = data.entities?.Q937?.labels
  record(
    'имя находится даже без английской метки (код mul)',
    ok,
    `Эйнштейн: en=${einstein?.en?.value ?? '—'}, mul=${einstein?.mul?.value ?? '—'}`,
  )
} catch (err) {
  record('имя находится даже без английской метки (код mul)', false, err.message)
}

/* 3. Поиск. */
try {
  const data = await api(
    'https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json' +
      '&search=' + encodeURIComponent('Хаммурапи') + '&language=ru&uselang=ru&limit=5&type=item',
  )
  const first = data.search?.[0]
  record('поиск по Wikidata', Boolean(first?.id), `${first?.id} ${first?.label ?? ''}`)
} catch (err) {
  record('поиск по Wikidata', false, err.message)
}

/* 4. Выжимка статьи со ссылкой на источник. */
try {
  const res = await fetch(
    'https://ru.wikipedia.org/api/rest_v1/page/summary/' +
      encodeURIComponent('Древний_Рим') + '?redirect=true',
    { headers: { 'User-Agent': UA } },
  )
  const data = await res.json()
  const ok = Boolean(data.extract && data.content_urls?.desktop?.page)
  record('текст статьи и ссылка на неё', ok, `${data.extract?.slice(0, 60)}…`)
} catch (err) {
  record('текст статьи и ссылка на неё', false, err.message)
}

/* 5. Автор и лицензия картинки — без них снимок показывать нельзя. */
try {
  const data = await api(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json' +
      '&titles=' + encodeURIComponent('File:Bust of Julius Caesar.jpg') +
      '&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName',
  )
  const page = Object.values(data.query?.pages ?? {})[0]
  const meta = page?.imageinfo?.[0]?.extmetadata
  const licence = meta?.LicenseShortName?.value
  record('лицензия картинки с Викисклада', Boolean(licence), String(licence ?? ''))
} catch (err) {
  record('лицензия картинки с Викисклада', false, err.message)
}

const failed = checks.filter((c) => !c.ok)
console.log(`\nПройдено ${checks.length - failed.length} из ${checks.length}`)
if (failed.length) process.exit(1)
