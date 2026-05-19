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
 * - Parallel merge row: bottom T must share gridY with the east branch’s bottom corner (not the row
 *   below the center-only part). If the east branch is taller (e.g. corner→R→LED→corner), pad the
 *   center column with a straight-cube between the center part and the bottom T (see lesson 20).
 * - Vertical LEDs in N–S chains: rotation 90° (anode north, cathode south), not 270°.
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

/**
 * Cap + LED in parallel after trunk R; tact on trunk for charge/discharge.
 * splitY: top T row. East: corner→R→LED(90°)→corner (3 rows). Center: cap→straight→merge T.
 */
function buildParallelCapLedEastBranch(splitY: number, trunkBeforeSplit: Part[] = []): PlacedTile[] {
  const mergeY = splitY + 3
  const tiles: PlacedTile[] = [tile('power-tile', 5, 3)]
  let y = 4
  for (const part of trunkBeforeSplit) {
    tiles.push(tile(part.catalogId, 5, y, part.rotation ?? 90))
    y += 1
  }
  tiles.push(
    tile('t-connector', 5, splitY, 90),
    tile('cap-1000u', 5, splitY + 1, 90),
    tile('straight-cube', 5, splitY + 2, 90),
    tile('t-connector', 5, mergeY, 90),
    tile('ground-tile', 5, mergeY + 1),
    tile('corner-cube', 6, splitY, 180),
    tile('resistor-470', 6, splitY + 1, 90),
    tile('led-red', 6, splitY + 2, 90),
    tile('corner-cube', 6, mergeY, 270),
  )
  return tiles
}

/** Lesson 20 layout — hand-authored reference in circuit jsons/20-capacitor-discharge-demo.json */
function buildCapacitorDischargeDemo(): PlacedTile[] {
  return buildParallelCapLedEastBranch(6, [{ catalogId: 'tact-button' }, { catalogId: 'resistor-470' }])
}

/**
 * Cap ∥ LED: one trunk R, then split. East branch is LED only (no east R) — cap discharges
 * directly through the LED for fade-off. Shorter east branch → merge at splitY+2 (no straight).
 * Differs from lesson 20 (tact + 470 on trunk AND east).
 */
function buildParallelCapLedDirect(
  splitY: number,
  trunkBeforeSplit: Part[] = [],
  trunkResistor = 'resistor-1k',
): PlacedTile[] {
  const mergeY = splitY + 2
  const tiles: PlacedTile[] = [tile('power-tile', 5, 3)]
  let y = 4
  for (const part of trunkBeforeSplit) {
    tiles.push(tile(part.catalogId, 5, y, part.rotation ?? 90))
    y += 1
  }
  tiles.push(
    tile(trunkResistor, 5, y, 90),
    tile('t-connector', 5, splitY, 90),
    tile('cap-1000u', 5, splitY + 1, 90),
    tile('t-connector', 5, mergeY, 90),
    tile('ground-tile', 5, mergeY + 1),
    tile('corner-cube', 6, splitY, 180),
    tile('led-red', 6, splitY + 1, 90),
    tile('corner-cube', 6, mergeY, 270),
  )
  return tiles
}

/** Lesson 21: slide switch + cap∥LED (one 1k trunk R, LED-only east branch). */
function buildLedFadeOffCircuit(): PlacedTile[] {
  return buildParallelCapLedDirect(6, [{ catalogId: 'slide-switch', rotation: 90 }])
}

