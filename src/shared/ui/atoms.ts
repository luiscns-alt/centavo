import { css } from '../../../styled-system/css'

/**
 * Small reusable classes that are not components — compose them with `cx(css({...}), nums)`.
 * Animations use the keyframes/animation tokens of panda.config.ts and switch off with
 * prefers-reduced-motion.
 */

/** Tabular, lining figures for every amount (DESIGN.md: numbers align in columns). */
export const nums = css({ fontVariantNumeric: 'tabular-nums lining-nums' })

/** Horizontal scrollers without a visible scrollbar. */
export const noScrollbar = css({ scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } })

/*
 * Bottom edge — `--safe-bottom` (panda.config.ts › globalCss) is the height of the system navigation
 * (Android 3-button or gesture bar, iOS home indicator), 0 in a browser tab. Everything that touches
 * the bottom of the screen adds it, otherwise the last lines or buttons end up under the system bar.
 */

/** Bottom nav clears the system navigation. */
export const pbSafe = css({ pb: '[max(12px, var(--safe-bottom))]' })

/** Screen content: room for the bottom nav (mobile) + the system navigation (Android tablets too). */
export const pbScreen = css({ pb: '[calc(7rem + var(--safe-bottom))]', md: { pb: '[calc(3rem + var(--safe-bottom))]' } })

/** Last block of a screen without the bottom nav (transaction form): 1.25rem above the system bar. */
export const pbFormEnd = css({ pb: '[calc(1.25rem + var(--safe-bottom))]' })

/** Raised + button in the mobile bottom nav. */
export const fabShadow = css({ boxShadow: 'fab' })

/** Budget overflow: the part past the limit is striped (never color alone). */
export const barHatch = css({
  bg: 'expense',
  backgroundImage: '[repeating-linear-gradient(45deg, transparent 0 3px, rgb(255 255 255 / .45) 3px 5px)]',
  _osDark: { backgroundImage: '[repeating-linear-gradient(45deg, transparent 0 3px, rgb(0 0 0 / .35) 3px 5px)]' },
})

/** Content enter: card slides up. */
export const slideUp = css({ animation: 'slideUp', _motionReduce: { animation: 'none' } })

/** Category share bars grow in from the left. */
export const barGrow = css({ transformOrigin: 'left', animation: 'barGrow', _motionReduce: { animation: 'none' } })

/** Toast enters from below. */
export const toastIn = css({ animation: 'toastIn', _motionReduce: { animation: 'none' } })

/** Month switch: subtle horizontal slide in the direction of travel. */
export const monthIn = {
  next: css({ animation: 'monthInNext', _motionReduce: { animation: 'none' } }),
  prev: css({ animation: 'monthInPrev', _motionReduce: { animation: 'none' } }),
}
