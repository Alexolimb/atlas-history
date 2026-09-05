import { useEffect, useState } from 'react'
import { useSettings } from '@/store/settings'
import { loadLibrary, type Library } from './library'
import { cacheTrim } from './cache'

export type LibraryState =
  | { status: 'loading'; lib: null; error: null }
  | { status: 'ready'; lib: Library; error: null }
  | { status: 'error'; lib: null; error: string }

/**
 * Ядро справочника для экранов. Перезагружается при смене языка —
 * имена и описания на разных языках лежат в разных файлах.
 */
export function useLibrary(): LibraryState {
  const lang = useSettings((s) => s.language)
  const [state, setState] = useState<LibraryState>({ status: 'loading', lib: null, error: null })

  useEffect(() => {
    let alive = true
    setState({ status: 'loading', lib: null, error: null })

    loadLibrary(lang)
      .then((lib) => {
        if (alive) setState({ status: 'ready', lib, error: null })
      })
      .catch((err: unknown) => {
        if (!alive) return
        const message = err instanceof Error ? err.message : 'Справочник не загрузился'
        setState({ status: 'error', lib: null, error: message })
      })

    return () => {
      alive = false
    }
  }, [lang])

  // Изредка подрезаем кэш догруженного, чтобы он не рос без края.
  useEffect(() => {
    if (state.status !== 'ready') return
    const timer = window.setTimeout(() => void cacheTrim(), 4000)
    return () => window.clearTimeout(timer)
  }, [state.status])

  return state
}
