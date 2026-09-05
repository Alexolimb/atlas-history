/**
 * Путь по эпохам: главы, собранные из `content/` скриптом сборки.
 *
 * Файл лежит рядом с остальными данными и грузится по требованию —
 * с сорока двумя главами он вырастет за полмегабайта, и в первую
 * загрузку приложения ему нельзя.
 */

const BASE = import.meta.env.BASE_URL

export interface QuizDate {
  type: 'date'
  q: string
  prop: 'birth' | 'death' | 'start' | 'end'
  text: string
}
export interface QuizWho {
  type: 'who'
  q: string
  text: string
}
export interface QuizOrder {
  type: 'order'
  text: string
  items: string[]
}
export type Question = QuizDate | QuizWho | QuizOrder

export interface ChapterText {
  title: string
  subtitle: string
  body: string
}

export interface Chapter {
  id: string
  epoch: number
  order: number
  years: [number, number]
  globe: { year: number; focus?: string } | null
  cards: string[]
  facts: { q: string; prop: string; year: number }[]
  quiz: Question[]
  text: Record<string, ChapterText>
}

export interface Course {
  version: number
  builtAt: string
  chapters: Chapter[]
}

let coursePromise: Promise<Course> | null = null

export function loadCourse(): Promise<Course> {
  coursePromise ??= fetch(`${BASE}data/course.json`).then((res) => {
    if (!res.ok) throw new Error('Путь не загрузился')
    return res.json() as Promise<Course>
  })
  return coursePromise
}

/** Текст главы на нужном языке. Нет перевода — показываем английский. */
export function textOf(chapter: Chapter, lang: string): ChapterText & { translated: boolean } {
  const own = chapter.text[lang]
  if (own) return { ...own, translated: true }
  const en = chapter.text.en ?? { title: chapter.id, subtitle: '', body: '' }
  return { ...en, translated: false }
}

export function chaptersOfEpoch(course: Course, epoch: number): Chapter[] {
  return course.chapters
    .filter((c) => c.epoch === epoch)
    .sort((a, b) => a.order - b.order)
}

export function findChapter(course: Course, id: string): Chapter | undefined {
  return course.chapters.find((c) => c.id === id)
}

/** Следующая глава по всему пути, а не только внутри эпохи. */
export function nextChapter(course: Course, id: string): Chapter | undefined {
  const all = [...course.chapters].sort((a, b) => a.epoch - b.epoch || a.order - b.order)
  const index = all.findIndex((c) => c.id === id)
  return index >= 0 ? all[index + 1] : undefined
}

export function prevChapter(course: Course, id: string): Chapter | undefined {
  const all = [...course.chapters].sort((a, b) => a.epoch - b.epoch || a.order - b.order)
  const index = all.findIndex((c) => c.id === id)
  return index > 0 ? all[index - 1] : undefined
}

/**
 * Очень маленький разбор разметки текста главы. Понимает ровно то, чем
 * пользуются главы: подзаголовки, абзацы, **жирный** и *курсив*.
 * Полноценная библиотека разметки сюда не нужна: её вес несопоставим
 * с четырьмя правилами.
 */
export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'para'; parts: InlinePart[] }

export interface InlinePart {
  text: string
  bold?: boolean
  italic?: boolean
}

export function parseBody(body: string): Block[] {
  const blocks: Block[] = []
  for (const raw of body.split(/\n{2,}/)) {
    const chunk = raw.trim()
    if (!chunk) continue
    if (chunk.startsWith('## ')) {
      blocks.push({ kind: 'heading', text: chunk.slice(3).trim() })
      continue
    }
    blocks.push({ kind: 'para', parts: parseInline(chunk.replace(/\n/g, ' ')) })
  }
  return blocks
}

function parseInline(text: string): InlinePart[] {
  const parts: InlinePart[] = []
  const pattern = /\*\*(.+?)\*\*|\*(.+?)\*/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) })
    if (match[1] !== undefined) parts.push({ text: match[1], bold: true })
    else if (match[2] !== undefined) parts.push({ text: match[2], italic: true })
    last = pattern.lastIndex
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

/** Сколько минут читать. Считаем по 180 слов в минуту — это спокойный темп. */
export function readingMinutes(body: string): number {
  return Math.max(1, Math.round(body.trim().split(/\s+/).length / 180))
}
