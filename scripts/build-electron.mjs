// Bundles the Electron main + preload scripts to CommonJS in dist-electron/.
import { build } from 'esbuild'

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  // node-pty is native (prebuilt per platform) – loaded at runtime, unpacked from the asar.
  external: ['electron', '@lydell/node-pty'],
  sourcemap: true,
  logLevel: 'info',
}
await build({ ...common, entryPoints: ['electron/main.ts'], outfile: 'dist-electron/main.cjs' })
await build({ ...common, entryPoints: ['electron/preload.ts'], outfile: 'dist-electron/preload.cjs' })
await build({ ...common, entryPoints: ['electron/moodlePreload.ts'], outfile: 'dist-electron/moodlePreload.cjs' })
