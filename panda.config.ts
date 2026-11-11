import { defineConfig, definePreset } from '@pandacss/dev'
import pandaPreset from '@pandacss/preset-panda'

/**
 * Panda's default scales (spacing, sizes, radii, type…) WITHOUT its color palette: DESIGN.md allows
 * color only for money, so `red.500` & co. must not even exist as tokens.
 */
const { colors: palette, ...scales } = pandaPreset.theme.tokens
const neutralPreset = definePreset({
  ...pandaPreset,
  name: 'centavo-scales',
  theme: {
    ...pandaPreset.theme,
    tokens: {
      ...scales,
      colors: { white: palette.white, transparent: palette.transparent, current: palette.current },
    },
  },
})

const EASE_OUT = 'cubic-bezier(.2, .8, .2, 1)'
const EASE_IN_OUT = 'cubic-bezier(.4, 0, .2, 1)'

/** A light/dark pair — `_osDark` follows the system theme (DESIGN.md: no manual toggle). */
const scheme = (light: string, dark: string) => ({ value: { base: light, _osDark: dark } })

/**
 * Panda CSS is the only styling system (see DESIGN.md for the visual rules).
 *
 * - All design tokens live here: colors (light + dark), fonts, type scale, motion.
 * - strictTokens: only theme tokens are accepted — DESIGN.md "color only means money" is a type
 *   rule. Escape hatch for a one-off value: `'[13px]'` (avoid; add a token instead).
 * - Layers are prefixed (`panda_*`); src/index.css only declares their order, the Vite plugin
 *   injects the generated CSS there.
 * - Reusable non-component classes (tabular numbers, enter animations, safe-area padding…) are
 *   in src/shared/ui/atoms.ts.
 */
export default defineConfig({
  presets: ['@pandacss/preset-base', neutralPreset],
  preflight: true,
  include: ['./src/**/*.{ts,tsx}'],
  exclude: ['./src/**/*.test.ts'],
  outdir: 'styled-system',
  jsxFramework: 'react',
  strictTokens: true,
  layers: {
    reset: 'panda_reset',
    base: 'panda_base',
    tokens: 'panda_tokens',
    recipes: 'panda_recipes',
    utilities: 'panda_utilities',
  },
  globalCss: {
    html: {
      fontFamily: 'sans',
      bg: 'bg',
      color: 'ink',
      WebkitFontSmoothing: 'antialiased',
      MozOsxFontSmoothing: 'grayscale',
      WebkitTapHighlightColor: 'transparent',
      _osDark: { colorScheme: 'dark' },
    },
    // Edge-to-edge (Android app, installed PWA): keep content clear of the status bar and notches.
    // 0 in a normal browser tab. The bottom inset is handled by the bottom nav (atoms.pbSafe).
    body: {
      margin: '0',
      padding: '[env(safe-area-inset-top) env(safe-area-inset-right) 0 env(safe-area-inset-left)]',
    },
    '#root': { minHeight: '100svh', display: 'flex', flexDirection: 'column', bg: 'bg' },
    '::selection': { bg: 'border', color: 'ink' },
    // Keyboard focus: a quiet ink ring instead of the browser's default outline
    ':focus': { outline: 'none' },
    ':focus-visible': { outlineWidth: '[2px]', outlineStyle: 'solid', outlineColor: 'ink', outlineOffset: '[2px]', borderRadius: '[8px]' },
    'input:focus-visible': { outline: 'none' },
    // Native date picker icon follows the text color
    'input[type="date"]::-webkit-calendar-picker-indicator': { opacity: '0.5', cursor: 'pointer', _osDark: { filter: '[invert(1)]' } },
    // Date input normalization (Panda's reset leaves the WebKit date fields taller than a text input)
    '::-webkit-date-and-time-value': { minHeight: '[1lh]', textAlign: 'inherit' },
    '::-webkit-datetime-edit': { display: 'inline-flex' },
    '::-webkit-datetime-edit-fields-wrapper': { padding: '0' },
    '::-webkit-datetime-edit, ::-webkit-datetime-edit-year-field, ::-webkit-datetime-edit-month-field, ::-webkit-datetime-edit-day-field, ::-webkit-datetime-edit-hour-field, ::-webkit-datetime-edit-minute-field, ::-webkit-datetime-edit-second-field, ::-webkit-datetime-edit-millisecond-field, ::-webkit-datetime-edit-meridiem-field': { paddingBlock: '0' },
    '@media (prefers-reduced-motion: reduce)': { '*': { transitionDuration: '[0ms !important]' } },
  },
  theme: {
    extend: {
      keyframes: {
        monthInNext: { from: { opacity: '0', transform: 'translateX(12px)' } },
        monthInPrev: { from: { opacity: '0', transform: 'translateX(-12px)' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(8px)' } },
        barGrow: { from: { transform: 'scaleX(0)' } },
        toastIn: { from: { opacity: '0', transform: 'translateY(12px)' } },
      },
      tokens: {
        // DESIGN.md › Type Scale and the sizes the screens use
        fontSizes: Object.fromEntries(
          [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 28, 34, 36, 40, 44, 48, 52].map(px => [String(px), { value: `${px}px` }]),
        ),
        fonts: {
          sans: { value: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif" },
          serif: { value: "'Instrument Serif', Georgia, serif" },
        },
        radii: {
          tile: { value: '10px' }, // icon tiles, inputs
        },
        sizes: {
          hairline: { value: '1px' }, // dividers drawn as boxes
        },
        letterSpacings: {
          title: { value: '-0.01em' }, // screen titles
        },
        // DESIGN.md › Motion
        easings: {
          out: { value: EASE_OUT },
          inOut: { value: EASE_IN_OUT },
        },
        animations: {
          none: { value: 'none' }, // prefers-reduced-motion
          monthInNext: { value: `monthInNext 150ms ${EASE_IN_OUT}` }, // month switch
          monthInPrev: { value: `monthInPrev 150ms ${EASE_IN_OUT}` },
          slideUp: { value: `slideUp 200ms ${EASE_OUT} both` }, // content enter
          barGrow: { value: `barGrow 350ms ${EASE_OUT} both` }, // share bars grow in
          toastIn: { value: `toastIn 200ms ${EASE_OUT} both` },
        },
      },
      semanticTokens: {
        // DESIGN.md: dark mode inverts surfaces; income/expense ~15% less saturated and lifted
        colors: {
          bg: scheme('#F7F5F1', '#1A1816'),
          surface: scheme('#FFFFFF', '#23201E'),
          ink: scheme('#1A1816', '#F7F5F1'),
          muted: scheme('#6B6560', '#9B948F'),
          border: scheme('#E8E4DF', '#3A3532'),
          income: {
            DEFAULT: scheme('#2D6A4F', '#7DB497'),
            light: scheme('#EBF5F0', '#22302A'),
          },
          expense: {
            DEFAULT: scheme('#9B2335', '#D38591'),
            light: scheme('#F9EEF0', '#36252A'),
          },
        },
        shadows: {
          fab: scheme('0 6px 16px -6px rgb(26 24 22 / .5)', '0 6px 16px -6px rgb(0 0 0 / .6)'), // raised + button
        },
      },
    },
  },
})
