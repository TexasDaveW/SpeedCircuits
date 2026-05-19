import { catalogById } from './catalog'
import { inPlateBounds } from './plate'
import type { PlacedTile, Rotation } from './types'

export interface TileClipboard {
  catalogId: string
  rotation: Rotation
}

export function copyTile(tile: PlacedTile): TileClipboard {
  return {
    catalogId: tile.catalogId,
    rotation: tile.rotation,
  }
}

function isOccupied(tiles: PlacedTile[], gx: number, gy: number): boolean {
  return tiles.some((t) => t.gridX === gx && t.gridY === gy)
}

export function pasteTileAt(
  clipboard: TileClipboard,
  tiles: PlacedTile[],
  gx: number,
  gy: number,
): PlacedTile | null {
  const entry = catalogById.get(clipboard.catalogId)
  if (!entry) return null

  const used = tiles.filter((t) => t.catalogId === clipboard.catalogId).length
  if (used >= entry.quantity) return null

  if (!inPlateBounds(gx, gy) || isOccupied(tiles, gx, gy)) return null

  return {
    instanceId: crypto.randomUUID(),
    catalogId: clipboard.catalogId,
    gridX: gx,
    gridY: gy,
    rotation: clipboard.rotation,
  }
}
