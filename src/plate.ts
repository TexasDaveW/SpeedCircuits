export const PLATE_COLS = 30
export const PLATE_ROWS = 16

export function inPlateBounds(gx: number, gy: number): boolean {
  return gx >= 0 && gy >= 0 && gx < PLATE_COLS && gy < PLATE_ROWS
}
