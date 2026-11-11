/**
 * architecture/raw-colors — colors come only from the theme (panda.config.ts; DESIGN.md: color only
 * means money). Panda's strictTokens already rejects `color: 'red.500'` or `color: '#B00020'`; this
 * rule closes the remaining gaps — escape hatches (`'[#B00020]'`), inline `style` values and
 * gradients — by flagging any string with a literal color:
 *
 *   '#B00020', 'rgb(155 35 53)', 'hsl(…)', 'oklch(…)'   → raw color
 *   'var(--color-expense)'                              → old Tailwind variable (gone; use var(--colors-expense))
 *
 * Neutral overlays used for texture are allowed: rgb(0 0 0 / a), rgb(255 255 255 / a).
 */
const HEX = /#[0-9a-f]{3,8}\b/i
const FN = /\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(([^)]*)\)/gi
const NEUTRAL = /^\s*(0[\s,]+0[\s,]+0|255[\s,]+255[\s,]+255)\s*([/,]\s*[\d.]+%?\s*)?$/
const OLD_VAR = /var\(--color-/

function check(context, node, text) {
  if (OLD_VAR.test(text)) return context.report({ node, messageId: 'oldVar' })
  if (HEX.test(text)) return context.report({ node, messageId: 'raw' })
  for (const m of text.matchAll(FN)) if (!/^rgba?$/i.test(m[1]) || !NEUTRAL.test(m[2])) return context.report({ node, messageId: 'raw' })
}

export default {
  meta: { type: 'problem', schema: [], messages: {
    raw: 'Cor literal fora do tema: use um token do panda.config.ts (DESIGN.md: cor só para dinheiro).',
    oldVar: 'Variável --color-* não existe mais: use o token (ou var(--colors-*)).',
  } },
  create(context) {
    return {
      Literal(n) { if (typeof n.value === 'string') check(context, n, n.value) },
      TemplateElement(n) { check(context, n, n.value.raw) },
    }
  },
}
