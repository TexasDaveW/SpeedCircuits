/**
 * Generate lesson circuit JSON from `circuit list` via exportCircuit().
 * Run: npm run generate:circuits
 *
 * Layout rules (validated on plate):
 * - Series (lessons 1–3): single column x=5; resistors/LEDs at 90°/270° for N–S magnets;
 *   power (0°) on top, ground (0°) on bottom with north magnet facing LED.
 * - Parallel split (lesson 4+): trunk on column 5; top T at 90° (N←power, S↓center, E→branch);
 *   each branch gets its own resistor + LED; corners route the east branch; bottom T at 90°
 *   merges branches to ground. Use two red LEDs when branches must match Vf for measurements.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { exportCircuit } from '../src/circuit'
import { catalogById } from '../src/catalog'
import type { PlacedTile, Rotation } from '../src/types'

type Part = { catalogId: string; rotation?: Rotation }

let idCounter = 0
function nextId(prefix: string): string {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function tile(
  catalogId: string,
  gridX: number,
  gridY: number,
  rotation: Rotation = 0,
): PlacedTile {
  return {
    instanceId: nextId(catalogId),
    catalogId,
    gridX,
    gridY,
    rotation,
  }
}

/** Parallel: one resistor+LED on center column, one on east column (user-validated layout). */
function buildParallelTwoBranches(
  centerResistor: string,
  eastResistor: string,
  ledCatalogId: string = 'led-red',
): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('t-connector', 5, 4, 90),
    tile(centerResistor, 5, 5, 90),
    tile(ledCatalogId, 5, 6, 270),
    tile('t-connector', 5, 7, 90),
    tile('ground-tile', 5, 8),
    tile('corner-cube', 6, 4, 180),
    tile(eastResistor, 6, 5, 90),
    tile(ledCatalogId, 6, 6, 270),
    tile('corner-cube', 6, 7, 270),
  ]
}

function place(
  parts: Part[],
  startX: number,
  y: number,
  dx = 1,
  dy = 0,
): PlacedTile[] {
  const tiles: PlacedTile[] = []
  let x = startX
  let cy = y
  for (const part of parts) {
    tiles.push({
      instanceId: nextId(part.catalogId),
      catalogId: part.catalogId,
      gridX: x,
      gridY: cy,
      rotation: part.rotation ?? 0,
    })
    x += dx
    cy += dy
  }
  return tiles
}

function h(parts: Part[], startX: number, y: number): PlacedTile[] {
  return place(parts, startX, y, 1, 0)
}

function v(parts: Part[], x: number, startY: number): PlacedTile[] {
  return place(parts, x, startY, 0, 1)
}

function rail(): Part[] {
  return [{ catalogId: 'power-tile' }, { catalogId: 'straight-cube' }]
}

function tail(): Part[] {
  return [{ catalogId: 'straight-cube' }, { catalogId: 'ground-tile' }]
}

function ledChain(
  resistorId: string,
  ledId: string,
  ledRotation: Rotation = 0,
): Part[] {
  return [
    { catalogId: resistorId },
    { catalogId: ledId, rotation: ledRotation },
  ]
}

