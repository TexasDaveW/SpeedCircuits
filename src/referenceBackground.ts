/** Faded so tiles and emphasized grid stay readable underneath. */
export const REFERENCE_OPACITY_UNDERNEATH = 0.38
/** Stronger when drawn on top of tiles for tracing the schematic. */
export const REFERENCE_OPACITY_ABOVE = 0.85
export const REFERENCE_SCALE_MIN = 0.05
export const REFERENCE_SCALE_MAX = 3
export const REFERENCE_SCALE_STEP = 0.05
export const REFERENCE_SCALE_COARSE_STEP = 0.2
export const REFERENCE_PAN_STEP = 12
export const REFERENCE_PAN_COARSE_STEP = 48

export type ReferenceOffset = { x: number; y: number }

export const REFERENCE_OFFSET_ZERO: ReferenceOffset = { x: 0, y: 0 }

export type ReferenceScale = { x: number; y: number }

export const REFERENCE_SCALE_ONE: ReferenceScale = { x: 1, y: 1 }

export type ReferenceLayer = 'hidden' | 'underneath' | 'above'

export function nextReferenceLayer(current: ReferenceLayer): ReferenceLayer {
  if (current === 'hidden') return 'underneath'
  if (current === 'underneath') return 'above'
  return 'hidden'
}

export function referenceLayerButtonLabel(
  layer: ReferenceLayer,
  hasImage: boolean,
): string {
  if (!hasImage) return 'Move Back'
  if (layer === 'hidden') return 'Move Back'
  if (layer === 'underneath') return 'Move Top'
  return 'Hide'
}

export function referenceLayerStatusMessage(layer: ReferenceLayer): string {
  if (layer === 'hidden') return 'Reference hidden.'
  if (layer === 'underneath') return 'Reference shown behind tiles.'
  return 'Reference shown above tiles.'
}

export function isReferenceLayerVisible(layer: ReferenceLayer): boolean {
  return layer !== 'hidden'
}

export function referenceOpacityForLayer(layer: ReferenceLayer): number {
  return layer === 'above' ? REFERENCE_OPACITY_ABOVE : REFERENCE_OPACITY_UNDERNEATH
}

export function clampReferenceScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.min(REFERENCE_SCALE_MAX, Math.max(REFERENCE_SCALE_MIN, scale))
}

/** Uniform number (legacy) or partial `{ x?, y? }` → finite `{ x, y }`. */
export function normalizeReferenceScale(scale: unknown): ReferenceScale {
  if (typeof scale === 'number') {
    const v = clampReferenceScale(scale)
    return { x: v, y: v }
  }
  if (scale && typeof scale === 'object') {
    const o = scale as { x?: unknown; y?: unknown }
    const xRaw = o.x
    const yRaw = o.y
    const x =
      typeof xRaw === 'number' && Number.isFinite(xRaw)
        ? clampReferenceScale(xRaw)
        : typeof yRaw === 'number' && Number.isFinite(yRaw)
          ? clampReferenceScale(yRaw)
          : 1
    const y =
      typeof yRaw === 'number' && Number.isFinite(yRaw)
        ? clampReferenceScale(yRaw)
        : x
    return { x, y }
  }
  return REFERENCE_SCALE_ONE
}

export function applyReferenceScaleDelta(
  scale: unknown,
  deltaX: number,
  deltaY: number,
): ReferenceScale {
  const s = normalizeReferenceScale(scale)
  return {
    x: clampReferenceScale(s.x + deltaX),
    y: clampReferenceScale(s.y + deltaY),
  }
}

/** Size to fit `srcW`×`srcH` inside `boxW`×`boxH` preserving aspect ratio. */
export function containFitSize(
  srcW: number,
  srcH: number,
  boxW: number,
  boxH: number,
): { w: number; h: number } {
  if (srcW <= 0 || srcH <= 0) return { w: boxW, h: boxH }
  const scale = Math.min(boxW / srcW, boxH / srcH)
  return { w: srcW * scale, h: srcH * scale }
}

function imagePixelSize(img: CanvasImageSource): { w: number; h: number } {
  if (img instanceof HTMLImageElement) {
    const w = img.naturalWidth || img.width
    const h = img.naturalHeight || img.height
    return { w, h }
  }
  if (img instanceof HTMLCanvasElement || img instanceof ImageBitmap) {
    return { w: img.width, h: img.height }
  }
  if (img instanceof HTMLVideoElement) {
    return {
      w: img.videoWidth || img.width,
      h: img.videoHeight || img.height,
    }
  }
  return { w: 0, h: 0 }
}

export function drawReferenceBackground(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  plateW: number,
  plateH: number,
  scale: ReferenceScale = REFERENCE_SCALE_ONE,
  offset: ReferenceOffset = REFERENCE_OFFSET_ZERO,
  opacity = REFERENCE_OPACITY_UNDERNEATH,
) {
  const { x: sx, y: sy } = normalizeReferenceScale(scale)
  const { w: nw, h: nh } = imagePixelSize(img)
  const fit = containFitSize(nw, nh, plateW, plateH)
  const w = fit.w * sx
  const h = fit.h * sy
  const x = (plateW - w) / 2 + offset.x
  const y = (plateH - h) / 2 + offset.y
  ctx.save()
  ctx.globalAlpha = opacity
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()
}

export function formatReferenceScalePercent(scale: number): string {
  const n = Number.isFinite(scale) ? scale : 1
  return `${Math.round(n * 100)}%`
}

export function formatReferenceScalePair(scale: unknown): string {
  const s = normalizeReferenceScale(scale)
  return `${formatReferenceScalePercent(s.x)} × ${formatReferenceScalePercent(s.y)}`
}
