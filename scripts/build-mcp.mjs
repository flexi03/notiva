// Bundles the MCP server (mcp/main.ts + shared src/lib) into one Node file: dist-mcp/notiva-mcp.mjs.
import { build } from 'esbuild'

await build({
  entryPoints: ['mcp/main.ts'],
  outfile: 'dist-mcp/notiva-mcp.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  logLevel: 'info',
  // Some bundled CommonJS dependencies call require() for Node built-ins.
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module'\nconst require = __createRequire(import.meta.url)",
  },
})
