import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import PageHead from '@/components/PageHead'
import { LANGUAGES, type LangCode } from '@/i18n/languages'
import { useSettings, type Theme, type TextSize } from '@/store/settings'
import { useProgress, exportProgress, importProgress } from '@/store/progress'

export default function SettingsScreen() {
  const { t } = useTranslation()
  const s = useSettings()

  return (
    <div className="container">
      <PageHead ns="settings" />

      <Section title={t('settings.language.title')} sub={t('settings.language.sub')}>
        <select
          className="input"
          value={s.language}
          onChange={(e) => s.setLanguage(e.target.value as LangCode)}
          aria-label={t('settings.language.title')}
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.name}
              {l.uiReady ? '' : ` — ${t('settings.language.uiFallback')}`}
            </option>
          ))}
        </select>
      </Section>

      <Section title={t('settings.theme.title')}>
        <Choice<Theme>
          value={s.theme}
          onChange={s.setTheme}
          options={[
            { value: 'dark', label: t('settings.theme.dark') },
            { value: 'light', label: t('settings.theme.light') },
            { value: 'system', label: t('settings.theme.system') },
          ]}
        />
      </Section>

      <Section title={t('settings.text.title')}>
        <Choice<TextSize>
          value={s.textSize}
          onChange={s.setTextSize}
          options={[
            { value: 'small', label: t('settings.text.small') },
            { value: 'normal', label: t('settings.text.normal') },
            { value: 'large', label: t('settings.text.large') },
          ]}
        />
      </Section>

      <Section title={t('settings.motion.title')} sub={t('settings.motion.sub')}>
        <Toggle
          checked={s.reducedMotion}
          onChange={s.setReducedMotion}
          label={t('settings.motion.title')}
        />
      </Section>

      <Section title={t('settings.globe3d.title')} sub={t('settings.globe3d.sub')}>
        <Toggle checked={s.globe3d} onChange={s.setGlobe3d} label={t('settings.globe3d.title')} />
      </Section>

      <Section title={t('settings.music.title')} sub={t('settings.music.sub')}>
        <Toggle
          checked={s.musicOn}
          onChange={s.setMusicOn}
          label={t('settings.music.title')}
        />
        <label className="slider">
          <span>{t('settings.music.volume')}</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(s.musicVolume * 100)}
            onChange={(e) => s.setMusicVolume(Number(e.target.value) / 100)}
          />
        </label>
      </Section>

      <Section title={t('settings.sound.title')} sub={t('settings.sound.sub')}>
        <Toggle
          checked={s.pageSounds}
          onChange={s.setPageSounds}
          label={t('settings.sound.title')}
        />
      </Section>

      <ProgressSection />

      <Section title={t('settings.about.title')}>
        <p>
          <Link to="/sources">{t('settings.about.sources')}</Link>
        </p>
        <p className="note">
          {t('settings.about.version')}: {__APP_VERSION__}
        </p>
      </Section>
    </div>
  )
}

/* ------------------------------ Прогресс ------------------------------ */

function ProgressSection() {
  const { t } = useTranslation()
  const [msg, setMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const progress = useProgress()

  const save = () => {
    const file = exportProgress({
      xp: progress.xp,
      chaptersDone: progress.chaptersDone,
      entitiesSeen: progress.entitiesSeen,
      bookmarks: progress.bookmarks,
      daysActive: progress.daysActive,
      cards: progress.cards,
      createdAt: progress.createdAt,
    })
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `atlas-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const load = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const data = importProgress(parsed)
      if (!data) {
        setMsg(t('settings.progress.loadFailed'))
        return
      }
      progress.replaceAll(data)
      setMsg(t('settings.progress.loaded'))
    } catch {
      setMsg(t('settings.progress.loadFailed'))
    }
  }

  return (
    <Section title={t('settings.progress.title')} sub={t('settings.progress.sub')}>
      <div className="btn-row">
        <button type="button" className="btn btn--gold" onClick={save}>
          {t('settings.progress.save')}
        </button>
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          {t('settings.progress.load')}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          onClick={() => {
            if (window.confirm(t('settings.progress.resetConfirm'))) progress.reset()
          }}
        >
          {t('settings.progress.reset')}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="visually-hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void load(f)
          e.target.value = ''
        }}
      />
      {msg && (
        <p className="note" role="status">
          {msg}
        </p>
      )}
    </Section>
  )
}

/* ------------------------------ Кирпичики ------------------------------ */

function Section({
  title,
  sub,
  soon,
  children,
}: {
  title: string
  sub?: string
  soon?: string
  children: React.ReactNode
}) {
  return (
    <section className="card setting">
      <div className="setting__head">
        <h2 className="setting__title">{title}</h2>
        {soon && <span className="stub__badge">{soon}</span>}
      </div>
      {sub && <p className="setting__sub">{sub}</p>}
      <div className="setting__body">{children}</div>
    </section>
  )
}

function Choice<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div className="segmented" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="segmented__btn"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}) {
  return (
    <label className="toggle">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={label}
      />
      <span className="toggle__track" aria-hidden="true">
        <span className="toggle__thumb" />
      </span>
    </label>
  )
}
