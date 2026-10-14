// Bundles the Electron main + preload scripts to CommonJS in dist-electron/.
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  sourcemap: true,
  logLevel: 'info',
}
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' })
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' })
