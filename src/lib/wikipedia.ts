import { cacheGet, cacheSet } from './cache'

/**
 * Тексты статей из Википедии.
 *
 * Берём краткую выжимку (первые абзацы) через открытый REST-адрес —
 * он отдаёт готовый текст без разметки и не требует ключей.
 *
 * Лицензия текста — CC BY-SA 4.0, поэтому вместе с текстом ВСЕГДА едет
 * ссылка на статью. Показывать текст без неё нельзя.
 */

export interface Article {
  title: string
  extract: string
  url: string
  lang: string
  /** Картинка из шапки статьи, если есть. */
  image?: string
  imageWidth?: number
  imageHeight?: number
}

export const WIKIPEDIA_LICENCE = 'CC BY-SA 4.0'

/**
 * Выжимка статьи. Возвращает null, если статьи нет или сети нет —
 * приложение в этом случае показывает карточку без текста, но не падает.
 */
export async function fetchArticle(
  lang: string,
  title: string,
  signal?: AbortSignal,
): Promise<Article | null> {
  const key = `w.${lang}.${title}`
  const hit = await cacheGet<Article>(key)
  if (hit) return hit

  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, '_'),
  )}?redirect=true`

  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch {
    return null // нет сети — не беда, карточка живёт и без текста
  }
  if (!res.ok) return null

  const data = (await res.json()) as {
    title?: string
    extract?: string
    content_urls?: { desktop?: { page?: string } }
    thumbnail?: { source?: string; width?: number; height?: number }
    originalimage?: { source?: string }
    type?: string
  }

  // Страница-разрешение неоднозначностей — не статья, показывать нечего.
  if (data.type === 'disambiguation' || !data.extract) return null

  const article: Article = {
    title: data.title ?? title,
    extract: data.extract,
    url:
      data.content_urls?.desktop?.page ??
      `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`,
    lang,
  }
  if (data.thumbnail?.source) {
    article.image = data.thumbnail.source
    article.imageWidth = data.thumbnail.width
    article.imageHeight = data.thumbnail.height
  }

  void cacheSet(key, article)
  return article
}

/**
 * Кто снял картинку и на каких условиях. Без этого показывать снимок
 * с Викисклада нельзя: у каждого файла своя лицензия и свой автор.
 */
export interface ImageCredit {
  file: string
  page: string
  artist?: string
  licence?: string
}

export async function fetchImageCredit(
  file: string,
  signal?: AbortSignal,
): Promise<ImageCredit | null> {
  const key = `img.${file}`
  const hit = await cacheGet<ImageCredit>(key)
  if (hit) return hit

  const url =
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*' +
    `&titles=${encodeURIComponent(`File:${file}`)}` +
    '&prop=imageinfo&iiprop=extmetadata&iiextmetadatafilter=Artist|LicenseShortName'

  let res: Response
  try {
    res = await fetch(url, { signal })
  } catch {
    return null
  }
  if (!res.ok) return null

  const data = (await res.json()) as {
    query?: {
      pages?: Record<
        string,
        {
          imageinfo?: {
            extmetadata?: Record<string, { value?: string }>
          }[]
        }
      >
    }
  }

  const page = Object.values(data.query?.pages ?? {})[0]
  const meta = page?.imageinfo?.[0]?.extmetadata
  const credit: ImageCredit = {
    file,
    page: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/ /g, '_'))}`,
  }
  const artist = stripTags(meta?.Artist?.value)
  const licence = stripTags(meta?.LicenseShortName?.value)
  if (artist) credit.artist = artist
  if (licence) credit.licence = licence

  void cacheSet(key, credit)
  return credit
}

/** В подписи автора у Викисклада лежит кусок HTML — оставляем только текст. */
function stripTags(html: string | undefined): string | undefined {
  if (!html) return undefined
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length ? text.slice(0, 200) : undefined
}
