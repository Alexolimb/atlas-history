import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

/**
 * Отдельный файл, а не секция в vite.config.ts: у vitest своя вложенная
 * копия vite, и типы плагинов из двух копий не сходятся друг с другом.
 * Тесты — на чистом TypeScript, плагины им не нужны.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(process.cwd(), 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
})
