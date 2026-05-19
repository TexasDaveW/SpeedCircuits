import { catalogById } from './catalog'
import { inPlateBounds } from './plate'
import type { PlacedTile, Rotation } from './types'

const VALID_ROTATIONS = new Set<Rotation>([0, 90, 180, 270])

export type ImportResult =
  | { ok: true; tiles: PlacedTile[]; name?: string }
  | { ok: false; errors: string[] }

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v)
}

export function importCircuit(raw: unknown): ImportResult {
  const errors: string[] = []

  if (!isRecord(raw)) {
    return { ok: false, errors: ['File is not a valid circuit JSON object.'] }
  }

  const version = raw.version
  if (version !== 1) {
    errors.push(`Unsupported format version "${String(version)}" (expected 1).`)
  }

  const tilesRaw = raw.tiles
  if (!Array.isArray(tilesRaw)) {
    return { ok: false, errors: ['Missing "tiles" array.'] }
  }

  if (tilesRaw.length === 0) {
    return { ok: false, errors: ['Circuit has no tiles.'] }
  }

  const placed: PlacedTile[] = []
  const cells = new Set<string>()
  const counts = new Map<string, number>()

  for (let i = 0; i < tilesRaw.length; i++) {
    const t = tilesRaw[i]
    if (!isRecord(t)) {
      errors.push(`Tile ${i + 1}: invalid entry.`)
      continue
    }

    const catalogId = t.catalogId
    if (typeof catalogId !== 'string' || !catalogById.has(catalogId)) {
      errors.push(`Tile ${i + 1}: unknown part "${String(catalogId)}".`)
      continue
    }

    const gridX = t.gridX
    const gridY = t.gridY
    if (typeof gridX !== 'number' || typeof gridY !== 'number' || !Number.isInteger(gridX) || !Number.isInteger(gridY)) {
      errors.push(`Tile ${i + 1}: grid position must be integers.`)
      continue
    }

    if (!inPlateBounds(gridX, gridY)) {
      errors.push(`Tile ${i + 1}: position (${gridX}, ${gridY}) is outside the plate.`)
      continue
    }

    const cellKey = `${gridX},${gridY}`
    if (cells.has(cellKey)) {
      errors.push(`Tile ${i + 1}: cell (${gridX}, ${gridY}) is already occupied.`)
      continue
    }

    const rotation = t.rotation
    if (typeof rotation !== 'number' || !VALID_ROTATIONS.has(rotation as Rotation)) {
      errors.push(`Tile ${i + 1}: rotation must be 0, 90, 180, or 270.`)
      continue
    }

    cells.add(cellKey)
    counts.set(catalogId, (counts.get(catalogId) ?? 0) + 1)
    placed.push({
      instanceId: crypto.randomUUID(),
      catalogId,
      gridX,
      gridY,
      rotation: rotation as Rotation,
    })
  }

  for (const [catalogId, count] of counts) {
    const entry = catalogById.get(catalogId)!
    if (count > entry.quantity) {
      errors.push(
        `Too many "${entry.name}" tiles (${count}); kit allows ${entry.quantity}.`,
      )
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors }
  }

  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined

  return { ok: true, tiles: placed, name }
}

export function parseCircuitJson(text: string): ImportResult {
  try {
    const data = JSON.parse(text) as unknown
    return importCircuit(data)
  } catch {
    return { ok: false, errors: ['Invalid JSON syntax.'] }
  }
}
