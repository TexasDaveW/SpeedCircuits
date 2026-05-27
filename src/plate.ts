/** 14 columns west of center, center column, 14 east (symmetric around center). */
export const PLATE_COLS = 29
/** 8 rows above center, center row, 8 rows below (symmetric around center). */
export const PLATE_ROWS = 17

/** Grid cell nearest the geometric center of the plate (for a subtle center marker). */
export const CENTER_GRID_X = Math.floor((PLATE_COLS - 1) / 2)
export const CENTER_GRID_Y = Math.floor((PLATE_ROWS - 1) / 2)

/** Plate pivot in grid units (cell center) so view rotation keeps the center cell fixed. */
export const PLATE_PIVOT_GRID_X = CENTER_GRID_X + 0.5
export const PLATE_PIVOT_GRID_Y = CENTER_GRID_Y + 0.5

export function inPlateBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < PLATE_COLS && gy < PLATE_ROWS
}
