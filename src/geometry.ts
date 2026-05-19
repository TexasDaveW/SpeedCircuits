import type { Rotation, Side } from './types'

const OPPOSITE: Record<Side, Side> = {
  north: 'south',
  east: 'west',
  south: 'north',
  west: 'east',
}

const ROTATE_CW: Record<Side, Side> = {
  north: 'east',
  east: 'south',
  south: 'west',
  west: 'north',
}

export function rotateSide(side: Side, rotation: Rotation): Side {
  const steps = rotation / 90
  let s = side
  for (let i = 0; i < steps; i++) s = ROTATE_CW[s]
  return s
}

export function sidesAtRotation(basePorts: Side[], rotation: Rotation): Side[] {
  return basePorts.map((p) => rotateSide(p, rotation))
}

export function oppositeSide(side: Side): Side {
  return OPPOSITE[side]
}

export function neighborOffset(side: Side): { dx: number; dy: number } {
  switch (side) {
    case 'north':
      return { dx: 0, dy: -1 }
    case 'east':
      return { dx: 1, dy: 0 }
    case 'south':
      return { dx: 0, dy: 1 }
    case 'west':
      return { dx: -1, dy: 0 }
  }
}

export function nextRotation(r: Rotation): Rotation {
  return ((r + 90) % 360) as Rotation
}

export function prevRotation(r: Rotation): Rotation {
  return ((r + 270) % 360) as Rotation
}
