/**
 * Импорт воркфлоу ИИ-гида в n8n одной командой:
 *
 *     node scripts/import-guide.mjs
 *
 * Что делает: берёт `n8n/atlas-guide.json`, кладёт его на сервер Алексея
 * через Public API и включает. Если такой воркфлоу уже есть — обновляет его,
 * а не плодит копии.
 *
 * Ключ НЕ вшит в код и не печатается. Скрипт читает его из реестра
 * `Brain\Claud\n8n_server_registry.md` — там же, где он лежит для всех
 * остальных задач. Реестр не уходит в git.
 *
 * Почему это скрипт, а не мои руки: среда Claude Code не даёт мне отправить
 * секрет из файла в сеть, а n8n в браузере просит пароль, который мне
 * вводить запрещено. Поэтому — одна команда для Алекса.
 */

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REGISTRY = resolve(homedir(), 'Desktop', 'Brain', 'Claud', 'n8n_server_registry.md')
const HOST = 'https://178-105-123-85.nip.io'
const WORKFLOW = resolve(ROOT, 'n8n', 'atlas-guide.json')

const die = (msg) => {
  console.error(`\n✗ ${msg}\n`)
  process.exit(1)
}

/** Первый JWT из реестра — это и есть действующий ключ Public API. */
function readKey() {
  let text
  try {
    text = readFileSync(REGISTRY, 'utf8')
  } catch {
    die(`не нашёл реестр ${REGISTRY}\n  Ключ можно взять руками: n8n → Settings → n8n API.`)
  }
  const found = text.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[\w-]+\.[\w-]+/)
  if (!found) die('в реестре нет ключа n8n Public API')
  return found[0]
}

async function api(key, path, init = {}) {
  const res = await fetch(`${HOST}/api/v1${path}`, {
    ...init,
    headers: { 'X-N8N-API-KEY': key, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
  const body = await res.text()
  if (!res.ok) {
    if (res.status === 401) {
      die('сервер ответил 401: ключ в реестре мёртв.\n  Выпустить новый: n8n → Settings → n8n API → Create API key,\n  затем вписать его в реестр вместо старого.')
    }
    die(`${init.method ?? 'GET'} ${path} → ${res.status}\n  ${body.slice(0, 300)}`)
  }
  return body ? JSON.parse(body) : {}
}

async function main() {
  const key = readKey()
  const wf = JSON.parse(readFileSync(WORKFLOW, 'utf8'))
  const name = wf.name ?? 'Atlas — ИИ-гид'

  console.log(`Воркфлоу: «${name}», узлов ${wf.nodes?.length ?? 0}`)

  const list = await api(key, '/workflows?limit=250')
  const existing = list.data?.find((w) => w.name === name)

  /* n8n принимает только эти поля; лишние вызывают 400. */
  const payload = {
    name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings ?? {},
  }

  let id
  if (existing) {
    console.log(`Такой уже есть (id ${existing.id}) — обновляю, копию не плодим.`)
    const updated = await api(key, `/workflows/${existing.id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    id = updated.id ?? existing.id
  } else {
    const created = await api(key, '/workflows', { method: 'POST', body: JSON.stringify(payload) })
    id = created.id
    console.log(`Создан, id ${id}`)
  }

  await api(key, `/workflows/${id}/activate`, { method: 'POST' })
  console.log('Включён ✓')

  const check = await api(key, `/workflows/${id}`)
  console.log(`\nПроверка: «${check.name}», активен: ${check.active === true ? 'да' : 'НЕТ'}`)
  console.log(`Адрес вебхука: ${HOST}/webhook/atlas/v1/guide`)
  console.log('\nТеперь в приложении заработают кнопки «Объясни проще», «Проверь меня»,')
  console.log('«Почему это важно» и «Что дальше».')
}

main().catch((e) => die(String(e?.message ?? e)))
