import esbuild from 'esbuild'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const bundlePath = join(root, 'scripts', '.gen-bundle.mjs')

mkdirSync(dirname(bundlePath), { recursive: true })

await esbuild.build({
  entryPoints: [join(root, 'scripts/generate-first-circuits.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundlePath,
  packages: 'bundle',
})

await import(bundlePath)
