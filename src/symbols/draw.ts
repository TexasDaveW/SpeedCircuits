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

function drawDiode(ctx: CanvasRenderingContext2D, b: SymbolBounds, schottky = false) {
  prep(ctx)
  const cy = midY(b)
  const tip = b.x + b.w * 0.58
  const base = b.x + b.w * 0.42
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(base, cy)
  ctx.lineTo(tip, cy - b.h * 0.35)
  ctx.lineTo(tip, cy + b.h * 0.35)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(base, cy - b.h * 0.35)
  ctx.lineTo(base, cy + b.h * 0.35)
  ctx.moveTo(tip, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()
  if (schottky) {
    ctx.beginPath()
    ctx.moveTo(base - b.w * 0.06, cy - b.h * 0.2)
    ctx.lineTo(base - b.w * 0.12, cy - b.h * 0.2)
    ctx.stroke()
  }
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
  const base = b.x + b.w * 0.4
  const tip = b.x + b.w * 0.58
  const halfH = b.h * 0.36

  // Anode/cathode leads into diode body
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(base, cy)
  ctx.moveTo(tip, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.stroke()

  // Diode triangle (anode → cathode, left to right)
  ctx.beginPath()
  ctx.moveTo(base, cy)
  ctx.lineTo(tip, cy - halfH)
  ctx.lineTo(tip, cy + halfH)
  ctx.closePath()
  ctx.stroke()

  // Cathode bar
  ctx.beginPath()
  ctx.moveTo(base, cy - halfH)
  ctx.lineTo(base, cy + halfH)
  ctx.stroke()

  // Light emission arrows (up-right and down-right from cathode)
  const arrLen = b.w * 0.14
  const arrX = tip + b.w * 0.04
  ctx.beginPath()
  drawLedArrow(ctx, arrX, cy - halfH * 0.35, arrX + arrLen, cy - halfH * 0.35 - arrLen * 0.85)
  drawLedArrow(ctx, arrX, cy + halfH * 0.35, arrX + arrLen, cy + halfH * 0.35 + arrLen * 0.85)
  ctx.stroke()

  // RGB: four conductors — west/east main diode, north common, south channel
  if (rgb) {
    ctx.beginPath()
    ctx.moveTo(cx, cy - halfH * 0.15)
    ctx.lineTo(cx, b.y)
    ctx.moveTo(cx, cy + halfH * 0.15)
    ctx.lineTo(cx, b.y + b.h)
    ctx.stroke()
  }
}

function drawNpn(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const bx = b.x + b.w * 0.55
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(bx - b.w * 0.08, cy)
  ctx.moveTo(b.x + b.w, cy)
  ctx.lineTo(bx + b.w * 0.08, cy)
  ctx.moveTo(cx, b.y + b.h)
  ctx.lineTo(bx, cy + b.h * 0.12)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bx - b.w * 0.08, cy - b.h * 0.28)
  ctx.lineTo(bx + b.w * 0.08, cy)
  ctx.lineTo(bx - b.w * 0.08, cy + b.h * 0.28)
  ctx.closePath()
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(bx + b.w * 0.08, cy)
  ctx.lineTo(bx + b.w * 0.2, cy - b.h * 0.08)
  ctx.stroke()
}

function drawNmos(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const gx = b.x + b.w * 0.48
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(gx, cy)
  ctx.moveTo(b.x + b.w, cy)
  ctx.lineTo(gx + b.w * 0.22, cy)
  ctx.moveTo(cx, b.y + b.h)
  ctx.lineTo(gx, cy + b.h * 0.15)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(gx, cy - b.h * 0.3)
  ctx.lineTo(gx, cy + b.h * 0.3)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(gx + b.w * 0.22, cy - b.h * 0.3)
  ctx.lineTo(gx + b.w * 0.22, cy + b.h * 0.3)
  ctx.stroke()
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

function drawMotor(ctx: CanvasRenderingContext2D, b: SymbolBounds) {
  prep(ctx)
  const cy = midY(b)
  const cx = midX(b)
  const r = Math.min(b.w, b.h) * 0.22
  ctx.beginPath()
  ctx.moveTo(b.x, cy)
  ctx.lineTo(cx - r, cy)
  ctx.moveTo(cx + r, cy)
  ctx.lineTo(b.x + b.w, cy)
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.font = `bold ${r}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('M', cx, cy + 1)
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
  ctx.font = `bold ${b.h * 0.5}px system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('+', cx - b.w * 0.1, cy - b.h * 0.05)
  ctx.strokeRect(cx - b.w * 0.04, cy - b.h * 0.28, b.w * 0.32, b.h * 0.55)
  ctx.font = `${b.h * 0.2}px system-ui,sans-serif`
  ctx.fillText('USB', cx + b.w * 0.14, cy + b.h * 0.08)
  ctx.beginPath()
  ctx.moveTo(cx, cy + b.h * 0.32)
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
  diode: (ctx, b) => drawDiode(ctx, b, true),
  led: (ctx, b) => drawLed(ctx, b, false),
  led_rgb: (ctx, b) => drawLed(ctx, b, true),
  npn: drawNpn,
  nmos: drawNmos,
  potentiometer: drawPot,
  switch_spdt: drawSpdt,
  switch_momentary: drawButton,
  sensor_resistive: drawSensorResistive,
  sensor: drawSensor,
  sensor_north: drawSensor,
  motor: drawMotor,
  buzzer: drawBuzzer,
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
  diode: defaultLeads2,
  led: defaultLeads2,
  led_rgb: defaultLeads4,
  npn: defaultLeads3,
  nmos: defaultLeads3,
  potentiometer: defaultLeads3,
  switch_spdt: defaultLeads3,
  switch_momentary: defaultLeads2,
  sensor_resistive: defaultLeads2,
  sensor: defaultLeads2,
  sensor_north: defaultLeadsNorth,
  motor: defaultLeads2,
  buzzer: defaultLeads2,
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
