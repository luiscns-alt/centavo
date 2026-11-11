/**
 * Local lint rules for centavo's feature-based layout (see CLAUDE.md › Architecture).
 *
 *   app/      shell: navigation, overlays — may import anything, features only via their index
 *   core/     db schema, money, write-path base — never imports app/ or features/ (types allowed)
 *   shared/   generic UI and charts — never imports app/ or features/
 *   features/<name>/  a business domain — other features only via `features/<name>` (index.ts),
 *                     never app/
 *
 * no-ui-writes: screens and hooks never write to IndexedDB directly; money moves through the
 * ledger modules (features/<name>/ledger.ts, core/ledger/base.ts).
 */
import path from 'node:path'

function layerOf(abs) {
  const m = /[\\/]src[\\/](.*)$/.exec(abs)
  if (!m) return null
  const rel = m[1].split(path.sep).join('/')
  const f = /^features\/([^/]+)(\/(.*))?$/.exec(rel)
  if (f) return { kind: 'features', feature: f[1], inside: f[3] ?? '', rel }
  const top = rel.split('/')[0]
  return { kind: ['app', 'core', 'shared'].includes(top) ? top : 'root', rel }
}

const boundaries = {
  meta: { type: 'problem', schema: [], messages: {
    deep: "Importe '{{feature}}' pelo index (features/{{feature}}), não por '{{file}}'.",
    up: "'{{from}}/' não pode importar de '{{to}}/'.",
  } },
  create(context) {
    const filename = context.filename
    const me = layerOf(filename)
    if (!me) return {}
    function check(node, source, typeOnly) {
      if (typeof source !== 'string' || !source.startsWith('.')) return
      const target = layerOf(path.resolve(path.dirname(filename), source))
      if (!target) return
      if (target.kind === 'features' && !(me.kind === 'features' && me.feature === target.feature)) {
        if (target.inside !== '' && target.inside !== 'index') {
          context.report({ node, messageId: 'deep', data: { feature: target.feature, file: target.rel } })
        }
      }
      const forbidden = {
        core: ['app', 'features'], shared: ['app', 'features', 'core-ledger'], features: ['app'],
      }[me.kind] ?? []
      if (forbidden.includes(target.kind) && !(typeOnly && me.kind === 'core')) {
        context.report({ node, messageId: 'up', data: { from: me.kind, to: target.kind } })
      }
    }
    return {
      ImportDeclaration(n) { check(n, n.source.value, n.importKind === 'type') },
      ExportNamedDeclaration(n) { if (n.source) check(n, n.source.value, n.exportKind === 'type') },
      ExportAllDeclaration(n) { check(n, n.source.value, n.exportKind === 'type') },
      ImportExpression(n) { if (n.source.type === 'Literal') check(n, n.source.value, false) },
    }
  },
}

const WRITES = new Set(['add', 'bulkAdd', 'put', 'bulkPut', 'update', 'bulkUpdate', 'delete', 'bulkDelete', 'clear', 'modify'])
const noUiWrites = {
  meta: { type: 'problem', schema: [], messages: {
    write: 'Telas e hooks não gravam no banco: use as funções do ledger da funcionalidade.',
  } },
  create(context) {
    return {
      CallExpression(n) {
        const callee = n.callee
        if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || !WRITES.has(callee.property.name)) return
        let o = callee.object
        while (o && (o.type === 'MemberExpression' || o.type === 'CallExpression')) o = o.type === 'MemberExpression' ? o.object : o.callee
        if (o && o.type === 'Identifier' && o.name === 'db') context.report({ node: n, messageId: 'write' })
      },
    }
  },
}

export default { rules: { boundaries, 'no-ui-writes': noUiWrites } }