const CIRCUITS: Array<{ name: string; build: () => PlacedTile[] }> = [
  {
    name: '01-led-plus-resistor',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 5, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 6, rotation: 0 },
    ],
  },
  {
    name: '02-reverse-led-polarity-test',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 5, rotation: 90 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 6, rotation: 0 },
    ],
  },
  {
    name: '03-two-leds-in-series',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-1k'), catalogId: 'resistor-1k', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 5, rotation: 270 },
      { instanceId: nextId('led-green'), catalogId: 'led-green', gridX: 5, gridY: 6, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 7, rotation: 0 },
    ],
  },
  {
    name: '04-two-leds-in-parallel',
    build: () => buildParallelTwoBranches('resistor-470', 'resistor-470', 'led-red'),
  },
  {
    name: '05-led-brightness-comparison',
    build: () => buildParallelTwoBranches('resistor-150', 'resistor-4k7', 'led-red'),
  },
  {
    name: '06-rgb-led-basic-colors',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('rgb-led'), catalogId: 'rgb-led', gridX: 5, gridY: 5, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 6, rotation: 0 },
    ],
  },
  // Lesson 7: hand-authored — see circuit jsons/07-rgb-led-color-mixing.json (3 pots + RGB). Do not EXPORT_ONLY=6.
  {
    name: '07-rgb-led-color-mixing',
    build: () => {
      throw new Error('Lesson 7 is hand-authored; edit circuit jsons/07-rgb-led-color-mixing.json')
    },
  },
  {
    name: '08-pushbutton-led',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('tact-button'), catalogId: 'tact-button', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 5, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 6, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 7, rotation: 0 },
    ],
  },
  {
    name: '09-slide-switch-led-on-off',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('slide-switch'), catalogId: 'slide-switch', gridX: 5, gridY: 4, rotation: 270 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 6, gridY: 5, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 6, gridY: 6, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 6, gridY: 7, rotation: 0 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 4, rotation: 180 },
    ],
  },
  {
    name: '10-slide-switch-led-selector',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('slide-switch'), catalogId: 'slide-switch', gridX: 5, gridY: 4, rotation: 180 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 4, rotation: 180 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 6, gridY: 5, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 6, gridY: 6, rotation: 270 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 4, gridY: 5, rotation: 90 },
      { instanceId: nextId('led-green'), catalogId: 'led-green', gridX: 4, gridY: 6, rotation: 270 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 7, rotation: 270 },
      { instanceId: nextId('t-connector'), catalogId: 't-connector', gridX: 5, gridY: 7, rotation: 180 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 8, rotation: 0 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 4, gridY: 4, rotation: 90 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 4, gridY: 7, rotation: 0 },
    ],
  },
  {
    name: '11-two-button-series-logic',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('tact-button'), catalogId: 'tact-button', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('tact-button'), catalogId: 'tact-button', gridX: 5, gridY: 5, rotation: 90 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 6, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 7, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 8, rotation: 0 },
    ],
  },
  {
    name: '12-two-button-parallel-logic',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('t-connector'), catalogId: 't-connector', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('tact-button'), catalogId: 'tact-button', gridX: 5, gridY: 5, rotation: 90 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 4, rotation: 180 },
      { instanceId: nextId('tact-button'), catalogId: 'tact-button', gridX: 6, gridY: 5, rotation: 90 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 6, rotation: 270 },
      { instanceId: nextId('t-connector'), catalogId: 't-connector', gridX: 5, gridY: 6, rotation: 90 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 7, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 8, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 9, rotation: 0 },
    ],
  },
  {
    name: '13-morse-code-led',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('tact-button'), catalogId: 'tact-button', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 5, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 6, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 7, rotation: 0 },
    ],
  },
  {
    name: '14-variable-led-brightness',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('potentiometer'), catalogId: 'potentiometer', gridX: 5, gridY: 5, rotation: 270 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 5, rotation: 180 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 6, gridY: 6, rotation: 270 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 6, gridY: 7, rotation: 0 },
    ],
  },
  // Lesson 15: hand-authored — see circuit jsons/15-pot-controlled-rgb-mixer.json (3 pots + straights/corners). Do not EXPORT_ONLY=14.
  {
    name: '15-pot-controlled-rgb-mixer',
    build: () => {
      throw new Error(
        'Lesson 15 is hand-authored; edit circuit jsons/15-pot-controlled-rgb-mixer.json',
      )
    },
  },
  {
    name: '16-pot-controlled-led-threshold',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('cross-cube'), catalogId: 'cross-cube', gridX: 5, gridY: 4, rotation: 0 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 6, gridY: 4, rotation: 0 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 6, gridY: 5, rotation: 270 },
      { instanceId: nextId('npn'), catalogId: 'npn', gridX: 6, gridY: 6, rotation: 90 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 6, gridY: 7, rotation: 0 },
      { instanceId: nextId('resistor-10k'), catalogId: 'resistor-10k', gridX: 4, gridY: 4, rotation: 0 },
      { instanceId: nextId('potentiometer'), catalogId: 'potentiometer', gridX: 4, gridY: 5, rotation: 270 },
      { instanceId: nextId('resistor-10k'), catalogId: 'resistor-10k', gridX: 4, gridY: 6, rotation: 90 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 4, gridY: 7, rotation: 0 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 7, rotation: 0 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 5, gridY: 5, rotation: 180 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 5, gridY: 6, rotation: 0 },
    ],
  },
]

const DISPLAY_NAMES = [
  'LED + Resistor',
  'Reverse LED Polarity Test',
  'Two LEDs in Series',
  'Two LEDs in Parallel',
  'LED Brightness Comparison',
  'RGB LED Basic Colors',
  'RGB LED Color Mixing',
  'Pushbutton LED',
  'Slide-Switch LED On/Off',
  'Slide-Switch LED Selector',
  'Two-Button Series Logic',
  'Two-Button Parallel Logic',
  'Morse Code LED',
  'Variable LED Brightness',
  'Pot-Controlled RGB Mixer',
  'Pot-Controlled LED Threshold',
]

