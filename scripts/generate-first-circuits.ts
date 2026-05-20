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
 * - Pot in trunk (lesson 24): pot 270° on col 5; corner bridges pot east → RC column (col 6:
 *   T→cap→merge→GND); LED branch one column further east (col 7). Do not stack pot 90° in col 5.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildConnections, exportCircuit } from '../src/circuit'
import { catalogById } from '../src/catalog'
import { sidesAtRotation } from '../src/geometry'
import type { PlacedTile, Rotation, Side } from '../src/types'

function portKey(instanceId: string, side: Side): string {
  return `${instanceId}:${side}`
}

/** Every tile port must mate with a neighbor or net — no dangling magnets. */
function validatePortConnectivity(tiles: PlacedTile[]): string[] {
  const connections = buildConnections(tiles)
  const linked = new Set<string>()
  for (const c of connections) {
    if (!('net' in c.a)) linked.add(portKey(c.a.instanceId, c.a.side))
    else linked.add(`net:${c.a.net}`)
    if (!('net' in c.b)) linked.add(portKey(c.b.instanceId, c.b.side))
    else linked.add(`net:${c.b.net}`)
  }
  const errors: string[] = []
  for (const tile of tiles) {
    const entry = catalogById.get(tile.catalogId)
    if (!entry) continue
    for (const side of sidesAtRotation(entry.ports, tile.rotation)) {
      const key = portKey(tile.instanceId, side)
      if (!linked.has(key)) {
        errors.push(
          `${entry.name} @ (${tile.gridX},${tile.gridY}) r${tile.rotation}: unconnected ${side}`,
        )
      }
    }
  }
  return errors
}

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

/** Cap ∥ LED with LED on center column and cap on east (swap of lesson 21). */
function buildParallelCapLedSwapped(
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
    tile('led-red', 5, splitY + 1, 90),
    tile('t-connector', 5, mergeY, 90),
    tile('ground-tile', 5, mergeY + 1),
    tile('corner-cube', 6, splitY, 180),
    tile('cap-1000u', 6, splitY + 1, 90),
    tile('corner-cube', 6, mergeY, 270),
  )
  return tiles
}

/** Lesson 22: cap∥LED fade-on — LED center, cap east (mirror layout of lesson 21). */
function buildLedFadeOnCircuit(): PlacedTile[] {
  return buildParallelCapLedSwapped(6, [{ catalogId: 'slide-switch', rotation: 90 }])
}

/** Lesson 23: tact + 4.7k trunk R; cap∥LED — LED ramps up slowly while held (RC delay vs lesson 8). */
function buildPushbuttonRcDelay(): PlacedTile[] {
  return buildParallelCapLedDirect(6, [{ catalogId: 'tact-button' }], 'resistor-4k7')
}

/** Lesson 30: tact + 470Ω + 1000µF∥LED — cap smooths rapid taps into steady glow. */
function buildRcSmoothingCircuit(): PlacedTile[] {
  return buildParallelCapLedDirect(6, [{ catalogId: 'tact-button' }], 'resistor-470')
}

/**
 * Lesson 35 — hand-authored ref: circuit jsons/35-diode-or-circuit.json
 * Cross split; west/east btn → Schottky → OR node; 1k pull-down on east rail; 470 + LED below.
 */

/**
 * Lesson 38: one USB — west tact = full 5 V OR input; east row 10k–T–10k divider tap ≈2.5 V OR input.
 * Schottky cathodes toward center T; shared 470Ω + LED. ≠ lesson 35 (both inputs at 5 V).
 */
function buildDualPowerSourceOrCircuit(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('t-connector', 5, 4, 0),
    tile('corner-cube', 4, 4, 90),
    tile('straight-cube', 4, 5, 90),
    tile('tact-button', 4, 6, 90),
    tile('schottky', 4, 7, 90),
    tile('corner-cube', 4, 8, 0),
    tile('corner-cube', 6, 4, 180),
    tile('resistor-10k', 6, 5, 90),
    tile('t-connector', 6, 6, 90),
    tile('resistor-10k', 6, 7, 90),
    tile('t-connector', 6, 8, 0),
    tile('ground-tile', 6, 9),
    tile('corner-cube', 7, 6, 180),
    tile('tact-button', 7, 7, 90),
    tile('schottky', 7, 8, 90),
    tile('corner-cube', 7, 9, 270),
    tile('t-connector', 5, 8, 180),
    tile('resistor-470', 5, 9, 90),
    tile('led-red', 5, 10, 90),
    tile('ground-tile', 5, 11),
  ]
}

