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

/** Bottom nav clears the iOS home indicator / Android gesture bar. */
export const pbSafe = css({ pb: '[max(12px, env(safe-area-inset-bottom))]' })

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
