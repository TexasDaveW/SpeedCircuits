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

const expected = 70
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

if (!js.includes('Transistor Motor Driver')) {
  console.error('Lesson 61 (Transistor Motor Driver) not found in bundle')
  process.exit(1)
}

if (!js.includes('Transistor Signal Amplifier')) {
  console.error('Lesson 63 (Transistor Signal Amplifier) not found in bundle')
  process.exit(1)
}

if (!js.includes('Darlington Pair Experiment')) {
  console.error('Lesson 64 (Darlington Pair Experiment) not found in bundle')
  process.exit(1)
}

if (!js.includes('Thermistor Temperature Sensor')) {
  console.error('Lesson 65 (Thermistor Temperature Sensor) not found in bundle')
  process.exit(1)
}

if (!js.includes('Temperature Alarm Circuit')) {
  console.error('Lesson 67 (Temperature Alarm Circuit) not found in bundle')
  process.exit(1)
}

if (!js.includes('Microphone Sound Detector')) {
  console.error('Lesson 68 (Microphone Sound Detector) not found in bundle')
  process.exit(1)
}

if (!js.includes('Clap Detector')) {
  console.error('Lesson 69 (Clap Detector) not found in bundle')
  process.exit(1)
}

if (!js.includes('Sound-Activated LED')) {
  console.error('Lesson 70 (Sound-Activated LED) not found in bundle')
  process.exit(1)
}

console.log('Lessons 48–70 present (51, 54, 56, 59, 62, and 66 TBD).')