const LESSON_DESCRIPTIONS: string[] = [
  'Your first complete circuit. USB power flows through a 470Ω resistor, then the red LED, to ground. The resistor limits current so the LED does not burn out.',
  'The LED is flipped compared to lesson 1. Current cannot flow the wrong way through an LED, so it stays dark. Swap polarity and it lights again.',
  'Both LEDs share the same current in one path. With a 1kΩ limit resistor, they light dimmer than a single LED — each drops voltage along the chain.',
  'Power splits at the T connector. Each branch has its own 470Ω resistor and red LED, so both see supply voltage and can light independently.',
  'Same supply, two branches: a 150Ω resistor allows more current (brighter LED) and a 4.7kΩ resistor restricts current (dimmer LED). Compare brightness side by side.',
  'A 470Ω resistor feeds the RGB LED. All three color dies share one current path — you see mixed light. This is the simplest way to power a common RGB module.',
  'Three tact buttons each feed an RGB channel through its own 470Ω resistor. Press one or more buttons to turn on red, green, and/or blue and mix colors on the LED.',
  'Press the tact button to close the switch. Current flows USB → button → 470Ω → red LED → ground only while you hold it down. Release the button and the path opens.',
  'Flip the slide switch to connect or disconnect the path. Unlike the pushbutton, the switch stays on or off until you move it again. Current flows USB → switch → 470Ω → red LED → ground when the switch is on.',
  'The SPDT slide switch selects between two paths. Flip it one way for the green LED (west column) and the other for the red LED (east column). Only the selected branch gets power; both share the same ground return.',
  'Two tact buttons are wired in series. The LED lights only when you press both at the same time — an AND gate. Press just one button and the path stays open.',
  'Two tact buttons are wired in parallel. Press either button to light the LED — an OR gate. Both pressed also works. One shared resistor and LED sit below the merge point.',
  'Use one button as a Morse key. A quick tap (dot) and a longer press (dash) blink the LED. Try spelling S: three short, three long, three short. Timing is up to you — the circuit only turns the LED on while the button is held.',
  'Turn the potentiometer to change LED brightness. The 470Ω resistor sets a safe maximum; the pot and corner route the wiper into the red LED. More resistance dims the light, less resistance makes it brighter.',
  'Three potentiometers each feed an RGB channel through its own 470Ω resistor. Turn one or more pots to dim or brighten red, green, and blue and mix colors on the LED — the same layout as RGB color mixing, but with smooth analog control instead of buttons.',
  'A potentiometer and two 10kΩ resistors form a voltage divider on the transistor base. Turn the pot until the base voltage crosses the switching point — the LED snaps between off and on instead of fading smoothly like lesson 14.',
]

function validateCounts(tiles: PlacedTile[]): string[] {
  const counts = new Map<string, number>()
  for (const t of tiles) {
    counts.set(t.catalogId, (counts.get(t.catalogId) ?? 0) + 1)
  }
  const errors: string[] = []
  for (const [catalogId, count] of counts) {
    const entry = catalogById.get(catalogId)
    if (!entry) {
      errors.push(`Unknown catalog id: ${catalogId}`)
      continue
    }
    if (count > entry.quantity) {
      errors.push(`${entry.name}: ${count} > kit ${entry.quantity}`)
    }
  }
  return errors
}

const outDir = join(process.cwd(), 'circuit jsons')
mkdirSync(outDir, { recursive: true })

/** Only export lessons with validated layouts (set to CIRCUITS.length for all). */
const exportThrough = Math.min(
  Number(process.env.EXPORT_THROUGH ?? 4),
  CIRCUITS.length,
)
const exportOnly = process.env.EXPORT_ONLY
const loopStart =
  exportOnly !== undefined && exportOnly !== '' ? Number(exportOnly) : 0
const loopEnd =
  exportOnly !== undefined && exportOnly !== ''
    ? loopStart + 1
    : exportThrough

for (let i = loopStart; i < loopEnd; i++) {
  idCounter = 0
  const { name, build } = CIRCUITS[i]!
  const tiles = build()
  const countErrors = validateCounts(tiles)
  if (countErrors.length > 0) {
    console.error(`${name}:`, countErrors.join('; '))
    process.exit(1)
  }
  const displayName = DISPLAY_NAMES[i]!
  const description = LESSON_DESCRIPTIONS[i]?.trim()
  const doc = exportCircuit(
    tiles,
    displayName,
    description ? { title: displayName, description } : undefined,
  )
  const path = join(outDir, `${name}.json`)
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`Wrote ${path} (${tiles.length} tiles)`)
}
