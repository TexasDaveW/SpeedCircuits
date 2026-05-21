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

const expected = 60
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

if (!js.includes('Magnetic Pickup Experiment')) {
  console.error('Lesson 48 (Magnetic Pickup Experiment) not found in bundle')
  process.exit(1)
}

if (!js.includes('Hall Sensor Magnetic Detection')) {
  console.error('Lesson 49 (Hall Sensor Magnetic Detection) not found in bundle')
  process.exit(1)
}

if (!js.includes('Hall Sensor LED Trigger')) {
  console.error('Lesson 50 (Hall Sensor LED Trigger) not found in bundle')
  process.exit(1)
}

if (!js.includes('Hall Sensor Polarity Demo')) {
  console.error('Lesson 52 (Hall Sensor Polarity Demo) not found in bundle')
  process.exit(1)
}

if (!js.includes('LDR Light Sensor')) {
  console.error('Lesson 53 (LDR Light Sensor) not found in bundle')
  process.exit(1)
}

if (!js.includes('Light-Controlled Buzzer')) {
  console.error('Lesson 57 (Light-Controlled Buzzer) not found in bundle')
  process.exit(1)
}

if (!js.includes('Transistor Switch')) {
  console.error('Lesson 58 (Transistor Switch) not found in bundle')
  process.exit(1)
}

if (!js.includes('Transistor Buzzer Driver')) {
  console.error('Lesson 60 (Transistor Buzzer Driver) not found in bundle')
  process.exit(1)
}

console.log('Lessons 48–60 present (51, 54, 56, and 59 TBD).')
