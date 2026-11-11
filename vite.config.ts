import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import pandacss from '@pandacss/vite'

export default defineConfig(({ mode }) => ({
  // Panda before the framework plugin (docs); Tailwind stays until the migration ends
  plugins: [pandacss(), tailwindcss(), react()],
  // `vite build --mode android` (test APK): readable code and source maps, nothing minified
  build: mode === 'android' ? { minify: false, cssMinify: false, sourcemap: true } : {},
  test: {
    environment: 'node',
    // Brazil's UTC offset exposes local-vs-UTC date bugs that a UTC CI box would hide
    env: { TZ: 'America/Sao_Paulo' },
  },
}))
