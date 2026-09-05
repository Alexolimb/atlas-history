/**
 * Иконки приложения без единой внешней зависимости.
 *
 * Рисуем PNG вручную (свой мини-кодировщик): золотой шар-глобус с
 * меридианами на тёмно-синем поле. Так иконка пересобирается на любой
 * машине командой `node scripts/make-icons.mjs`, и её не надо носить
 * бинарником в репозитории.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')
mkdirSync(OUT, { recursive: true })

const NAVY = [0x0b, 0x11, 0x20]
const GOLD = [0xd4, 0xaf, 0x37]
const GOLD_DIM = [0x8a, 0x71, 0x22]

/** Один пиксель иконки: решаем, какого он цвета. */
function pixel(x, y, size, inset) {
  const cx = size / 2
  const cy = size / 2
  const r = (size / 2) * inset
  const dx = x - cx
  const dy = y - cy
  const dist = Math.hypot(dx, dy)

  if (dist > r) return NAVY

  // Кольцо-ободок
  if (dist > r * 0.94) return GOLD

  // Экватор и два тропика
  const bandWidth = size * 0.016
  for (const frac of [0, -0.42, 0.42]) {
    if (Math.abs(dy - r * frac) < bandWidth && dist < r * 0.94) return GOLD_DIM
  }

  // Меридианы: эллипсы, сжатые по горизонтали
  for (const squeeze of [0.34, 0.72]) {
    const ex = dx / squeeze
    const edge = Math.abs(Math.hypot(ex, dy) - r)
    if (edge < bandWidth * (0.9 / squeeze) && dist < r * 0.94) return GOLD_DIM
  }

  // Центральный меридиан — прямая линия
  if (Math.abs(dx) < bandWidth && dist < r * 0.94) return GOLD_DIM

  return NAVY
}

function renderPng(size, inset) {
  const raw = Buffer.alloc(size * (size * 3 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // фильтр строки: none
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x + 0.5, y + 0.5, size, inset)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
    }
  }

  const chunk = (type, data) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // бит на канал
  ihdr[9] = 2 // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return c ^ 0xffffffff
}

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0B1120"/>
  <g fill="none" stroke="#D4AF37" stroke-width="2">
    <circle cx="32" cy="32" r="20"/>
    <path d="M32 12c-7 8-7 32 0 40M32 12c7 8 7 32 0 40" stroke="#8A7122"/>
    <path d="M12 32h40M15 22h34M15 42h34" stroke="#8A7122"/>
  </g>
</svg>
`

writeFileSync(resolve(OUT, 'favicon.svg'), SVG)
// inset 0.86 — обычная иконка; 0.62 — maskable, у неё края срезает система
writeFileSync(resolve(OUT, 'icon-192.png'), renderPng(192, 0.86))
writeFileSync(resolve(OUT, 'icon-512.png'), renderPng(512, 0.86))
writeFileSync(resolve(OUT, 'icon-maskable-512.png'), renderPng(512, 0.62))
writeFileSync(resolve(OUT, 'apple-touch-icon.png'), renderPng(180, 0.86))

console.log('Иконки собраны в public/icons')

/**
 * Иконка для ярлыка Windows. Внутри ICO лежит обычный PNG —
 * так умеет Windows начиная с Vista, и не нужен отдельный кодировщик.
 */
function icoFromPng(png) {
  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0) // зарезервировано
  dir.writeUInt16LE(1, 2) // тип: иконка
  dir.writeUInt16LE(1, 4) // одна картинка внутри

  const entry = Buffer.alloc(16)
  entry[0] = 0 // ширина 256 записывается нулём
  entry[1] = 0 // высота 256 — тоже
  entry[2] = 0 // палитры нет
  entry[3] = 0
  entry.writeUInt16LE(1, 4) // плоскостей
  entry.writeUInt16LE(32, 6) // бит на пиксель
  entry.writeUInt32LE(png.length, 8)
  entry.writeUInt32LE(6 + 16, 12)

  return Buffer.concat([dir, entry, png])
}

writeFileSync(resolve(OUT, 'atlas.ico'), icoFromPng(renderPng(256, 0.86)))
console.log('Иконка ярлыка: public/icons/atlas.ico')