/**
 * Lesson 37: parallel compare — center 470Ω→LED (bright); east adds Schottky (90°, forward) → dimmer LED.
 * East branch is longer; straight-cube pads center column to merge row (lesson 20 rule).
 */
function buildDiodeVoltageDropDemo(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('t-connector', 5, 4, 90),
    tile('resistor-470', 5, 5, 90),
    tile('led-red', 5, 6, 90),
    tile('straight-cube', 5, 7, 90),
    tile('t-connector', 5, 8, 90),
    tile('ground-tile', 5, 9),
    tile('corner-cube', 6, 4, 180),
    tile('resistor-470', 6, 5, 90),
    tile('schottky', 6, 6, 90),
    tile('led-red', 6, 7, 90),
    tile('corner-cube', 6, 8, 270),
  ]
}

/**
 * Lesson 33: SPDT selects west (Schottky forward → LED on) vs east (reversed → LED off).
 */
function buildSchottkyDiodeOneWayCurrentDemo(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('slide-switch', 5, 4, 180),
    tile('corner-cube', 4, 4, 90),
    tile('resistor-470', 4, 5, 90),
    tile('led-red', 4, 6, 90),
    tile('schottky', 4, 7, 90),
    tile('corner-cube', 4, 8, 0),
    tile('corner-cube', 6, 4, 180),
    tile('resistor-470', 6, 5, 90),
    tile('led-red', 6, 6, 90),
    tile('schottky', 6, 7, 270),
    tile('corner-cube', 6, 8, 270),
    tile('t-connector', 5, 8, 180),
    tile('ground-tile', 5, 9),
  ]
}

/**
 * Lesson 32: slide 0° — power west; south throw charges cap; east recalls LED.
 * Hand-authored ref: circuit jsons/32-capacitor-memory-effect-demo.json
 */
function buildCapacitorMemoryEffectDemo(): PlacedTile[] {
  return [
    tile('power-tile', 3, 5),
    tile('corner-cube', 3, 6, 0),
    tile('slide-switch', 4, 6, 0),
    tile('straight-cube', 5, 6, 0),
    tile('resistor-470', 4, 7, 90),
    tile('cap-1000u', 4, 8, 90),
    tile('t-connector', 4, 9, 90),
    tile('ground-tile', 4, 10),
    tile('corner-cube', 6, 6, 180),
    tile('led-red', 6, 7, 90),
    tile('straight-cube', 6, 8, 90),
    tile('corner-cube', 6, 9, 270),
    tile('straight-cube', 5, 9, 180),
  ]
}

/**
 * Lesson 31: 1000µF on USB rail (center); load east = tact → 470Ω → LED.
 * Bulk cap smooths supply when the load draws pulses (vs lesson 30 cap at load).
 */
function buildPowerSupplySmoothingDemo(): PlacedTile[] {
  const splitY = 4
  const mergeY = 8
  return [
    tile('power-tile', 5, 3),
    tile('t-connector', 5, splitY, 90),
    tile('cap-1000u', 5, splitY + 1, 90),
    tile('straight-cube', 5, splitY + 2, 90),
    tile('straight-cube', 5, splitY + 3, 90),
    tile('t-connector', 5, mergeY, 90),
    tile('ground-tile', 5, mergeY + 1),
    tile('corner-cube', 6, splitY, 180),
    tile('tact-button', 6, splitY + 1, 90),
    tile('resistor-470', 6, splitY + 2, 90),
    tile('led-red', 6, splitY + 3, 90),
    tile('corner-cube', 6, mergeY, 270),
  ]
}

/**
 * Lesson 24 — hand-authored ref: circuit jsons/24-adjustable-rc-delay.json
 * Trunk col 5 (tact, 470Ω, pot 270°); corner bridges to RC col 6; LED branch col 7.
 */
function buildAdjustableRcDelay(): PlacedTile[] {
  const splitY = 7
  const mergeY = splitY + 2
  const rcCol = 6
  const ledCol = 7
  return [
    tile('power-tile', 5, 3),
    tile('tact-button', 5, 4, 90),
    tile('resistor-470', 5, 5, 90),
    tile('potentiometer', 5, 6, 270),
    tile('corner-cube', rcCol, 6, 180),
    tile('t-connector', rcCol, splitY, 90),
    tile('cap-1000u', rcCol, splitY + 1, 90),
    tile('t-connector', rcCol, mergeY, 90),
    tile('ground-tile', rcCol, mergeY + 1),
    tile('corner-cube', ledCol, splitY, 180),
    tile('led-red', ledCol, splitY + 1, 90),
    tile('corner-cube', ledCol, mergeY, 270),
  ]
}

