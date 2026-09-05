import { describe, it, expect, vi, afterEach } from 'vitest'
import { clamp01, resolveTheme, defaultSettings } from '@/store/settings'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('настройки', () => {
  it('музыка по умолчанию выключена — так просил Алекс', () => {
    expect(defaultSettings.musicOn).toBe(false)
    expect(defaultSettings.pageSounds).toBe(false)
  })

  it('громкость не выходит за границы и не ломается от мусора', () => {
    expect(clamp01(1.7)).toBe(1)
    expect(clamp01(-3)).toBe(0)
    expect(clamp01(0.35)).toBe(0.35)
    expect(clamp01(Number.NaN)).toBe(0)
  })

  it('явно выбранная тема не спрашивает устройство', () => {
    expect(resolveTheme('dark')).toBe('dark')
    expect(resolveTheme('light')).toBe('light')
  })

  it('тема «как в системе» слушает устройство', () => {
    vi.stubGlobal('window', {
      matchMedia: (q: string) => ({ matches: q.includes('light') }),
    })
    expect(resolveTheme('system')).toBe('light')

    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: false }),
    })
    expect(resolveTheme('system')).toBe('dark')
  })

  it('устройство без matchMedia не роняет приложение', () => {
    vi.stubGlobal('window', {})
    expect(resolveTheme('system')).toBe('dark')
  })
})
