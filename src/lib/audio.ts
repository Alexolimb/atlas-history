/**
 * Звук приложения: фоновая музыка и тихие звуки страниц.
 *
 * Два источника, и оба честные:
 *
 * 1. ФАЙЛЫ. Если в `public/audio/` лежат треки и есть `tracks.json`,
 *    играют они. Так задумано изначально: положить туда 3–5 лоуфай-треков
 *    с Pixabay (лицензия это разрешает, см. `public/audio/README.md`).
 *
 * 2. СВОЙ ЗВУК. Если файлов нет, приложение играет фон, собранный прямо
 *    в браузере: несколько тихих голосов, медленно расходящихся по высоте,
 *    сквозь мягкий фильтр. Это не «пикалка» — ударных и мелодии нет вовсе,
 *    только ровное дыхание на заднем плане. Весит ноль байт и работает
 *    офлайн с первой секунды.
 *
 * Звук НИКОГДА не включается сам. Браузеры это и так запрещают, но здесь
 * это ещё и решение Алекса: по умолчанию тишина, музыка — по кнопке.
 */

const BASE = import.meta.env.BASE_URL

export interface Track {
  file: string
  title: string
  author: string
  licence: string
  source: string
}

export interface TrackList {
  tracks: Track[]
}

/** Что лежит в `public/audio/`. Нет файла — работаем на своём звуке. */
export async function loadTracks(): Promise<Track[]> {
  try {
    const res = await fetch(`${BASE}audio/tracks.json`)
    if (!res.ok) return []
    const list = (await res.json()) as TrackList
    return Array.isArray(list.tracks) ? list.tracks : []
  } catch {
    return []
  }
}

/* ------------------------------ Свой фон ------------------------------ */

/** Ноты аккорда в герцах: ре-минорное девятое, спокойное и не приторное. */
const VOICES = [110.0, 164.81, 220.0, 261.63, 329.63]

/**
 * Ровный фон, собранный в браузере.
 *
 * Каждый голос — синус с очень медленным дрожанием высоты и громкости,
 * поэтому звучание не стоит на месте и не надоедает. Всё вместе идёт
 * через мягкий фильтр, чтобы не резало слух на телефонных динамиках.
 */
export class AmbientBed {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private nodes: OscillatorNode[] = []
  private lfos: OscillatorNode[] = []

  get running(): boolean {
    return this.ctx !== null
  }

  async start(volume: number): Promise<void> {
    if (this.ctx) {
      this.setVolume(volume)
      return
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    this.ctx = ctx

    // Браузер даёт звук только после действия человека. Кнопка — и есть действие.
    if (ctx.state === 'suspended') await ctx.resume()

    const master = ctx.createGain()
    master.gain.value = 0
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    filter.Q.value = 0.6
    master.connect(filter).connect(ctx.destination)
    this.master = master

    VOICES.forEach((freq, index) => {
      const osc = ctx.createOscillator()
      osc.type = index < 2 ? 'sine' : 'triangle'
      osc.frequency.value = freq

      const gain = ctx.createGain()
      gain.gain.value = 0.16 / (index + 1)

      // Медленное дыхание громкости: у каждого голоса свой период,
      // поэтому рисунок не повторяется на слух.
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.03 + index * 0.017
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.09 / (index + 1)
      lfo.connect(lfoGain).connect(gain.gain)

      // Едва заметная гуляющая расстройка — живое звучание вместо машинного.
      const drift = ctx.createOscillator()
      drift.frequency.value = 0.05 + index * 0.011
      const driftGain = ctx.createGain()
      driftGain.gain.value = 0.35
      drift.connect(driftGain).connect(osc.frequency)

      osc.connect(gain).connect(master)
      osc.start()
      lfo.start()
      drift.start()

      this.nodes.push(osc)
      this.lfos.push(lfo, drift)
    })

    // Плавное появление: резкий старт звука пугает.
    master.gain.setValueAtTime(0, ctx.currentTime)
    master.gain.linearRampToValueAtTime(volume * 0.5, ctx.currentTime + 3)
  }

  setVolume(volume: number): void {
    if (!this.ctx || !this.master) return
    this.master.gain.cancelScheduledValues(this.ctx.currentTime)
    this.master.gain.linearRampToValueAtTime(volume * 0.5, this.ctx.currentTime + 0.4)
  }

  async stop(): Promise<void> {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return

    // Плавное затухание, потом уже выключаем: обрыв на полуноте слышен.
    master.gain.cancelScheduledValues(ctx.currentTime)
    master.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.2)
    await new Promise((r) => setTimeout(r, 1300))

    for (const node of [...this.nodes, ...this.lfos]) {
      try {
        node.stop()
      } catch {
        /* уже остановлен */
      }
    }
    this.nodes = []
    this.lfos = []
    this.master = null
    this.ctx = null
    try {
      await ctx.close()
    } catch {
      /* уже закрыт */
    }
  }
}

/* ------------------------------ Звуки страниц ------------------------------ */

let clickCtx: AudioContext | null = null

/**
 * Тихий шелест при переходе на другую страницу.
 *
 * Это короткий отфильтрованный шум — как страница книги, а не «бип».
 * Никаких файлов: один звук в полсекунды не стоит отдельной загрузки.
 */
export function playPageSound(volume = 0.3): void {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    clickCtx ??= new Ctor()
    const ctx = clickCtx
    if (ctx.state === 'suspended') void ctx.resume()

    const duration = 0.22
    const frames = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      // Шум, затухающий к концу — получается «шшух», а не «пшш».
      const fade = 1 - i / frames
      data[i] = (Math.random() * 2 - 1) * fade * fade
    }

    const source = ctx.createBufferSource()
    source.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2400
    filter.Q.value = 0.8

    const gain = ctx.createGain()
    gain.gain.value = Math.min(0.25, volume * 0.25)

    source.connect(filter).connect(gain).connect(ctx.destination)
    source.start()
  } catch {
    /* звук — не то, ради чего можно уронить экран */
  }
}
