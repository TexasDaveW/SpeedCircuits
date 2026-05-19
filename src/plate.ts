export const PLATE_COLS = 12
export const PLATE_ROWS = 8

export function inPlateBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < PLATE_COLS && gy < PLATE_ROWS
}
