import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import MusicPlayer from './MusicPlayer'
import UpdateBanner from './UpdateBanner'
import OfflineBadge from './OfflineBadge'

interface NavItem {
  to: string
  key: string
  icon: ReactNode
}

const icon = (path: ReactNode) => (
  <svg className="nav__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {path}
  </svg>
)

const ITEMS: NavItem[] = [
  {
    to: '/',
    key: 'globe',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.6 2.6 2.6 15 0 18M12 3c-2.6 2.6-2.6 15 0 18" />
      </>,
    ),
  },
  {
    to: '/path',
    key: 'path',
    icon: icon(<path d="M5 20c4 0 3-7 7-7s3-9 7-9" strokeLinecap="round" />),
  },
  {
    to: '/reference',
    key: 'reference',
    icon: icon(
      <>
        <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5z" />
        <path d="M20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z" />
      </>,
    ),
  },
  {
    to: '/review',
    key: 'review',
    icon: icon(
      <>
        <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
        <path d="M20 4v4h-4" strokeLinecap="round" strokeLinejoin="round" />
      </>,
    ),
  },
  {
    to: '/settings',
    key: 'settings',
    icon: icon(
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10 1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4" strokeLinecap="round" />
      </>,
    ),
  },
]

export default function Shell({ children }: { children: ReactNode }) {
  const { t } = useTranslation()

  return (
    <div className="app-shell">
      <nav className="nav" aria-label={t('app.name')}>
        <span className="nav__brand">{t('app.name')}</span>
        {ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className="nav__item">
            {item.icon}
            <span>{t(`nav.${item.key}`)}</span>
          </NavLink>
        ))}
      </nav>

      <MusicPlayer />

      <main className="app-main">
        <OfflineBadge />
        <UpdateBanner />
        {children}
      </main>
    </div>
  )
}
