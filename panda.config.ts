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

/**
 * Panda CSS — migration in progress (branch feat/panda-css). Tailwind v4 and Panda run side by
 * side until every component is migrated:
 *
 * - Colors and fonts point at the CSS variables of src/index.css (@theme + dark mode), so both
 *   systems read one source of truth. At the end of the migration the values move here (with
 *   `_osDark`) and Tailwind goes away.
 * - preflight: off — Tailwind's reset stays active meanwhile.
 * - Layers are prefixed (`panda_*`) so they never merge with Tailwind's `base`/`utilities`.
 * - strictTokens: only theme tokens are accepted — DESIGN.md "color only means money" is a type
 *   rule now. Escape hatch for a one-off value: `'[13px]'` (avoid; add a token instead).
 */
export default defineConfig({
  presets: ['@pandacss/preset-base', neutralPreset],
  preflight: false,
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
  theme: {
    extend: {
      tokens: {
        // DESIGN.md › Type Scale and the sizes the screens use
        fontSizes: Object.fromEntries(
          [10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 22, 28, 34, 36, 40, 44, 48, 52].map(px => [String(px), { value: `${px}px` }]),
        ),
        fonts: {
          sans: { value: 'var(--font-sans)' },
          serif: { value: 'var(--font-serif)' },
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
        easings: {
          out: { value: 'var(--ease-out)' },
          inOut: { value: 'var(--ease-in-out)' },
        },
      },
      semanticTokens: {
        colors: {
          bg: { value: 'var(--color-bg)' },
          surface: { value: 'var(--color-surface)' },
          ink: { value: 'var(--color-ink)' },
          muted: { value: 'var(--color-muted)' },
          border: { value: 'var(--color-border)' },
          income: {
            DEFAULT: { value: 'var(--color-income)' },
            light: { value: 'var(--color-income-light)' },
          },
          expense: {
            DEFAULT: { value: 'var(--color-expense)' },
            light: { value: 'var(--color-expense-light)' },
          },
        },
      },
    },
  },
})
