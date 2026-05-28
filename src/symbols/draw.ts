import type { Side, SymbolId } from '../types'
import type { SymbolBounds, SymbolLeads } from './types'

const STROKE = '#f0f2f5'

function prep(ctx: CanvasRenderingContext2D) {
  ctx.strokeStyle = STROKE
  ctx.fillStyle = STROKE
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
}

function midY(b: SymbolBounds) {
  return b.y + b.h / 2
}

function midX(b: SymbolBounds) {
  return b.x + b.w / 2
}

function leadForSide(b: SymbolBounds, side: Side): { x: number; y: number } {
  const cy = midY(b)
  const cx = midX(b)
  switch (side) {
    case 'west':
      return { x: b.x, y: cy }
    case 'east':
      return { x: b.x + b.w, y: cy }
    case 'south':
      return { x: cx, y: b.y + b.h }
    case 'north':
      return { x: cx, y: b.y }
  }
}

function defaultLeads2(b: SymbolBounds): SymbolLeads {
  return { west: leadForSide(b, 'west'), east: leadForSide(b, 'east') }
}

function defaultLeads3(b: SymbolBounds): SymbolLeads {
  return { ...defaultLeads2(b), south: leadForSide(b, 'south') }
}

function defaultLeads4(b: SymbolBounds): SymbolLeads {
  return {
    west: leadForSide(b, 'west'),
    east: leadForSide(b, 'east'),
    south: leadForSide(b, 'south'),
    north: leadForSide(b, 'north'),
  }
}

function defaultLeadsNorth(b: SymbolBounds): SymbolLeads {
  return { ...defaultLeads2(b), north: leadForSide(b, 'north') }
}

