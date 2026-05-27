export const PLATE_COLS = 30
export const PLATE_ROWS = 16

/** Grid cell nearest the geometric center of the plate (for a subtle center marker). */
export const CENTER_GRID_X = Math.floor((PLATE_COLS - 1) / 2)
export const CENTER_GRID_Y = Math.floor((PLATE_ROWS - 1) / 2)

export function inPlateBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < PLATE_COLS && gy < PLATE_ROWS
}
