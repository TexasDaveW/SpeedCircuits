import type { CatalogEntry } from './types'
import type { Rotation, Side } from './types'
import { TILE_SIZE } from './catalog'
import { drawSymbol, getSymbolLeads } from './symbols/draw'
import type { SymbolBounds } from './symbols/types'

const CHROME = '#c8ccd4'
const CHROME_EDGE = '#9aa3b0'
const TILE_BODY = '#1a1a1c'
const TILE_EDGE = '#0d0d0e'
const TRACE = '#f2f4f7'
const BAND = '#3a3d42'
const SCREW = '#111114'

function portPixel(side: Side, size: number): { x: number; y: number } {
  const m = size * 0.08
  const c = size / 2
  switch (side) {
    case 'north':
      return { x: c, y: m }
    case 'south':
      return { x: c, y: size - m }
    case 'west':
      return { x: m, y: c }
    case 'east':
      return { x: size - m, y: c }
  }
}

function drawMagnet(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  horizontal: boolean,
  size: number,
) {
  const w = horizontal ? size * 0.14 : size * 0.08
  const h = horizontal ? size * 0.08 : size * 0.14
  ctx.save()
  ctx.fillStyle = CHROME
  ctx.strokeStyle = CHROME_EDGE
  ctx.lineWidth = 1
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 3)
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  entry: CatalogEntry,
  rotation: Rotation,
  options?: { selected?: boolean; highlightPorts?: boolean },
) {
  const size = TILE_SIZE
  ctx.save()
  ctx.translate(x + size / 2, y + size / 2)
  ctx.rotate((rotation * Math.PI) / 180)
  ctx.translate(-size / 2, -size / 2)

  roundRect(ctx, 2, 2, size - 4, size - 4, 10)
  ctx.fillStyle = TILE_BODY
  ctx.fill()
  ctx.strokeStyle = options?.selected ? '#4d9fff' : TILE_EDGE
  ctx.lineWidth = options?.selected ? 3 : 1.5
  ctx.stroke()

  const screwR = size * 0.035
  const inset = size * 0.1
  for (const [sx, sy] of [
    [inset, inset],
    [size - inset, inset],
    [inset, size - inset],
    [size - inset, size - inset],
  ]) {
    ctx.beginPath()
    ctx.arc(sx, sy, screwR, 0, Math.PI * 2)
    ctx.fillStyle = SCREW
    ctx.fill()
    ctx.strokeStyle = '#2a2a2e'
    ctx.lineWidth = 1
    ctx.stroke()
  }

  const isRouting = entry.category === 'routing'
  const center = size / 2
  const bandX = size * 0.12
  const bandY = size * 0.38
  const bandW = size * 0.76
  const bandH = size * 0.24
  const traceHubY = isRouting ? center : bandY + bandH / 2

  const bandBounds: SymbolBounds = { x: bandX, y: bandY, w: bandW, h: bandH }
  const leads =
    entry.symbolId && !isRouting
      ? getSymbolLeads(entry.symbolId, bandBounds)
      : null

  if (!isRouting) {
    ctx.fillStyle = BAND
    ctx.fillRect(bandX, bandY, bandW, bandH)
    if (entry.symbolId) {
      drawSymbol(ctx, entry.symbolId, bandBounds)
    }
  }

  ctx.fillStyle = '#f0f2f5'
  ctx.textAlign = 'center'
  ctx.font = `600 ${size * 0.11}px system-ui, sans-serif`
  ctx.fillText(entry.valueLabel ?? entry.typeLabel, size / 2, size * 0.2)
  ctx.font = `500 ${size * 0.085}px system-ui, sans-serif`
  ctx.fillStyle = '#b8bcc4'
  ctx.fillText(entry.typeLabel, size / 2, size * 0.88)

  for (const side of entry.ports) {
    const p = portPixel(side, size)
    const from = leads?.[side] ?? { x: center, y: traceHubY }
    ctx.strokeStyle = TRACE
    ctx.lineWidth = isRouting ? 3 : 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    const horizontal = side === 'west' || side === 'east'
    drawMagnet(ctx, p.x, p.y, horizontal, size)
  }

  // Power: V+ edge magnet + separate underside plate magnet. Ground: one edge magnet only; plate via pad.
  const singleUndersideMagnet =
    entry.plateGround && entry.category === 'power'
  if (singleUndersideMagnet) {
    const ux = size / 2
    const uy = size - size * 0.06
    drawMagnet(ctx, ux, uy, true, size)
    ctx.strokeStyle = TRACE
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ux, bandY + bandH)
    ctx.lineTo(ux, uy)
    ctx.stroke()
  } else if (entry.plateGround) {
    const ux = size / 2
    const uy = size - size * 0.06
    ctx.fillStyle = 'rgba(120, 180, 255, 0.35)'
    ctx.beginPath()
    ctx.arc(ux, uy, size * 0.05, 0, Math.PI * 2)
    ctx.fill()
  }

  if (options?.highlightPorts && entry.ports.length > 0) {
    ctx.strokeStyle = 'rgba(77, 159, 255, 0.6)'
    ctx.lineWidth = 2
    for (const side of entry.ports) {
      const p = portPixel(side, size)
      ctx.beginPath()
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  ctx.restore()
}

export function drawPlate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const g = ctx.createLinearGradient(0, 0, width, height)
  g.addColorStop(0, '#5c6369')
  g.addColorStop(0.5, '#4a5158')
  g.addColorStop(1, '#3d444b')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, width, height)

  ctx.strokeStyle = 'rgba(255,255,255,0.06)'
  ctx.lineWidth = 1
  const step = TILE_SIZE
  for (let x = 0; x <= width; x += step) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }
  for (let y = 0; y <= height; y += step) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }
}