function drawResistor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const x0 = b.x + b.w * 0.12
  const x1 = b.x + b.w * 0.88
  const amp = b.h * 0.32
  const steps = 6
  const dx = (x1 - x0) / steps
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(x0, cy)
  for (let i = 0; i < steps; i++) {
    const x = x0 + dx * i + dx / 2
    const y = cy + (i % 2 === 0 ? -amp : amp)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(x1, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
}

function drawCapacitor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const gap = b.w * 0.06
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - gap, cy)
  ctx.moveTo(cx + gap, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - gap, b.y + b.h * 0.15)
  ctx.lineTo(cx - gap, b.y + b.h * 0.85)
  ctx.moveTo(cx + gap, b.y + b.h * 0.15)
  ctx.lineTo(cx + gap, b.y + b.h * 0.85)
  ctx.stroke()
  // Polarity: west lead = +, east lead = − (matches catalog ports at 0°; rotates with tile)
  const markSize = Math.max(8, b.h * 0.38)
  ctx.save()
  ctx.font = `700 ${markSize}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = STROKE
  ctx.fillText('+', cx - gap, cy + b.h * 0.32)
  ctx.fillText('−', cx + gap, cy + b.h * 0.32)
  ctx.restore()
}

function drawInductor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const x0 = b.x + b.w * 0.15
  const x1 = b.x + b.w * 0.85
  const r = (x1 - x0) / 8
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(x0, cy)
  for (let i = 0; i < 4; i++) {
    const cx = x0 + r + i * 2 * r
    ctx.arc(cx, cy, r, Math.PI, 0)
  }
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
}

/** Transformer: dual coils + magnetic core, with 4 leads (N/E/S/W). */
function drawTransformer(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cx = midX(b)
  const coilR = Math.min(b.w, b.h) * 0.08
  const leftCx = b.x + b.w * 0.38
  const rightCx = b.x + b.w * 0.62
  const topY = b.y + b.h * 0.2
  const bottomY = b.y + b.h * 0.8
  const step = (bottomY - topY) / 4
  const yTop = topY + step / 2
  const yBottom = topY + 3 * step + step / 2
  const leftStubX = b.x + b.w * 0.12
  const rightStubX = b.x + b.w * 0.88

  // Draw coils (match reference style: "C" on left, mirrored "C" on right).
  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const y = topY + i * step + step / 2
    ctx.arc(leftCx, y, coilR, Math.PI / 2, -Math.PI / 2, true)
  }
  ctx.stroke()

  ctx.beginPath()
  for (let i = 0; i < 4; i++) {
    const y = topY + i * step + step / 2
    ctx.arc(rightCx, y, coilR, -Math.PI / 2, Math.PI / 2, true)
  }
  ctx.stroke()

  // Center magnetic core bars.
  const coreL = cx - b.w * 0.03
  const coreR = cx + b.w * 0.03
  ctx.beginPath()
  ctx.moveTo(coreL, topY - b.h * 0.03)
  ctx.lineTo(coreL, bottomY + b.h * 0.03)
  ctx.moveTo(coreR, topY - b.h * 0.03)
  ctx.lineTo(coreR, bottomY + b.h * 0.03)
  ctx.stroke()

  // Symbol terminal lines (no circles), like reference image.
  ctx.beginPath()
  ctx.moveTo(leftStubX, yTop)
  ctx.lineTo(leftCx - coilR, yTop)
  ctx.moveTo(leftStubX, yBottom)
  ctx.lineTo(leftCx - coilR, yBottom)
  ctx.moveTo(rightCx + coilR, yTop)
  ctx.lineTo(rightStubX, yTop)
  ctx.moveTo(rightCx + coilR, yBottom)
  ctx.lineTo(rightStubX, yBottom)
  ctx.stroke()

  // Route tile-magnet leads around the outside (avoid crossing symbol body).
  const north = leadForSide(b, 'north')
  const west = leadForSide(b, 'west')
  const east = leadForSide(b, 'east')
  const south = leadForSide(b, 'south')
  const topRailY = b.y + b.h * 0.08
  const bottomRailY = b.y + b.h * 0.92
  const leftRailX = b.x + b.w * 0.04
  const rightRailX = b.x + b.w * 0.96
  const r = Math.max(3, b.w * 0.03)

  // Helper: rounded orthogonal polyline for cleaner routing.
  const roundedRoute = (points: Array<{ x: number; y: number }>) => {
    if (points.length < 2) return
    ctx.beginPath()
    ctx.moveTo(points[0].x, points[0].y)
    for (let i = 1; i < points.length - 1; i++) {
      const p0 = points[i - 1]
      const p1 = points[i]
      const p2 = points[i + 1]
      const v1x = p1.x - p0.x
      const v1y = p1.y - p0.y
      const v2x = p2.x - p1.x
      const v2y = p2.y - p1.y
      const l1 = Math.hypot(v1x, v1y) || 1
      const l2 = Math.hypot(v2x, v2y) || 1
      const rr = Math.min(r, l1 * 0.45, l2 * 0.45)
      const a = { x: p1.x - (v1x / l1) * rr, y: p1.y - (v1y / l1) * rr }
      const b2 = { x: p1.x + (v2x / l2) * rr, y: p1.y + (v2y / l2) * rr }
      ctx.lineTo(a.x, a.y)
      ctx.quadraticCurveTo(p1.x, p1.y, b2.x, b2.y)
    }
    const last = points[points.length - 1]
    ctx.lineTo(last.x, last.y)
    ctx.stroke()
  }

  // North -> left-top symbol terminal
  roundedRoute([
    { x: north.x, y: north.y },
    { x: north.x, y: topRailY },
    { x: leftStubX, y: topRailY },
    { x: leftStubX, y: yTop },
  ])

  // West -> left-bottom symbol terminal
  roundedRoute([
    { x: west.x, y: west.y },
    { x: leftRailX, y: west.y },
    { x: leftRailX, y: yBottom },
    { x: leftStubX, y: yBottom },
  ])

  // East -> right-top symbol terminal
  roundedRoute([
    { x: east.x, y: east.y },
    { x: rightRailX, y: east.y },
    { x: rightRailX, y: yTop },
    { x: rightStubX, y: yTop },
  ])

  // South -> right-bottom symbol terminal
  roundedRoute([
    { x: south.x, y: south.y },
    { x: south.x, y: bottomRailY },
    { x: rightStubX, y: bottomRailY },
    { x: rightStubX, y: yBottom },
  ])
}

/** Soft-iron bar: flux bridge only, no circuit conductors */
function drawIronBar(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  const cy = midY(b)
  const barW = b.w * 0.82
  const barH = b.h * 0.38
  const x = b.x + (b.w - barW) / 2
  const y = cy - barH / 2
  const r = barH / 2
  ctx.save()
  ctx.fillStyle = '#8a9098'
  ctx.strokeStyle = '#c8ccd4'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + barW - r, y)
  ctx.quadraticCurveTo(x + barW, y, x + barW, y + r)
  ctx.lineTo(x + barW, y + barH - r)
  ctx.quadraticCurveTo(x + barW, y + barH, x + barW - r, y + barH)
  ctx.lineTo(x + r, y + barH)
  ctx.quadraticCurveTo(x, y + barH, x, y + barH - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.restore()
}

function ironBarLeads(): SymbolLeads {
  return {}
}

/** Diode body matches LED (triangle + cathode). Schottky uses an S-shaped cathode bar. */
function drawDiode(ctx: CanvasRenderingContext2D, b: SymbolBounds, schottky = false) {
  prep(ctx)
  const cy = midY(b)
  const halfH = b.h * 0.34
  const bodyLeft = b.x + b.w * 0.36
  const barX = b.x + b.w * 0.58

  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()

  ctx.beginPath()
  ctx.moveTo(bodyLeft, cy - halfH)
  ctx.lineTo(barX, cy)
  ctx.lineTo(bodyLeft, cy + halfH)
  ctx.closePath()
  if (schottky) {
    ctx.fill()
  } else {
    ctx.stroke()
  }

  ctx.beginPath()
  if (schottky) {
    const s = b.w * 0.09
    const mid = halfH * 0.2
    ctx.moveTo(barX, cy - halfH)
    ctx.lineTo(barX, cy - mid)
    ctx.lineTo(barX - s, cy - mid)
    ctx.lineTo(barX - s, cy + mid)
    ctx.lineTo(barX, cy + mid)
    ctx.lineTo(barX, cy + halfH)
  } else {
    ctx.moveTo(barX, cy - halfH)
    ctx.lineTo(barX, cy + halfH)
  }
  ctx.stroke()
}

function drawLedArrow(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
) {
  const angle = Math.atan2(y1 - y0, x1 - x0)
  const head = Math.max(3, Math.hypot(x1 - x0, y1 - y0) * 0.35)
  ctx.moveTo(x0, y0)
  ctx.lineTo(x1, y1)
  ctx.moveTo(x1, y1)
  ctx.lineTo(
    x1 - head * Math.cos(angle - 0.45),
    y1 - head * Math.sin(angle - 0.45),
  )
  ctx.moveTo(x1, y1)
  ctx.lineTo(
    x1 - head * Math.cos(angle + 0.45),
    y1 - head * Math.sin(angle + 0.45),
  )
}

function drawLed(ctx: CanvasRenderingContext2D, b: SymbolBounds, rgb = false) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const halfH = b.h * 0.34
  const bodyLeft = b.x + b.w * 0.36
  const barX = b.x + b.w * 0.58

  // Single lead through the diode (IEEE-style)
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()

  // Solid triangle (points right); cathode bar at the tip (right)
  ctx.beginPath()
  ctx.moveTo(bodyLeft, cy - halfH)
  ctx.lineTo(barX, cy)
  ctx.lineTo(bodyLeft, cy + halfH)
  ctx.closePath()
  ctx.fill()

  ctx.beginPath()
  ctx.moveTo(barX, cy - halfH)
  ctx.lineTo(barX, cy + halfH)
  ctx.stroke()

  // Two parallel arrows above the triangle, pointing away (up-right)
  const midDiode = (bodyLeft + barX) / 2
  const arrowY = cy - halfH - b.h * 0.12
  const arrLen = b.w * 0.1
  const arrDx = arrLen * Math.SQRT1_2
  const arrDy = -arrLen * Math.SQRT1_2
  const gap = b.w * 0.032

  ctx.beginPath()
  drawLedArrow(ctx, midDiode - gap, arrowY, midDiode - gap + arrDx, arrowY + arrDy)
  drawLedArrow(ctx, midDiode + gap, arrowY, midDiode + gap + arrDx, arrowY + arrDy)
  ctx.stroke()

  // RGB: extra north/south leads for channel pins
  if (rgb) {
    ctx.beginPath()
    ctx.moveTo(cx, cy - halfH * 0.15)
    ctx.lineTo(cx, b.y)
    ctx.moveTo(cx, cy + halfH * 0.15)
    ctx.lineTo(cx, b.y + b.h)
    ctx.stroke()
  }
}

/** Filled arrowhead on segment (x0,y0)→(x1,y1), pointing toward (x1,y1). */
function strokeArrowOnSegment(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  t = 0.5,
) {
  const ax = x0 + (x1 - x0) * t
  const ay = y0 + (y1 - y0) * t
  const dx = x1 - x0
  const dy = y1 - y0
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len
  const uy = dy / len
  const s = Math.max(5, len * 0.28)
  const px = -uy * s * 0.55
  const py = ux * s * 0.55
  ctx.beginPath()
  ctx.moveTo(ax, ay)
  ctx.lineTo(ax - ux * s + px, ay - uy * s + py)
  ctx.lineTo(ax - ux * s - px, ay - uy * s - py)
  ctx.closePath()
  ctx.fill()
}

/** NPN leads: B west + east (same node), C north, E south at tile rotation 0°. */
function npnLeads(b: SymbolBounds): SymbolLeads {
  const cy = midY(b)
  const cx = midX(b)
  const inset = Math.min(b.w, b.h) * 0.1
  return {
    west: { x: b.x, y: cy },
    east: { x: b.x + b.w, y: cy },
    north: { x: cx, y: b.y + inset },
    south: { x: cx, y: b.y + b.h - inset },
  }
}

/**
 * Standard NPN symbol (IEC): large circle encloses the junction (bar + C/E diagonals).
 * B/C/E straight leads cross the circle boundary to the tile magnets.
 */
function drawNpn(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  const cx = midX(b)
  const cy = midY(b)
  const size = Math.min(b.w, b.h)
  const r = size * 0.48
  const inset = size * 0.1
  const northY = b.y + inset
  const southY = b.y + b.h - inset

  // Junction inside the circle (bar + diagonals stay within r)
  const barX = cx - r * 0.16
  const halfH = r * 0.36
  const cBendY = cy - r * 0.52
  const eBendY = cy + r * 0.52

  prep(ctx)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  ctx.lineWidth = 3.5
  prep(ctx)
  ctx.beginPath()
  ctx.moveTo(barX, cy - halfH)
  ctx.lineTo(barX, cy + halfH)
  ctx.stroke()
  ctx.lineWidth = 2

  prep(ctx)

  // Base: full width through circle to bar (west and east magnets)
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(barX, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()

  // Collector: diagonal inside circle, then vertical to north
  ctx.beginPath()
  ctx.moveTo(barX, cy - halfH)
  ctx.lineTo(cx, cBendY)
  ctx.lineTo(cx, northY)
  ctx.stroke()

  // Emitter: diagonal inside circle (arrow outward), then vertical to south
  ctx.beginPath()
  ctx.moveTo(barX, cy + halfH)
  ctx.lineTo(cx, eBendY)
  ctx.lineTo(cx, southY)
  ctx.stroke()
  prep(ctx)
  ctx.fillStyle = STROKE
  strokeArrowOnSegment(ctx, barX, cy + halfH, cx, eBendY)

  const fs = Math.max(6, b.h * 0.19)
  const outGap = fs * 0.72
  const beside = fs * 0.82
  ctx.save()
  ctx.font = `700 ${fs}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = STROKE
  // Beside each lead, clear of the circle and not on the stroke
  ctx.fillText('B', cx - r - outGap, cy - beside)
  ctx.fillText('B', cx + r + outGap, cy - beside)
  ctx.fillText('C', cx + beside, cy - r - outGap)
  ctx.fillText('E', cx + beside, cy + r + outGap)
  ctx.restore()
}

