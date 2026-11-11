import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'
import architecture from './eslint-rules/architecture.js'

export default defineConfig([
  globalIgnores(['dist', 'android']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { architecture },
    rules: { 'architecture/boundaries': 'error', 'architecture/tailwind-colors': 'error' },
  },
  {
    // Screens and hooks read with useLiveQuery but never write
    files: ['src/**/*.tsx', 'src/**/use*.ts'],
    plugins: { architecture },
    rules: { 'architecture/no-ui-writes': 'error' },
  },
])
