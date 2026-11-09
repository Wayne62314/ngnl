import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin } from 'vite'

/** Writes the built file list and a content hash into dist/sw.js for offline precaching. */
function swManifest(): Plugin {
  let files: string[] = []
  return {
    name: 'ngnl-sw-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      files = Object.keys(bundle).filter((f) => f.startsWith('assets/'))
    },
    writeBundle(opts) {
      const sw = join(opts.dir!, 'sw.js')
      const version = createHash('sha256').update(files.sort().join()).digest('hex').slice(0, 10)
      const src = readFileSync(sw, 'utf8').replace("const BUILD = { version: 'dev', files: [] }", `const BUILD = ${JSON.stringify({ version, files })}`)
      writeFileSync(sw, src)
    },
  }
}

export default defineConfig({
  // Relative paths so the static build works from any folder or sub-path (e.g. GitHub Pages).
  base: './',
  plugins: [vue(), swManifest()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  test: { environment: 'node' },
})