/** NMOS leads: D west, S east, G north + south at tile rotation 0°. */
function nmosLeads(b: SymbolBounds): SymbolLeads {
  const cy = midY(b)
  const cx = midX(b)
  const inset = Math.min(b.w, b.h) * 0.1
  return {
    west: { x: b.x, y: cy },
    east: { x: b.x + b.w, y: cy },
    north: { x: cx, y: b.y + inset },
    south: { x: cx, y: b.y + b.h - inset },
  }
}

/**
 * Enhancement NMOS (IEC): circled symbol like BJT/NPN; classic G–channel–D/S layout
 * rotated 90° CCW so at 0°: west = drain, east = source, north/south = gate.
 */
function drawNmos(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  const cx = midX(b)
  const cy = midY(b)
  const size = Math.min(b.w, b.h)
  const r = size * 0.46
  const inset = size * 0.1
  const northY = b.y + inset
  const southY = b.y + b.h - inset
  const chY = cy
  const chHalfW = r * 0.36
  const chLeft = cx - chHalfW
  const chRight = cx + chHalfW
  const gateY = cy + r * 0.34
  const gateHalfW = r * 0.34
  const segW = (chRight - chLeft) / 3
  const x1 = chLeft + segW
  const x2 = chLeft + 2 * segW

  prep(ctx)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // D (west) — channel — S (east); middle segment carries the n-channel arrow
  ctx.beginPath()
  ctx.moveTo(b.x, chY)
  ctx.lineTo(chLeft, chY)
  ctx.moveTo(chLeft, chY)
  ctx.lineTo(x1, chY)
  ctx.moveTo(x1, chY)
  ctx.lineTo(x2, chY)
  ctx.moveTo(x2, chY)
  ctx.lineTo(chRight, chY)
  ctx.moveTo(chRight, chY)
  ctx.lineTo(b.x + b.w, chY)
  ctx.stroke()

  prep(ctx)
  ctx.fillStyle = STROKE
  strokeArrowOnSegment(ctx, (x1 + x2) / 2, chY, (x1 + x2) / 2, gateY - size * 0.04)

  // Gate plate (horizontal, isolated from channel by gap)
  ctx.beginPath()
  ctx.moveTo(cx - gateHalfW, gateY)
  ctx.lineTo(cx + gateHalfW, gateY)
  ctx.stroke()

  // Gate leads from both north and south magnets
  ctx.beginPath()
  ctx.moveTo(cx, northY)
  ctx.lineTo(cx, gateY)
  ctx.moveTo(cx, southY)
  ctx.lineTo(cx, gateY)
  ctx.stroke()

  const fs = Math.max(6, b.h * 0.19)
  const outGap = fs * 0.72
  const beside = fs * 0.82
  ctx.save()
  ctx.font = `700 ${fs}px system-ui, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = STROKE
  ctx.fillText('D', cx - r - outGap, chY - beside)
  ctx.fillText('S', cx + r + outGap, chY - beside)
  ctx.fillText('G', cx - beside, cy - r - outGap)
  ctx.fillText('G', cx - beside, cy + r + outGap)
  ctx.restore()
}

function drawPot(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  drawResistor(ctx, b)
  prep(ctx)
  const cx = midX(b)
  const cy = midY(b)
  ctx.beginPath()
  ctx.moveTo(cx, b.y + b.h)
  ctx.lineTo(cx, cy + b.h * 0.1)
  ctx.moveTo(cx, cy + b.h * 0.1)
  ctx.lineTo(cx + b.w * 0.12, cy - b.h * 0.05)
  ctx.stroke()
}

function drawSpdt(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - b.w * 0.05, cy)
  ctx.moveTo(b.x + b.w, cy)
  ctx.lineTo(cx + b.w * 0.05, cy)
  ctx.moveTo(cx, b.y + b.h)
  ctx.lineTo(cx - b.w * 0.05, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(cx - b.w * 0.05, cy, 3, 0, Math.PI * 2)
  ctx.fill()
}

function drawButton(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const gap = b.w * 0.08
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - gap, cy)
  ctx.moveTo(cx + gap, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - gap, cy - b.h * 0.25)
  ctx.lineTo(cx + gap, cy - b.h * 0.35)
  ctx.stroke()
}

function drawSensorResistive(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  drawResistor(ctx, b)
  prep(ctx)
  const cx = midX(b)
  const cy = midY(b)
  ctx.beginPath()
  ctx.arc(cx, cy - b.h * 0.35, b.w * 0.08, 0, Math.PI * 2)
  ctx.stroke()
  for (let i = -1; i <= 1; i++) {
    ctx.moveTo(cx + b.w * 0.12, cy - b.h * 0.35 + i * 3)
    ctx.lineTo(cx + b.w * 0.22 + i * 2, cy - b.h * 0.45)
  }
  ctx.stroke()
}

/** Photoresistor: circle + zigzag, horizontal leads, incoming light arrows (IEC-style). */
function drawLdr(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const r = Math.min(b.w * 0.4, b.h * 0.44)

  const drawLightArrow = (x0: number, y0: number, x1: number, y1: number) => {
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x1, y1)
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const ux = dx / len
    const uy = dy / len
    const ah = Math.min(5, len * 0.28)
    const px = -uy
    const py = ux
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - ux * ah + px * ah * 0.45, y1 - uy * ah + py * ah * 0.45)
    ctx.moveTo(x1, y1)
    ctx.lineTo(x1 - ux * ah - px * ah * 0.45, y1 - uy * ah - py * ah * 0.45)
    ctx.stroke()
  }

  const arrowTipX = cx - r * 0.05
  const arrowTipY = cy - r * 0.75
  const arrowGap = r * 0.14
  drawLightArrow(
    cx - r * 1.15 - arrowGap,
    cy - r * 1.45,
    arrowTipX - arrowGap * 0.35,
    arrowTipY,
  )
  drawLightArrow(
    cx - r * 1.15 + arrowGap,
    cy - r * 1.45,
    arrowTipX + arrowGap * 0.35,
    arrowTipY,
  )

  const x0 = cx - r * 0.58
  const x1 = cx + r * 0.58
  const amp = r * 0.3
  const steps = 3
  const dxz = (x1 - x0) / steps

  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - r, cy)
  ctx.moveTo(cx - r, cy)
  ctx.lineTo(x0, cy)
  for (let i = 0; i < steps; i++) {
    const x = x0 + dxz * i + dxz / 2
    const y = cy + (i % 2 === 0 ? -amp : amp)
    ctx.lineTo(x, y)
  }
  ctx.lineTo(x1, cy)
  ctx.lineTo(cx + r, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
}

function drawSensor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const w = b.w * 0.35
  const h = b.h * 0.5
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h)
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - w / 2, cy)
  ctx.moveTo(cx + w / 2, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
}

/** Slotted opto: N/S = IR LED (L+/L−), W/E = phototransistor (S+/S−). */
function drawOpticalInterrupt(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const w = b.w * 0.58
  const h = b.h * 0.5
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  const gap = w * 0.22
  ctx.strokeRect(x0, y0, w, h)
  ctx.beginPath()
  ctx.moveTo(cx - gap / 2, y0)
  ctx.lineTo(cx - gap / 2, y0 + h)
  ctx.moveTo(cx + gap / 2, y0)
  ctx.lineTo(cx + gap / 2, y0 + h)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, b.y)
  ctx.lineTo(cx, y0)
  ctx.moveTo(cx, y0 + h)
  ctx.lineTo(cx, b.y + b.h)
  ctx.moveTo(b.x, cy)
  ctx.lineTo(x0, cy)
  ctx.moveTo(x0 + w, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
  const ledSize = Math.max(6, Math.min(b.h * 0.2, b.w * 0.12))
  const sigSize = Math.max(5, ledSize * 0.88)
  ctx.save()
  ctx.fillStyle = STROKE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${ledSize}px system-ui, sans-serif`
  const lPlusY = b.y + (y0 - b.y) * 0.35
  const lMinusY = y0 + h + (b.y + b.h - (y0 + h)) * 0.65
  ctx.fillText('L+', cx, lPlusY)
  ctx.fillText('L-', cx, lMinusY)
  ctx.font = `700 ${sigSize}px system-ui, sans-serif`
  ctx.fillText('S+', x0 + w * 0.22, cy)
  ctx.fillText('S-', x0 + w * 0.78, cy)
  ctx.restore()
}