/**
 * Two RC branches after shared 470Ω: T-split (0°) at splitY, T-merge (180°) at splitY+3.
 * West fast: corner 90° → 100µF → LED → corner 0°. East slow: corner 180° → 1000µF → LED → corner 270°.
 * Hand-authored ref: circuit jsons/27-fast-vs-slow-rc-timing.json
 */
function buildFastVsSlowRcTiming(): PlacedTile[] {
  const splitY = 6
  const mergeY = splitY + 3
  return [
    tile('power-tile', 5, 3),
    tile('slide-switch', 5, 4, 90),
    tile('resistor-470', 5, 5, 90),
    tile('t-connector', 5, splitY, 0),
    tile('t-connector', 5, mergeY, 180),
    tile('ground-tile', 5, mergeY + 1),
    tile('corner-cube', 4, splitY, 90),
    tile('cap-100u', 4, splitY + 1, 90),
    tile('led-red', 4, splitY + 2, 90),
    tile('corner-cube', 4, mergeY, 0),
    tile('corner-cube', 6, splitY, 180),
    tile('cap-1000u', 6, splitY + 1, 90),
    tile('led-red', 6, splitY + 2, 90),
    tile('corner-cube', 6, mergeY, 270),
  ]
}

/** Lesson 25: slide switch + series 470Ω → LED → 1000µF (correct electrolytic polarity). */
function buildCapacitorPolarityDemo(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('slide-switch', 5, 4, 90),
    tile('resistor-470', 5, 5, 90),
    tile('led-red', 5, 6, 90),
    tile('cap-1000u', 5, 7, 90),
    tile('ground-tile', 5, 8),
  ]
}

/** Lesson 28: series 100µF — brief LED pulse on switch edges, not steady light. */
function buildCapacitorPulseCircuit(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('slide-switch', 5, 4, 90),
    tile('resistor-470', 5, 5, 90),
    tile('cap-100u', 5, 6, 90),
    tile('led-red', 5, 7, 90),
    tile('ground-tile', 5, 8),
  ]
}

/**
 * Lesson 29: low-pass RC — pot wiper → 1k → T; cap via corner 90° on col 5; LED east.
 * Hand-authored ref: circuit jsons/29-rc-filter-demo.json
 */
