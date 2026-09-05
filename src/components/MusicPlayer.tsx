import { useEffect, useRef, useState } from 'react'
import { useSettings } from '@/store/settings'
import { AmbientBed, loadTracks, type Track } from '@/lib/audio'

/**
 * Фоновая музыка. Ничего не рисует — просто следит за настройкой и играет.
 *
 * Если в `public/audio/` лежат треки — играют они, по кругу и вперемешку.
 * Если нет — играет фон, собранный в браузере. В обоих случаях музыка
 * включается ТОЛЬКО когда человек сам нажал переключатель.
 */
export default function MusicPlayer() {
  const musicOn = useSettings((s) => s.musicOn)
  const volume = useSettings((s) => s.musicVolume)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const bedRef = useRef<AmbientBed | null>(null)
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [index, setIndex] = useState(0)

  useEffect(() => {
    let alive = true
    void loadTracks().then((list) => alive && setTracks(list))
    return () => {
      alive = false
    }
  }, [])

  /* Включение и выключение. */
  useEffect(() => {
    if (tracks === null) return

    if (!musicOn) {
      audioRef.current?.pause()
      void bedRef.current?.stop()
      bedRef.current = null
      return
    }

    if (tracks.length > 0) {
      audioRef.current?.play().catch(() => {
        /* браузер не дал — человек нажмёт ещё раз */
      })
      return
    }

    bedRef.current ??= new AmbientBed()
    void bedRef.current.start(volume)
  }, [musicOn, tracks, volume, index])

  /* Громкость на лету. */
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
    bedRef.current?.setVolume(volume)
  }, [volume])

  /* Уходим со страницы — глушим, чтобы не играло в закрытой вкладке. */
  useEffect(() => {
    return () => {
      void bedRef.current?.stop()
    }
  }, [])

  if (tracks === null || tracks.length === 0) return null

  const track = tracks[index % tracks.length]
  return (
    <audio
      ref={audioRef}
      src={`${import.meta.env.BASE_URL}audio/${track.file}`}
      onEnded={() => setIndex((i) => (i + 1) % tracks.length)}
      preload="none"
      aria-hidden="true"
    />
  )
}
