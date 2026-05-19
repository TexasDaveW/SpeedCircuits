import type { PlacedTile } from './types'

const MAX_UNDO = 50

export function cloneTiles(tiles: PlacedTile[]): PlacedTile[] {
  return tiles.map((t) => ({ ...t }))
}

export function pushUndoSnapshot(stack: PlacedTile[][], snapshot: PlacedTile[]): PlacedTile[][] {
  const next = [...stack, cloneTiles(snapshot)]
  if (next.length > MAX_UNDO) next.shift()
  return next
}