function buildRcFilterDemo(): PlacedTile[] {
  return [
    tile('power-tile', 5, 3),
    tile('resistor-470', 5, 4, 90),
    tile('potentiometer', 5, 5, 270),
    tile('corner-cube', 6, 5, 180),
    tile('resistor-1k', 6, 6, 90),
    tile('t-connector', 6, 7, 0),
    tile('corner-cube', 5, 7, 90),
    tile('cap-100u', 5, 8, 90),
    tile('ground-tile', 5, 9),
    tile('corner-cube', 7, 7, 180),
    tile('led-red', 7, 8, 90),
    tile('ground-tile', 7, 9),
  ]
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
  {
    name: '22-led-fade-on-circuit',
    build: () => buildLedFadeOnCircuit(),
  },
  {
    name: '23-pushbutton-rc-delay',
    build: () => buildPushbuttonRcDelay(),
  },
  // Lesson 24: hand-authored — see circuit jsons/24-adjustable-rc-delay.json. Do not EXPORT_ONLY=23.
  {
    name: '24-adjustable-rc-delay',
    build: () => {
      throw new Error(
        'Lesson 24 is hand-authored; edit circuit jsons/24-adjustable-rc-delay.json',
      )
    },
  },
  {
    name: '25-capacitor-polarity-demo',
    build: () => buildCapacitorPolarityDemo(),
  },
  // Lesson 26: TBD — covered by lesson 20. Keep circuit jsons/26-tbd.json empty. Do not EXPORT_ONLY=25.
  {
    name: '26-tbd',
    build: () => {
      throw new Error(
        'Lesson 26 is TBD (see lesson 20); edit circuit jsons/26-tbd.json when ready',
      )
    },
  },
  // Lesson 27: hand-authored — see circuit jsons/27-fast-vs-slow-rc-timing.json. Do not EXPORT_ONLY=26.
  {
    name: '27-fast-vs-slow-rc-timing',
    build: () => {
      throw new Error(
        'Lesson 27 is hand-authored; edit circuit jsons/27-fast-vs-slow-rc-timing.json',
      )
    },
  },
  {
    name: '28-capacitor-pulse-circuit',
    build: () => buildCapacitorPulseCircuit(),
  },
  // Lesson 29: hand-authored — see circuit jsons/29-rc-filter-demo.json. Do not EXPORT_ONLY=28.
  {
    name: '29-rc-filter-demo',
    build: () => {
      throw new Error(
        'Lesson 29 is hand-authored; edit circuit jsons/29-rc-filter-demo.json',
      )
    },
  },
  {
    name: '30-rc-smoothing-circuit',
    build: () => buildRcSmoothingCircuit(),
  },
  {
    name: '31-power-supply-smoothing-demo',
    build: () => buildPowerSupplySmoothingDemo(),
  },
  // Lesson 32: hand-authored — see circuit jsons/32-capacitor-memory-effect-demo.json. Do not EXPORT_ONLY=31.
  {
    name: '32-capacitor-memory-effect-demo',
    build: () => {
      throw new Error(
        'Lesson 32 is hand-authored; edit circuit jsons/32-capacitor-memory-effect-demo.json',
      )
    },
  },
  {
    name: '33-schottky-diode-one-way-current-demo',
    build: () => buildSchottkyDiodeOneWayCurrentDemo(),
  },
  // Lesson 34: TBD — overlaps lesson 33. Keep circuit jsons/34-tbd.json empty. Do not EXPORT_ONLY=33.
  {
    name: '34-tbd',
    build: () => {
      throw new Error(
        'Lesson 34 is TBD (see lesson 33); edit circuit jsons/34-tbd.json when ready',
      )
    },
  },
  // Lesson 35: hand-authored — see circuit jsons/35-diode-or-circuit.json. Do not EXPORT_ONLY=34.
  {
    name: '35-diode-or-circuit',
    build: () => {
      throw new Error(
        'Lesson 35 is hand-authored; edit circuit jsons/35-diode-or-circuit.json',
      )
    },
  },
  // Lesson 36: TBD — overlaps lessons 2–4. Keep circuit jsons/36-tbd.json empty. Do not EXPORT_ONLY=35.
  {
    name: '36-tbd',
    build: () => {
      throw new Error(
        'Lesson 36 is TBD (see lessons 2–4); edit circuit jsons/36-tbd.json when ready',
      )
    },
  },
  {
    name: '37-diode-voltage-drop-demo',
    build: () => buildDiodeVoltageDropDemo(),
  },
  // Lesson 38: hand-authored — see circuit jsons/38-dual-power-source-or-circuit.json. Do not EXPORT_ONLY=37.
  {
    name: '38-dual-power-source-or-circuit',
    build: () => {
      throw new Error(
        'Lesson 38 is hand-authored; edit circuit jsons/38-dual-power-source-or-circuit.json',
      )
    },
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
  'LED Fade-On Circuit',
  'Pushbutton RC Delay',
  'Adjustable RC Delay',
  'Capacitor Polarity Demo',
  'TBD',
  'Fast vs Slow RC Timing',
  'Capacitor Pulse Circuit',
  'RC Filter Demo',
  'RC Smoothing Circuit',
  'Power Supply Smoothing Demo',
  'Capacitor Memory Effect Demo',
  'Schottky Diode One-Way Current Demo',
  'TBD',
  'Diode OR Circuit',
  'TBD',
  'Diode Voltage Drop Demo',
  'Dual-Power Source OR Circuit',
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
  'USB → slide switch → 1kΩ → split: red LED on the center column and 1000µF cap on the east branch in parallel. Flip the switch on — the LED starts dim and brightens over several seconds as the capacitor charges (fade-on). Flip off to see it fade out. Layout swaps lesson 21 (cap center, LED east); the LED is on the center column here. LED at 90° (anode north); cap + toward power.',
  'Press and hold the tact button. A 4.7kΩ resistor and 1000µF capacitor (τ ≈ 4.7 s) slow the rise — the red LED on the east branch is in parallel with the cap, so it brightens gradually instead of snapping on like lesson 8. Release the button and the LED fades out as the cap discharges. Cap on the center column; LED east at 90° (anode north).',
  'Press the tact button and turn the potentiometer. A 470Ω resistor sets a safe minimum; the pot (270°) feeds the RC column through a corner. The 1000µF cap and red LED are in parallel on columns 6–7 — more resistance = slower fade-on/off, less = faster. Cap on column 6, LED column 7 at 90° (anode north); cap + toward power.',
  'Flip the slide switch on: USB → 470Ω → red LED → 1000µF cap → ground. Match the tile markings: + (west magnet) toward the LED, − (east) toward ground. Correct: LED responds when you switch on (flash/settle like lesson 19). Reversed: LED stays dark or weak — the cap cannot charge properly. Quick compare only; if the cap feels warm, switch off. Do not leave a large electrolytic reversed on USB power.',
  'Lesson 26 reserved. Big-capacitor energy storage is covered by lesson 20 (Capacitor Discharge Demo). A dedicated circuit may be added here later.',
  'Flip the slide switch on. Shared 470Ω feeds a T (top): west branch 100µF + red LED (fast), east branch 1000µF + red LED (slow). Watch both when you switch on or off — same R, different C. LEDs at 90°; cap + toward power on each branch.',
  'Flip the slide switch on, then off. USB → 470Ω → 100µF capacitor → red LED → ground — the cap is in series, so it blocks steady DC once charged. You get a short flash when the switch changes (charge pulse on, discharge pulse off), not a steady glow like lesson 9. τ ≈ 47 ms with 100µF — much snappier than lesson 19’s 1000µF after the LED. LED at 90° (anode north); cap + toward power.',
  'Turn the pot slowly — the red LED follows brightness through a low-pass filter (1kΩ + 100µF to ground, τ ≈ 0.1 s). Wiggle the knob quickly and the LED barely changes: the RC network passes slow changes and blocks fast ones. Compare lesson 14 (no capacitor), where the LED tracks every twitch. Pot 270° on column 5; filter node on column 6; cap on column 5 with + toward the junction; LED east at 90°.',
  'Tap the tact button quickly. USB → button → 470Ω → split: 1000µF cap (center) and red LED (east) in parallel. The capacitor stores charge between taps and smooths the pulses — the LED stays lit or dims gradually instead of snapping off like lesson 8. Compare lesson 23 (4.7kΩ slows one long press) and lesson 29 (pot + small cap filters wiggles). τ ≈ 0.5 s; cap + toward power; LED east at 90°.',
  'Right after USB power, a 1000µF capacitor sits on the center column from V+ to ground — a bulk supply cap like on a real board. Tap the tact button on the east branch (470Ω + red LED). The cap holds the rail up during each pulse so the supply does not dip as sharply. Compare lesson 30, where the same cap value is in parallel with the LED only. Cap + toward power; LED east at 90°.',
  'Use the slide switch like a “store / recall” control. Flip west (charge): USB → 470Ω → 1000µF → ground — the cap stores energy (longer charge = more stored). Flip east (recall): the cap powers the red LED through the east branch while USB is off that path — the LED fades as the “memory” empties. Try a short charge vs a long charge and compare fade time. Cap on column 4 (+ toward north); charge on south throw; LED east at 90°.',
  'The slide switch picks between two identical branches except for the Schottky orientation. West: 470Ω → red LED → Schottky (90°, forward) → ground — the LED lights. East: same chain but the Schottky is reversed (270°) — current cannot pass and the LED stays dark. A diode is a one-way valve for electricity. LEDs at 90° (anode north); forward Schottky band toward the LED.',
  'Lesson 34 reserved. Reverse polarity protection overlaps lesson 33 (Schottky Diode One-Way Current Demo). A distinct circuit may be added here later.',
  'Press either tact button (west or east). USB splits at the cross: each path goes button → Schottky (90°, cathode toward the center) → the shared OR node → 470Ω → red LED → ground. Either input alone lights the LED; both pressed still works — a diode OR gate. Compare lesson 12 (parallel buttons without diodes). LEDs at 90° (anode north).',
  'Lesson 36 reserved. LED direction / polarity is covered by lessons 2 (reverse polarity test), 3–4 (series and parallel LEDs), and 25 (capacitor polarity). A distinct circuit may be added here later.',
  'Plug in USB — both red LEDs light at once. The center branch is USB → 470Ω → LED → ground (brighter). The east branch adds a forward Schottky (90°, cathode toward the LED) before its LED, so roughly 0.3 V sits across the diode and less is left for the LED — it glows dimmer. Same resistor value; the difference is the diode drop, not resistance (compare lesson 5). LEDs at 90° (anode north).',
  'One USB tile powers two OR inputs. Press the west tact: full 5 V → Schottky → the shared node → 470Ω → red LED (bright). The east branch is a 10kΩ–10kΩ divider (~2.5 V at the tap) → Schottky → the same OR node — dim or off (not enough headroom). Press both: the higher rail wins. Compare lesson 35 (both buttons at 5 V) and lesson 17 (divider without diode OR). Schottkys at 90° (cathode toward center); LED at 90°.',
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

const outDir = join(process.cwd(), 'Circuit JSONs')
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
  const portErrors = validatePortConnectivity(tiles)
  if (portErrors.length > 0) {
    console.warn(`${name} magnet connectivity (fix on plate):`, portErrors.join('; '))
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
