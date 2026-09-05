import { useEffect, useState } from 'react'
import { commonsImageUrl } from '@/lib/types'
import { fetchImageCredit, type ImageCredit } from '@/lib/wikipedia'

/**
 * Картинка с Викисклада вместе с подписью «кто автор и по какой лицензии».
 * Подпись обязательна: у каждого файла свои условия, и показывать снимок
 * без них нельзя. Подпись догружается отдельно и не задерживает картинку.
 */
export default function EntityImage({
  file,
  alt,
  width = 640,
}: {
  file: string
  alt: string
  width?: number
}) {
  const [credit, setCredit] = useState<ImageCredit | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    setCredit(null)
    setFailed(false)
    void fetchImageCredit(file, controller.signal)
      .then((c) => setCredit(c))
      .catch(() => setCredit(null))
    return () => controller.abort()
  }, [file])

  if (failed) return null

  return (
    <figure className="entity-image">
      <img
        src={commonsImageUrl(file, width)}
        alt={alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
      <figcaption>
        <a
          href={credit?.page ?? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          {credit?.artist ? credit.artist : 'Wikimedia Commons'}
        </a>
        {credit?.licence ? ` · ${credit.licence}` : ''}
      </figcaption>
    </figure>
  )
}
