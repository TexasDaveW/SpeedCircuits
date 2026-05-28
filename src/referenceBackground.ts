export const REFERENCE_OPACITY = 0.38
export const REFERENCE_SCALE_MIN = 0.25
export const REFERENCE_SCALE_MAX = 3
export const REFERENCE_SCALE_STEP = 0.05
export const REFERENCE_SCALE_COARSE_STEP = 0.2
export const REFERENCE_PAN_STEP = 12
export const REFERENCE_PAN_COARSE_STEP = 48

export type ReferenceOffset = { x: number; y: number }

export const REFERENCE_OFFSET_ZERO: ReferenceOffset = { x: 0, y: 0 }

export function clampReferenceScale(scale: number): number {
  return Math.min(REFERENCE_SCALE_MAX, Math.max(REFERENCE_SCALE_MIN, scale))
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
  scaleMultiplier: number,
  offset: ReferenceOffset = REFERENCE_OFFSET_ZERO,
) {
  const { w: nw, h: nh } = imagePixelSize(img)
  const fit = containFitSize(nw, nh, plateW, plateH)
  const w = fit.w * scaleMultiplier
  const h = fit.h * scaleMultiplier
  const x = (plateW - w) / 2 + offset.x
  const y = (plateH - h) / 2 + offset.y
  ctx.save()
  ctx.globalAlpha = REFERENCE_OPACITY
  ctx.drawImage(img, x, y, w, h)
  ctx.restore()
}

export function formatReferenceScalePercent(scale: number): string {
  return `${Math.round(scale * 100)}%`
}
