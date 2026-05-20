import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const distPath = join(process.cwd(), 'dist/assets')
const indexPath = join(process.cwd(), 'dist/index.html')
const indexHtml = readFileSync(indexPath, 'utf8')
const assetMatch = /src="\/assets\/([^"]+\.js)"/.exec(indexHtml)
if (!assetMatch) {
  console.error('Could not find built JS asset in dist/index.html')
  process.exit(1)
}
const js = readFileSync(join(distPath, assetMatch[1]), 'utf8')

const expected = 38
let found = 0
for (let n = 1; n <= expected; n++) {
  const prefix = String(n).padStart(2, '0')
  if (js.includes(`"${prefix}-`) || js.includes(`/${prefix}-`)) found += 1
}

console.log(`Bundled lesson JSONs: ${found}/${expected} numbered lessons in production JS`)
if (found < expected) {
  console.error('Missing lessons in bundle — check Circuit JSONs/ and src/builtinCircuits.ts')
  process.exit(1)
}

if (!js.includes('Dual-Power Source OR Circuit')) {
  console.error('Lesson 38 (Dual-Power Source OR Circuit) not found in bundle')
  process.exit(1)
}

console.log('Lesson 38 present.')
