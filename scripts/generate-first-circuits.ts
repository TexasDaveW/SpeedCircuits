/**
 * One-off generator for the first 10 circuits from `circuit list`.
 * Run: npx --yes tsx scripts/generate-first-circuits.ts
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
    build: () =>
      h(
        [...rail(), ...ledChain('resistor-470', 'led-red', 180), ...tail()],
        2,
        5,
      ),
  },
  {
    name: '03-two-leds-in-series',
    build: () =>
      h(
        [
          ...rail(),
          { catalogId: 'resistor-1k' },
          { catalogId: 'led-red' },
          { catalogId: 'led-green' },
          ...tail(),
        ],
        2,
        5,
      ),
  },
  {
    name: '04-two-leds-in-parallel',
    build: () => [
      ...h([...rail(), { catalogId: 't-connector' }], 2, 5),
      ...h([{ catalogId: 'straight-cube' }, { catalogId: 'ground-tile' }], 5, 5),
      { instanceId: nextId('straight-cube'), catalogId: 'straight-cube', gridX: 4, gridY: 4, rotation: 90 },
      ...v(ledChain('resistor-470', 'led-red'), 4, 2),
      ...v(ledChain('resistor-470', 'led-green'), 4, 6),
    ],
  },
  {
    name: '05-led-brightness-comparison',
    build: () => [
      ...h([...rail(), { catalogId: 't-connector' }], 2, 5),
      ...h([{ catalogId: 'straight-cube' }, { catalogId: 'ground-tile' }], 5, 5),
      { instanceId: nextId('straight-cube'), catalogId: 'straight-cube', gridX: 4, gridY: 4, rotation: 90 },
      ...v(ledChain('resistor-150', 'led-red'), 4, 2),
      ...v(ledChain('resistor-4k7', 'led-green'), 4, 6),
    ],
  },
  {
    name: '06-rgb-led-basic-colors',
    build: () =>
      h(
        [...rail(), { catalogId: 'resistor-470' }, { catalogId: 'rgb-led' }, ...tail()],
        2,
        5,
      ),
  },
  {
    name: '07-rgb-led-color-mixing',
    build: () => [
      ...h(
        [
          ...rail(),
          { catalogId: 'resistor-470' },
          { catalogId: 'rgb-led' },
          { catalogId: 'straight-cube' },
          { catalogId: 'ground-tile' },
        ],
        2,
        5,
      ),
      {
        instanceId: nextId('potentiometer'),
        catalogId: 'potentiometer',
        gridX: 5,
        gridY: 7,
        rotation: 270,
      },
    ],
  },
  {
    name: '08-pushbutton-led',
    build: () =>
      h(
        [
          ...rail(),
          { catalogId: 'tact-button' },
          ...ledChain('resistor-470', 'led-red'),
          ...tail(),
        ],
        2,
        5,
      ),
  },
  {
    name: '09-slide-switch-led-on-off',
    build: () =>
      h(
        [
          ...rail(),
          { catalogId: 'slide-switch' },
          ...ledChain('resistor-470', 'led-red'),
          ...tail(),
        ],
        2,
        5,
      ),
  },
  {
    name: '10-slide-switch-led-selector',
    build: () => [
      ...h([...rail(), { catalogId: 'slide-switch' }], 2, 5),
      ...h(
        [
          { catalogId: 'resistor-470' },
          { catalogId: 'led-red' },
          { catalogId: 'straight-cube' },
          { catalogId: 'ground-tile' },
        ],
        5,
        5,
      ),
      {
        instanceId: nextId('resistor-470'),
        catalogId: 'resistor-470',
        gridX: 4,
        gridY: 7,
        rotation: 90,
      },
      {
        instanceId: nextId('led-green'),
        catalogId: 'led-green',
        gridX: 4,
        gridY: 8,
        rotation: 90,
      },
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

for (let i = 0; i < CIRCUITS.length; i++) {
  idCounter = 0
  const { name, build } = CIRCUITS[i]!
  const tiles = build()
  const countErrors = validateCounts(tiles)
  if (countErrors.length > 0) {
    console.error(`${name}:`, countErrors.join('; '))
    process.exit(1)
  }
  const doc = exportCircuit(tiles, DISPLAY_NAMES[i])
  const path = join(outDir, `${name}.json`)
  writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`)
  console.log(`Wrote ${path} (${tiles.length} tiles)`)
}
