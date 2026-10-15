import { defineConfig, type Plugin } from 'vitest/config'
import type { HmrContext } from 'vite'
import react from '@vitejs/plugin-react'
import nodePath from 'path'
import fs from 'fs'
import { createRequire } from 'module'

const _require = createRequire(import.meta.url)

// ── Minimal Tailwind v4 Vite plugin (no @tailwindcss/vite needed) ────────────
function tailwindV4(): Plugin {
  const candidates = new Set<string>()
  let cssModuleId = ''

  function scan(code: string) {
    const matches = code.match(/[\w:!\-/]+(?:\[[\w'"%.,\s\-#]+\])?/g) ?? []
    matches.forEach(m => candidates.add(m))
  }

  async function loadSheet(id: string, base: string) {
    let filePath: string
    if (id === 'tailwindcss') {
      filePath = _require.resolve('tailwindcss/index.css', { paths: [base] })
    } else if (id.startsWith('tailwindcss/')) {
      filePath = _require.resolve(id, { paths: [base] })
    } else {
      filePath = nodePath.resolve(base, id)
    }
    return {
      path: filePath,
      base: nodePath.dirname(filePath),
      content: fs.readFileSync(filePath, 'utf-8'),
    }
  }

  return {
    name: 'vite:tailwindcss-v4',
    enforce: 'pre',

    async buildStart() {
      const { glob } = await import('tinyglobby')
      const root = process.cwd()
      const files = await glob(['src/**/*.{tsx,ts,jsx,js,html}', 'index.html'], { cwd: root })
      for (const f of files) {
        try { scan(fs.readFileSync(nodePath.join(root, f), 'utf-8')) } catch { /* unreadable file — skip */ }
      }
    },

    transform(code: string, id: string) {
      if (/\.[jt]sx?$/.test(id) && !id.includes('node_modules')) {
        scan(code)
      }
      return null
    },

    async load(id: string) {
      if (!id.endsWith('index.css') || id.includes('node_modules')) return null
      cssModuleId = id

      const rawCss = fs.readFileSync(id, 'utf-8')
      const { compile } = await import('tailwindcss')
      const compiler = await compile(rawCss, {
        base: nodePath.dirname(id),
        loadStylesheet: loadSheet,
        async loadModule(moduleId: string, base: string) {
          const filePath = nodePath.resolve(base, moduleId)
          return {
            path: filePath,
            base: nodePath.dirname(filePath),
            module: _require(filePath),
          }
        },
      })

      return { code: compiler.build([...candidates]), map: null }
    },

    handleHotUpdate({ file, server }: HmrContext) {
      if (/\.[jt]sx?$/.test(file) && cssModuleId) {
        try { scan(fs.readFileSync(file, 'utf-8')) } catch { /* file deleted mid-update — skip */ }
        const mod = server.moduleGraph.getModuleById(cssModuleId)
        if (mod) {
          server.moduleGraph.invalidateModule(mod)
          server.hot.send({ type: 'full-reload' })
        }
      }
    },
  }
}
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
  plugins: [tailwindV4(), react()],
  test: {
    environment: 'node',
    // Brazil's UTC offset exposes local-vs-UTC date bugs that a UTC CI box would hide
    env: { TZ: 'America/Sao_Paulo' },
  },
})
