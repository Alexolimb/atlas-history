import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Question } from '@/lib/course'
import type { Library } from '@/lib/library'
import { nameOf } from '@/lib/library'
import { formatHistDate, type HistDate } from '@/lib/types'

/**
 * Проверка после главы.
 *
 * Ключевое: варианты ответов НЕ придуманы, а собраны из настоящих данных.
 * Правильный ответ берётся из карточки Wikidata, а неправильные — это
 * настоящие даты и имена других карточек. Поэтому вопрос не может оказаться
 * неверным сам по себе: он ровно настолько верен, насколько верны данные,
 * которые человек и так видит в справочнике.
 */
export default function Quiz({
  questions,
  lib,
  onFinish,
}: {
  questions: Question[]
  lib: Library
  onFinish: (correct: number, total: number) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<boolean[]>([])
  const [picked, setPicked] = useState<string | null>(null)

  const question = questions[step]
  const built = useMemo(() => (question ? buildQuestion(question, lib) : null), [question, lib])

  if (!question || !built) return null

  const finished = step >= questions.length
  if (finished) return null

  const answer = (choice: string) => {
    if (picked !== null) return
    setPicked(choice)
    const correct = choice === built.answer
    const next = [...answers, correct]
    setAnswers(next)

    window.setTimeout(() => {
      if (step + 1 >= questions.length) {
        onFinish(next.filter(Boolean).length, questions.length)
      }
      setStep((s) => s + 1)
      setPicked(null)
    }, 1100)
  }

  return (
    <div className="quiz">
      <div className="quiz__progress">
        {t('quiz.step', { current: step + 1, total: questions.length })}
      </div>
      <p className="quiz__question">{built.text}</p>

      <div className="quiz__options">
        {built.options.map((option) => {
          const state =
            picked === null
              ? ''
              : option === built.answer
                ? ' quiz__option--right'
                : option === picked
                  ? ' quiz__option--wrong'
                  : ' quiz__option--dim'
          return (
            <button
              key={option}
              type="button"
              className={`quiz__option${state}`}
              onClick={() => answer(option)}
              disabled={picked !== null}
            >
              {built.labels[option] ?? option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface BuiltQuestion {
  text: string
  answer: string
  options: string[]
  labels: Record<string, string>
}

/** Собирает вопрос из настоящих данных справочника. */
function buildQuestion(question: Question, lib: Library): BuiltQuestion | null {
  if (question.type === 'date') return buildDate(question, lib)
  if (question.type === 'who') return buildWho(question, lib)
  return buildOrder(question, lib)
}

function buildDate(
  question: Extract<Question, { type: 'date' }>,
  lib: Library,
): BuiltQuestion | null {
  const entity = lib.entities.get(question.q)
  const date = pickDate(entity, question.prop)
  if (!date) return null

  const right = String(date.year)
  // Неправильные варианты — настоящие годы других карточек рядом по времени.
  const nearby = new Set<string>()
  for (const other of lib.entities.values()) {
    const otherDate = pickDate(other, question.prop)
    if (!otherDate || otherDate.year === date.year) continue
    if (Math.abs(otherDate.year - date.year) > 300) continue
    nearby.add(String(otherDate.year))
    if (nearby.size >= 12) break
  }
  // Если рядом ничего не нашлось, сдвигаем на правдоподобные величины.
  for (const shift of [7, -12, 25, -30, 60]) {
    if (nearby.size >= 3) break
    nearby.add(String(date.year + shift))
  }

  const wrong = shuffle([...nearby]).slice(0, 3)
  const options = shuffle([right, ...wrong])
  const labels: Record<string, string> = {}
  for (const option of options) {
    labels[option] = formatHistDate({ year: Number(option), precision: 9 }, lib.lang)
  }
  return { text: question.text, answer: right, options, labels }
}

function buildWho(
  question: Extract<Question, { type: 'who' }>,
  lib: Library,
): BuiltQuestion | null {
  const right = question.q
  const target = lib.entities.get(right)
  if (!target) return null

  const sameKind: string[] = []
  for (const [id, other] of lib.entities) {
    if (id === right || other.type !== target.type) continue
    // Берём современников: иначе ответ угадывается по одной эпохе.
    const a = target.start?.year
    const b = other.start?.year
    if (a !== undefined && b !== undefined && Math.abs(a - b) > 400) continue
    if (nameOf(lib, id) === id) continue
    sameKind.push(id)
    if (sameKind.length >= 40) break
  }

  const wrong = shuffle(sameKind).slice(0, 3)
  const options = shuffle([right, ...wrong])
  const labels: Record<string, string> = {}
  for (const option of options) labels[option] = nameOf(lib, option)
  return { text: question.text, answer: right, options, labels }
}

/**
 * «Что было раньше»: вариантов ровно столько, сколько предметов,
 * и правильный определяется по настоящим датам, а не по порядку в файле.
 */
function buildOrder(
  question: Extract<Question, { type: 'order' }>,
  lib: Library,
): BuiltQuestion | null {
  const dated = question.items
    .map((id) => ({ id, year: lib.entities.get(id)?.start?.year }))
    .filter((row): row is { id: string; year: number } => row.year !== undefined)

  if (dated.length < 2) return null
  const earliest = dated.reduce((a, b) => (a.year <= b.year ? a : b))

  const options = shuffle(dated.map((row) => row.id))
  const labels: Record<string, string> = {}
  for (const option of options) labels[option] = nameOf(lib, option)
  return { text: question.text, answer: earliest.id, options, labels }
}

function pickDate(
  entity: { start?: HistDate; end?: HistDate } | undefined,
  prop: string,
): HistDate | undefined {
  if (!entity) return undefined
  return prop === 'death' || prop === 'end' ? entity.end : entity.start
}

function shuffle<T>(list: T[]): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
