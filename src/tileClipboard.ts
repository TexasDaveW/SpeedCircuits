import { catalogById } from './catalog'
import { inPlateBounds } from './plate'
import type { PlacedTile, Rotation } from './types'

export interface TileClipboardItem {
  catalogId: string
  rotation: Rotation
  dx: number
  dy: number
}

export interface TileClipboard {
  tiles: TileClipboardItem[]
}

export function copyTile(tile: PlacedTile): TileClipboard {
  return copyTiles([tile])
}

export function copyTiles(selection: PlacedTile[]): TileClipboard {
  if (selection.length === 0) return { tiles: [] }
  const minX = Math.min(...selection.map((t) => t.gridX))
  const minY = Math.min(...selection.map((t) => t.gridY))
  return {
    tiles: selection.map((tile) => ({
      catalogId: tile.catalogId,
      rotation: tile.rotation,
      dx: tile.gridX - minX,
      dy: tile.gridY - minY,
    })),
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
): PlacedTile[] | null {
  if (clipboard.tiles.length === 0) return null

  const usage = new Map<string, number>()
  for (const t of tiles) {
    usage.set(t.catalogId, (usage.get(t.catalogId) ?? 0) + 1)
  }

  for (const clipTile of clipboard.tiles) {
    const entry = catalogById.get(clipTile.catalogId)
    if (!entry) return null
    const used = usage.get(clipTile.catalogId) ?? 0
    if (used + 1 > entry.quantity) return null
    usage.set(clipTile.catalogId, used + 1)

    const tx = gx + clipTile.dx
    const ty = gy + clipTile.dy
    if (!inPlateBounds(tx, ty) || isOccupied(tiles, tx, ty)) return null
  }

  return clipboard.tiles.map((clipTile) => ({
    instanceId: crypto.randomUUID(),
    catalogId: clipTile.catalogId,
    gridX: gx + clipTile.dx,
    gridY: gy + clipTile.dy,
    rotation: clipTile.rotation,
  }))
}
