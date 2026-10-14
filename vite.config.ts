/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

/**
 * pdf.js needs its standard fonts (PDFs that don't embed Helvetica & co.) and CMaps (Asian
 * scripts) as plain files: copied to dist/pdfjs/ and served in dev – same origin, so the CSP stays
 * `connect-src 'self'`.
 */
function pdfjsAssets(): Plugin {
  const root = path.resolve('node_modules/pdfjs-dist')
  const dirs = ['standard_fonts', 'cmaps']
  return {
    name: 'notiva-pdfjs-assets',
    configureServer(server) {
      server.middlewares.use('/pdfjs', (req, res, next) => {
        const [dir, file] = decodeURIComponent((req.url ?? '').split('?')[0]!)
          .replace(/^\/+/, '')
          .split('/')
        if (!dir || !file || !dirs.includes(dir) || file.includes('..')) return next()
        try {
          res.end(readFileSync(path.join(root, dir, file)))
        } catch {
          next()
        }
      })
    },
    generateBundle() {
      for (const dir of dirs)
        for (const file of readdirSync(path.join(root, dir)))
          this.emitFile({
            type: 'asset',
            fileName: `pdfjs/${dir}/${file}`,
            source: readFileSync(path.join(root, dir, file)),
          })
    },
  }
}

export default defineConfig({
  // Relative base so the same build works as PWA (any path) and inside Electron (app:// protocol).
  base: './',
  plugins: [react(), tailwindcss(), pdfjsAssets()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { outDir: 'dist', sourcemap: true, chunkSizeWarningLimit: 1600 },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.ts', 'mcp/**/*.test.ts'],
    css: false,
  },
})
