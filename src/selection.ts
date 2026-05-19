import { GRID_CELL } from './catalog'
import { inPlateBounds } from './plate'
import type { PlacedTile } from './types'

/** Select tiles intersecting a world-space rectangle (plate pixels). */
export function tilesInWorldRect(
  tiles: PlacedTile[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): PlacedTile[] {
  const left = Math.min(x0, x1)
  const right = Math.max(x0, x1)
  const top = Math.min(y0, y1)
  const bottom = Math.max(y0, y1)

  return tiles.filter((t) => {
    const tx0 = t.gridX * GRID_CELL
    const ty0 = t.gridY * GRID_CELL
    const tx1 = tx0 + GRID_CELL
    const ty1 = ty0 + GRID_CELL
    return tx1 > left && tx0 < right && ty1 > top && ty0 < bottom
  })
}

export function canMoveGroup(
  tiles: PlacedTile[],
  selectedIds: Set<string>,
  origins: Map<string, { gridX: number; gridY: number }>,
  dx: number,
  dy: number,
): boolean {
  if (dx === 0 && dy === 0) return true

  const movedCells = new Set<string>()
  for (const t of tiles) {
    if (!selectedIds.has(t.instanceId)) continue
    const o = origins.get(t.instanceId)!
    const gx = o.gridX + dx
    const gy = o.gridY + dy
    if (!inPlateBounds(gx, gy)) return false
    const key = `${gx},${gy}`
    if (movedCells.has(key)) return false
    movedCells.add(key)
  }

  for (const t of tiles) {
    if (selectedIds.has(t.instanceId)) continue
    if (movedCells.has(`${t.gridX},${t.gridY}`)) return false
  }

  return true
}

export function moveGroupFromOrigins(
  tiles: PlacedTile[],
  selectedIds: Set<string>,
  origins: Map<string, { gridX: number; gridY: number }>,
  dx: number,
  dy: number,
): PlacedTile[] {
  return tiles.map((t) => {
    if (!selectedIds.has(t.instanceId)) return t
    const o = origins.get(t.instanceId)!
    return { ...t, gridX: o.gridX + dx, gridY: o.gridY + dy }
  })
}
