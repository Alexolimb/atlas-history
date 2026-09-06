import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE = '/atlas-history/'

/**
 * GitHub Pages не знает про маршруты одностраничного приложения.
 * Копия index.html под именем 404.html заставляет Pages отдавать приложение
 * на любом адресе — тогда «назад» и прямые ссылки работают как в обычном сайте.
 */
function spaFallback() {
  return {
    name: 'atlas-spa-404',
    closeBundle() {
      const dist = resolve(process.cwd(), 'dist')
      const index = resolve(dist, 'index.html')
      if (existsSync(index)) copyFileSync(index, resolve(dist, '404.html'))
    },
  }
}

const pkg = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
  version: string
}

export default defineConfig({
  base: BASE,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: BASE,
        name: 'Atlas — история мира',
        short_name: 'Atlas',
        description:
          'Вся история мира: страны, империи, правители, династии и события от −10000 до наших дней.',
        lang: 'ru',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#0B1120',
        theme_color: '#0B1120',
        categories: ['education', 'reference'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json}'],
        // Справочник в предзагрузку НЕ кладём. Там 30 файлов имён на 30 языков,
        // это около 9 МБ — заставлять телефон качать их все при установке,
        // чтобы человек прочитал один язык, нельзя. Вместо этого они уходят
        // в кэш при первом обращении (правило atlas-core ниже) и после этого
        // работают офлайн.
        globIgnores: ['**/data/core/**', '**/data/borders/**', '**/locales/**'],
        navigateFallback: `${BASE}index.html`,
        // Ядро справочника весит около мегабайта — предел по умолчанию мал.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Ядро справочника: сначала кэш (данные меняются только с новой
            // сборкой), в фоне проверяем обновление.
            urlPattern: ({ url }) => url.pathname.includes('/data/') || url.pathname.includes('/locales/'),
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'atlas-core',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Музыка: в предзагрузку НЕ идёт (10 МБ при установке — грабёж
            // трафика у того, кто музыку даже не включит), но однажды
            // прослушанный трек остаётся в кэше и дальше играет офлайн.
            urlPattern: ({ url }) => url.pathname.includes('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'atlas-audio',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // Шрифты: после первой загрузки живут офлайн навсегда.
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'atlas-fonts',
              expiration: { maxEntries: 24, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Данные справочника из Wikidata/Wikipedia: сначала сеть, но кэш остаётся офлайн.
            urlPattern: /^https:\/\/[a-z-]+\.(wikidata|wikipedia|wikimedia)\.org\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'atlas-wiki',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 2000, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
    spaFallback(),
  ],
  resolve: {
    alias: { '@': resolve(process.cwd(), 'src') },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          i18n: ['i18next', 'react-i18next'],
        },
      },
    },
  },
})