/** Three parallel branches (150Ω → 1kΩ), left to right = bright → dim LED bar. */
function buildLedBarBrightnessComparison(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('cross-cube', 5, 4),
    tile('corner-cube', 4, 4, 90),
    tile('resistor-150', 4, 5, 90),
    tile('led-red', 4, 6, 270),
    tile('straight-cube', 4, 7, 90),
    tile('ground-tile', 4, 8),
    tile('resistor-470', 5, 5, 90),
    tile('led-green', 5, 6, 270),
    tile('corner-cube', 6, 4, 180),
    tile('resistor-1k', 6, 5, 90),
    tile('led-blue', 6, 6, 270),
    tile('corner-cube', 6, 7, 270),
    tile('t-connector', 5, 7, 90),
    tile('ground-tile', 5, 8),
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
  // Lesson 16: hand-authored — see circuit jsons/16-pot-controlled-led-threshold.json. Do not EXPORT_ONLY=15.
  {
    name: '16-pot-controlled-led-threshold',
    build: () => {
      throw new Error(
        'Lesson 16 is hand-authored; edit circuit jsons/16-pot-controlled-led-threshold.json',
      )
    },
  },
  {
    name: '17-adjustable-voltage-divider',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-10k'), catalogId: 'resistor-10k', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('potentiometer'), catalogId: 'potentiometer', gridX: 5, gridY: 5, rotation: 270 },
      { instanceId: nextId('resistor-10k'), catalogId: 'resistor-10k', gridX: 5, gridY: 6, rotation: 90 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 7, rotation: 0 },
      { instanceId: nextId('corner-cube'), catalogId: 'corner-cube', gridX: 6, gridY: 5, rotation: 180 },
    ],
  },
  // Lesson 18: hand-authored — see circuit jsons/18-led-bar-brightness-comparison.json. Do not EXPORT_ONLY=17.
  {
    name: '18-led-bar-brightness-comparison',
    build: () => {
      throw new Error(
        'Lesson 18 is hand-authored; edit circuit jsons/18-led-bar-brightness-comparison.json',
      )
    },
  },
  {
    name: '19-capacitor-charge-demo',
    build: () => [
      { instanceId: nextId('power-tile'), catalogId: 'power-tile', gridX: 5, gridY: 3, rotation: 0 },
      { instanceId: nextId('resistor-470'), catalogId: 'resistor-470', gridX: 5, gridY: 4, rotation: 90 },
      { instanceId: nextId('led-red'), catalogId: 'led-red', gridX: 5, gridY: 5, rotation: 90 },
      { instanceId: nextId('cap-1000u'), catalogId: 'cap-1000u', gridX: 5, gridY: 6, rotation: 90 },
      { instanceId: nextId('ground-tile'), catalogId: 'ground-tile', gridX: 5, gridY: 7, rotation: 0 },
    ],
  },
  // Lesson 20: hand-authored — see circuit jsons/20-capacitor-discharge-demo.json. Do not EXPORT_ONLY=19.
  {
    name: '20-capacitor-discharge-demo',
    build: () => {
      throw new Error(
        'Lesson 20 is hand-authored; edit circuit jsons/20-capacitor-discharge-demo.json',
      )
    },
  },
  {
    name: '21-led-fade-off-circuit',
    build: () => buildLedFadeOffCircuit(),
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
  'Adjustable Voltage Divider',
  'LED Bar Brightness Comparison',
  'Capacitor Charge Demo',
  'Capacitor Discharge Demo',
  'LED Fade-Off Circuit',
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
  'USB and ground bracket a pot between two 10kΩ resistors. Turning the knob moves the wiper tap from near 0 V to near 5 V. The east corner marks the adjustable output — this same divider idea feeds the base in lesson 16.',
  'Three LEDs in a row share USB power; each branch has its own resistor (150Ω, 470Ω, 1kΩ). All light at once — red is brightest on the left, green is medium, blue is dimmest on the right. Compare the steps like a brightness bar (not a pot that turns them on one by one).',
  'USB → 470Ω → red LED → 1000µF capacitor → ground. When power is first applied, the empty cap draws charging current and the LED flashes bright, then fades over about 1–2 seconds as the cap fills (τ ≈ R×C ≈ 0.5 s). Once charged, DC current stops and the LED goes out — unlike a resistor, a capacitor stores energy instead of passing steady current forever. Orient the LED so conventional current flows anode (north) to cathode (south).',
  'Hold the tact button to charge the 1000µF capacitor through the center 470Ω resistor. The cap and the east branch (470Ω + red LED) are in parallel. Release the button — USB disconnects, but the charged cap powers the LED through the east branch and it fades out over about 1–2 seconds as the cap empties. Orient the LED at 90° (anode north, cathode south). Put the cap + toward the power side.',
  'USB → slide switch → 1kΩ → split: 1000µF cap (center) and red LED (east) in parallel — no second resistor on the LED branch. Flip the switch on to charge both; flip off and watch the LED fade out over several seconds as the cap empties through the LED. Lesson 20 used a tact button and a 470Ω on the LED branch; here the LED sits directly across the cap for a smoother fade-off.',
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