/** Port labels (fixed to pin names; tile rotation moves magnets, not labels). */
export const OPTICAL_PORT_LABELS: Partial<Record<Side, string>> = {
  north: 'L+',
  south: 'L-',
  west: 'S+',
  east: 'S-',
}

/** Hall IC: north +, south −, west/east SIG (labels stay inside the band). */
function drawHallSensor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const w = b.w * 0.52
  const h = b.h * 0.72
  const x0 = cx - w / 2
  const y0 = cy - h / 2
  ctx.strokeRect(x0, y0, w, h)
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(x0, cy)
  ctx.moveTo(x0 + w, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.moveTo(cx, b.y)
  ctx.lineTo(cx, y0)
  ctx.moveTo(cx, y0 + h)
  ctx.lineTo(cx, b.y + b.h)
  ctx.stroke()
  const markSize = Math.max(7, Math.min(b.h * 0.42, b.w * 0.22))
  const sigSize = Math.max(6, markSize * 0.82)
  ctx.save()
  ctx.fillStyle = STROKE
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `700 ${markSize}px system-ui, sans-serif`
  ctx.fillText('+', cx, y0 + h * 0.2)
  ctx.fillText('−', cx, y0 + h * 0.8)
  ctx.font = `700 ${sigSize}px system-ui, sans-serif`
  ctx.fillText('SIG', x0 + w * 0.22, cy)
  ctx.fillText('SIG', x0 + w * 0.78, cy)
  ctx.restore()
}

