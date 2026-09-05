import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useSettings, resolveTheme } from '@/store/settings'
import { useProgress } from '@/store/progress'
import { applyUiLanguage } from '@/i18n'
import { isRtl } from '@/i18n/languages'
import { playPageSound } from '@/lib/audio'

/**
 * Одно место, где настройки становятся видимыми: тема, размер текста,
 * движение, язык и направление письма пишутся атрибутами на <html>,
 * а CSS-токены дальше сами делают всю работу.
 */
export function useAppChrome() {
  const { language, theme, textSize, reducedMotion } = useSettings()
  const pageSounds = useSettings((s) => s.pageSounds)
  const musicVolume = useSettings((s) => s.musicVolume)
  const location = useLocation()
  const firstRender = useRef(true)
  const touchToday = useProgress((s) => s.touchToday)

  // Тема. 'system' должна переключаться на лету, если человек сменил её в устройстве.
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const resolved = resolveTheme(theme)
      root.dataset.theme = resolved
      const meta = document.querySelector('meta[name="theme-color"]')
      meta?.setAttribute('content', resolved === 'light' ? '#f6f1e4' : '#0b1120')
    }
    apply()
    if (theme !== 'system' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    document.documentElement.dataset.text = textSize
  }, [textSize])

  useEffect(() => {
    document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'
  }, [reducedMotion])

  useEffect(() => {
    void applyUiLanguage(language)
    document.documentElement.lang = language
    document.documentElement.dir = isRtl(language) ? 'rtl' : 'ltr'
  }, [language])

  /**
   * Шелест при переходе на другую страницу.
   * На самом первом экране молчим: звук в момент открытия приложения —
   * это неожиданно и неприятно.
   */
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (pageSounds) playPageSound(musicVolume)
  }, [location.pathname, pageSounds, musicVolume])

  /**
   * Отмечаем день захода — на этом держится серия дней.
   *
   * ЖДЁМ, пока прогресс прочитается с устройства. Хранилище асинхронное:
   * в первые мгновения после запуска в памяти лежит ПУСТОЙ прогресс, и любая
   * запись в этот момент затирает на устройстве всё — опыт, пройденные главы,
   * закладки. Ровно так и случилось при первой проверке: глава была пройдена,
   * а после перехода на другой экран от неё не осталось следа.
   */
  useEffect(() => {
    if (useProgress.persist.hasHydrated()) {
      touchToday()
      return
    }
    const stop = useProgress.persist.onFinishHydration(() => touchToday())
    return () => stop()
  }, [touchToday])
}
