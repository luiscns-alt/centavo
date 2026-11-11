/**
 * architecture/tailwind-colors — color utilities must use the theme's tokens (DESIGN.md: color
 * only means money). Reads the `--color-*` tokens of `@theme` in src/index.css and checks every
 * class string in `className`, in `cva(...)` definitions and in variables named *Class / *Classes /
 * *Tone / *Color:
 *
 *   text-expense, bg-ink/55, border-border  → ok (theme tokens, opacity modifier allowed)
 *   text-[#B00020], bg-[rgb(…)]             → arbitrary color
 *   bg-red-500, text-black                  → Tailwind palette color outside the theme
 *   text-expnse                             → unknown color (typo)
 *
 * Non-color utilities that share a prefix (text-sm, border-2, border-dashed, outline-none…) pass.
 * It does not check non-color classes against Tailwind (a typo in `px-55` still slips through).
 */
import fs from 'node:fs'
import path from 'node:path'

const SPECIAL = new Set(['transparent', 'current', 'inherit', 'white'])
const PALETTE = /^(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|mauve|olive|mist|taupe)-\d{2,3}$|^black$/
const COLOR_IN_ARBITRARY = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color-mix)\(|^color:|var\(--color-/i
const NUM = /^\d+(\.\d+)?$/

// Non-color values per prefix (sizes, styles, alignment…)
const NONCOLOR = {
  text: /^(xs|sm|base|lg|[2-9]?xl|left|center|right|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip|shadow-.+)$/,
  bg: /^(fixed|local|scroll|clip-.+|origin-.+|no-repeat|repeat(-x|-y|-round|-space)?|auto|cover|contain|center|top|bottom|left|right|(left|right)-(top|bottom)|top-(left|right)|bottom-(left|right)|none|linear-.+|radial(-.+)?|conic(-.+)?|gradient-.+|blend-.+)$/,
  border: /^(solid|dashed|dotted|double|hidden|none|collapse|separate|spacing-.+|[xytblrse])$/,
  outline: /^(none|hidden|solid|dashed|dotted|double|offset-.+)$/,
  ring: /^(inset|offset-\d+)$/,
  divide: /^([xy](-\d+)?(-reverse)?|reverse|solid|dashed|dotted|double|none)$/,
  decoration: /^(solid|double|dotted|dashed|wavy|from-font|auto|clone|slice)$/,
  shadow: /^(2xs|xs|sm|md|lg|xl|2xl|inner|none)$/,
  fill: /^none$/,
  stroke: /^none$/,
  accent: /^auto$/,
  caret: /^$/,
  placeholder: /^$/,
  from: /^\d+%$/, via: /^\d+%$/, to: /^\d+%$/,
}
const PREFIX = /^(text|bg|border(?:-[xytblrse])?|outline|ring(?:-offset)?|divide|decoration|shadow|fill|stroke|accent|caret|placeholder|from|via|to)-(.+)$/
const NAME = /(class|classes|tone|color)$/i

function themeTokens(cssPath) {
  const css = fs.readFileSync(cssPath, 'utf8')
  const theme = /@theme\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''
  return new Set([...theme.matchAll(/--color-([\w-]+)\s*:/g)].map(m => m[1]))
}

/** Problem with one class token, or null */
export function checkClass(token, tokens) {
  const base = token.split(':').pop().replace(/^!/, '').replace(/^-/, '').replace(/!$/, '')
  const m = PREFIX.exec(base)
  if (!m) return null
  const prefix = m[1].replace(/^border-[xytblrse]$/, 'border').replace(/^ring-offset$/, 'ring')
  let value = m[2]
  const arbitrary = /^\[(.+)\]$/.exec(value)
  if (arbitrary) return COLOR_IN_ARBITRARY.test(arbitrary[1]) ? 'arbitrary' : null
  value = value.replace(/\/(\d+|\[[^\]]+\])$/, '') // opacity modifier
  if (tokens.has(value) || SPECIAL.has(value)) return null
  if (NUM.test(value) || NONCOLOR[prefix]?.test(value)) return null
  return PALETTE.test(value) ? 'palette' : 'unknown'
}

export default {
  meta: {
    type: 'problem',
    schema: [{ type: 'object', properties: { css: { type: 'string' } }, additionalProperties: false }],
    messages: {
      arbitrary: "Cor arbitrária '{{cls}}': use um token do tema (src/index.css › @theme).",
      palette: "'{{cls}}' é da paleta do Tailwind, fora do tema do centavo (DESIGN.md: cor só para dinheiro).",
      unknown: "'{{cls}}' não é uma cor do tema. Tokens: {{tokens}}.",
    },
  },
  create(context) {
    const cssPath = path.resolve(context.cwd, context.options[0]?.css ?? 'src/index.css')
    let tokens
    try { tokens = themeTokens(cssPath) } catch { return {} }
    const list = [...tokens].join(', ')

    function checkString(node, text, { trimStart = false, trimEnd = false } = {}) {
      const parts = text.split(/\s+/)
      if (trimStart && !/^\s/.test(text)) parts.shift() // glued to the expression before it
      if (trimEnd && !/\s$/.test(text)) parts.pop()      // glued to the expression after it
      for (const cls of parts) {
        if (!cls) continue
        const problem = checkClass(cls, tokens)
        if (problem) context.report({ node, messageId: problem, data: { cls, tokens: list } })
      }
    }

    function walk(node) {
      if (!node) return
      switch (node.type) {
        case 'Literal': if (typeof node.value === 'string') checkString(node, node.value); break
        case 'TemplateLiteral':
          node.quasis.forEach((q, i) => checkString(q, q.value.cooked ?? '', { trimStart: i > 0, trimEnd: !q.tail }))
          node.expressions.forEach(walk)
          break
        case 'JSXExpressionContainer': walk(node.expression); break
        case 'ConditionalExpression': walk(node.consequent); walk(node.alternate); break
        case 'LogicalExpression': walk(node.left); walk(node.right); break
        case 'ArrayExpression': node.elements.forEach(walk); break
        case 'ObjectExpression': node.properties.forEach(p => p.type === 'Property' && walk(p.value)); break
        case 'CallExpression':
          node.arguments.forEach(walk)
          if (node.callee.type === 'MemberExpression') walk(node.callee.object)
          break
        case 'TSAsExpression': case 'TSSatisfiesExpression': walk(node.expression); break
      }
    }

    return {
      JSXAttribute(node) { if (node.name.name === 'className') walk(node.value) },
      CallExpression(node) { if (node.callee.type === 'Identifier' && node.callee.name === 'cva') node.arguments.forEach(walk) },
      VariableDeclarator(node) { if (node.id.type === 'Identifier' && NAME.test(node.id.name)) walk(node.init) },
    }
  },
}