/** Port labels (fixed to pin names; tile rotation moves magnets, not labels). */
export const HALL_PORT_LABELS: Partial<Record<Side, string>> = {
  north: '+',
  south: '−',
  west: 'SIG',
  east: 'SIG',
}

function drawMotor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const r = Math.min(b.w, b.h) * 0.34
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - r, cy)
  ctx.moveTo(cx + r, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.font = `bold ${r * 1.15}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('M', cx, cy + 1)
}

/** Vibration motor: motor circle with off-center eccentric weight (no polarity). */
function drawVibrationMotor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const r = Math.min(b.w, b.h) * 0.32
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - r, cy)
  ctx.moveTo(cx + r, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()

  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  const weightR = r * 0.22
  const weightX = cx + r * 0.42
  const weightY = cy - r * 0.12
  ctx.beginPath()
  ctx.arc(weightX, weightY, weightR, 0, Math.PI * 2)
  ctx.fillStyle = STROKE
  ctx.fill()
  ctx.stroke()
}

function drawBuzzer(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  drawMotor(ctx, b)
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  for (let i = 0; i < 3; i++) {
    ctx.beginPath()
    ctx.arc(cx + b.w * 0.2 + i * 5, cy - b.h * 0.35, 3 + i * 2, -Math.PI / 3, Math.PI / 3)
    ctx.stroke()
  }
}

function drawSpeaker(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const westMag = leadForSide(b, 'west')
  const eastMag = leadForSide(b, 'east')

  // Proportions: compact width, taller profile, centered in tile.
  const leadYTop = cy - b.h * 0.24
  const leadYBot = cy + b.h * 0.24
  const leadX0 = b.x + b.w * 0.31
  const bodyLeft = b.x + b.w * 0.47
  const bodyRight = b.x + b.w * 0.505
  const coneLeft = bodyRight
  const coneRight = b.x + b.w * 0.69
  const coneTop = cy - b.h * 0.48
  const coneBot = cy + b.h * 0.48
  const bodyTop = cy - b.h * 0.28
  const bodyBot = cy + b.h * 0.28
  const wireTopY = cy - b.h * 0.56
  const wireBotY = cy + b.h * 0.72
  const westWireX = b.x + b.w * 0.22
  const eastWireX = b.x + b.w * 0.78

  // Magnet leads -> symbol terminal legs, routed around symbol.
  ctx.beginPath()
  ctx.moveTo(westMag.x, westMag.y)
  ctx.lineTo(leadX0, westMag.y)
  ctx.lineTo(leadX0, leadYTop)
  ctx.moveTo(eastMag.x, eastMag.y)
  ctx.lineTo(eastWireX, eastMag.y)
  ctx.lineTo(eastWireX, wireBotY)
  ctx.lineTo(leadX0, wireBotY)
  ctx.lineTo(leadX0, leadYBot)
  ctx.stroke()

  // Symbol terminal legs into driver.
  ctx.beginPath()
  ctx.moveTo(leadX0, leadYTop)
  ctx.lineTo(bodyLeft, leadYTop)
  ctx.moveTo(leadX0, leadYBot)
  ctx.lineTo(bodyLeft, leadYBot)
  ctx.stroke()

  // Driver rectangle.
  ctx.beginPath()
  ctx.rect(bodyLeft, bodyTop, bodyRight - bodyLeft, bodyBot - bodyTop)
  ctx.stroke()

  // Cone (open on left at driver).
  ctx.beginPath()
  ctx.moveTo(coneLeft, bodyTop)
  ctx.lineTo(coneRight, coneTop)
  ctx.lineTo(coneRight, coneBot)
  ctx.lineTo(coneLeft, bodyBot)
  ctx.stroke()
}

function drawTouchPad(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const w = b.w * 0.4
  const h = b.h * 0.45
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h)
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - w / 2, cy)
  ctx.moveTo(cx + w / 2, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
}

function drawGroundBars(ctx: CanvasRenderingContext2D, cx: number, cy: number, b: SymbolBounds) {
  const w = b.w * 0.36
  for (let i = 0; i < 3; i++) {
    const y = cy + i * (b.h * 0.12)
    const ww = w - i * (b.w * 0.08)
    ctx.moveTo(cx - ww / 2, y)
    ctx.lineTo(cx + ww / 2, y)
  }
}

/** Ground tile: GND symbol only; single magnet is on the underside (drawn in drawTile) */
function drawGroundTile(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cx = midX(b)
  const barY = b.y + b.h * 0.55
  ctx.beginPath()
  ctx.moveTo(cx, b.y + b.h * 0.12)
  ctx.lineTo(cx, barY - b.h * 0.08)
  drawGroundBars(ctx, cx, barY, b)
  ctx.stroke()
}

function drawGround(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  ctx.beginPath()
  drawGroundBars(ctx, cx, cy, b)
  ctx.stroke()
}

function defaultLeadsGroundTile(b: SymbolBounds): SymbolLeads {
  const cx = midX(b)
  return { north: { x: cx, y: b.y } }
}

function drawPower(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  ctx.font = `bold ${b.h * 0.55}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', cx - b.w * 0.12, cy)
  ctx.strokeRect(cx - b.w * 0.05, cy - b.h * 0.3, b.w * 0.35, b.h * 0.6)
  ctx.font = `${b.h * 0.22}px system-ui,sans-serif`
  ctx.fillText('USB', cx + b.w * 0.12, cy + b.h * 0.15)
}

/** Power tile: USB/V+ symbol; single underside magnet for plate ground (drawn in drawTile) */
function drawPowerTile(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const rectW = b.w * 0.3
  const rectH = b.h * 0.52
  const rectX = cx - rectW / 2
  const rectY = cy - rectH / 2
  ctx.font = `bold ${b.h * 0.5}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', rectX - b.w * 0.07, cy)
  ctx.strokeRect(rectX, rectY, rectW, rectH)
  ctx.font = `${b.h * 0.2}px system-ui,sans-serif`
  ctx.fillText('USB', cx, cy)
  ctx.beginPath()
  ctx.moveTo(cx, rectY + rectH)
  ctx.lineTo(cx, b.y + b.h * 0.92)
  ctx.stroke()
}

function defaultLeadsPowerTile(b: SymbolBounds): SymbolLeads {
  const cx = midX(b)
  return { south: { x: cx, y: b.y + b.h } }
}

function drawArduino(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const w = b.w * 0.55
  const h = b.h * 0.65
  ctx.strokeRect(cx - w / 2, cy - h / 2, w, h)
  const pins = 4
  for (let i = 0; i < pins; i++) {
    const t = (i + 1) / (pins + 1)
    const px = cx - w / 2 + w * t
    const py = cy - h / 2 + h * t
    ctx.beginPath()
    ctx.moveTo(cx - w / 2 - b.w * 0.08, py)
    ctx.lineTo(cx - w / 2, py)
    ctx.moveTo(cx + w / 2, py)
    ctx.lineTo(cx + w / 2 + b.w * 0.08, py)
    ctx.moveTo(px, cy - h / 2 - b.h * 0.08)
    ctx.lineTo(px, cy - h / 2)
    ctx.moveTo(px, cy + h / 2)
    ctx.lineTo(px, cy + h / 2 + b.h * 0.08)
    ctx.stroke()
  }
}

const DRAWERS: Record<SymbolId, (ctx: CanvasRenderingContext2D, b: SymbolBounds) => void> = {
  resistor: drawResistor,
  capacitor: drawCapacitor,
  inductor: drawInductor,
  transformer: drawTransformer,
  iron_bar: drawIronBar,
  diode: (ctx, b) => drawDiode(ctx, b, true),
  led: (ctx, b) => drawLed(ctx, b, false),
  led_rgb: (ctx, b) => drawLed(ctx, b, true),
  npn: drawNpn,
  nmos: drawNmos,
  potentiometer: drawPot,
  switch_spdt: drawSpdt,
  switch_momentary: drawButton,
  sensor_resistive: drawSensorResistive,
  ldr: drawLdr,
  sensor: drawSensor,
  sensor_north: drawSensor,
  hall_sensor: drawHallSensor,
  optical_interrupt: drawOpticalInterrupt,
  motor: drawMotor,
  vibration_motor: drawVibrationMotor,
  buzzer: drawBuzzer,
  speaker: drawSpeaker,
  touch_pad: drawTouchPad,
  ground: drawGround,
  ground_tile: drawGroundTile,
  power: drawPower,
  power_tile: drawPowerTile,
  arduino: drawArduino,
}

const LEAD_GETTERS: Record<SymbolId, (b: SymbolBounds) => SymbolLeads> = {
  resistor: defaultLeads2,
  capacitor: defaultLeads2,
  inductor: defaultLeads2,
  transformer: defaultLeads4,
  iron_bar: ironBarLeads,
  diode: defaultLeads2,
  led: defaultLeads2,
  led_rgb: defaultLeads4,
  npn: npnLeads,
  nmos: nmosLeads,
  potentiometer: defaultLeads3,
  switch_spdt: defaultLeads3,
  switch_momentary: defaultLeads2,
  sensor_resistive: defaultLeads2,
  ldr: defaultLeads2,
  sensor: defaultLeads2,
  sensor_north: defaultLeadsNorth,
  hall_sensor: defaultLeads4,
  optical_interrupt: defaultLeads4,
  motor: defaultLeads2,
  vibration_motor: defaultLeads2,
  buzzer: defaultLeads2,
  speaker: defaultLeads2,
  touch_pad: defaultLeads2,
  ground: defaultLeads4,
  ground_tile: defaultLeadsGroundTile,
  power: defaultLeads4,
  power_tile: defaultLeadsPowerTile,
  arduino: defaultLeads4,
}

export function drawSymbol(
  ctx: CanvasRenderingContext2D,
  id: SymbolId,
  bounds: SymbolBounds,
) {
  DRAWERS[id](ctx, bounds)
}

export function getSymbolLeads(id: SymbolId, bounds: SymbolBounds): SymbolLeads {
  return LEAD_GETTERS[id](bounds)
}
