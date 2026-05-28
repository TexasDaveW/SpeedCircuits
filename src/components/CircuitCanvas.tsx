import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { catalogById, GRID_CELL } from '../catalog'
import { drawPlate, drawTile } from '../drawTile'
import { nextRotation } from '../geometry'
import {
  inPlateBounds,
  PLATE_COLS,
  PLATE_PIVOT_GRID_X,
  PLATE_PIVOT_GRID_Y,
  PLATE_ROWS,
} from '../plate'
import { canMoveGroup, moveGroupFromOrigins, tilesInWorldRect } from '../selection'
import type { TileClipboard } from '../tileClipboard'
import type { CatalogEntry, PlacedTile, Rotation } from '../types'

const PLATE_W = PLATE_COLS * GRID_CELL
const PLATE_H = PLATE_ROWS * GRID_CELL
const MARQUEE_MIN_PX = 6
const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_MAX_MOVE_PX = 10

const PLATE_CENTER = {
  x: PLATE_PIVOT_GRID_X * GRID_CELL,
  y: PLATE_PIVOT_GRID_Y * GRID_CELL,
}

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

function rotateWorldPoint(
  x: number,
  y: number,
  rotation: Rotation,
): { x: number; y: number } {
  const dx = x - PLATE_CENTER.x
  const dy = y - PLATE_CENTER.y
  switch (rotation) {
    case 0:
      return { x, y }
    case 90:
      return { x: PLATE_CENTER.x - dy, y: PLATE_CENTER.y + dx }
    case 180:
      return { x: PLATE_CENTER.x - dx, y: PLATE_CENTER.y - dy }
    case 270:
      return { x: PLATE_CENTER.x + dy, y: PLATE_CENTER.y - dx }
  }
}

function inverseRotation(rotation: Rotation): Rotation {
  return ((360 - rotation) % 360) as Rotation
}

function rotatedPlateBounds(rotation: Rotation): {
  minX: number
  minY: number
  width: number
  height: number
} {
  const corners = [
    rotateWorldPoint(0, 0, rotation),
    rotateWorldPoint(PLATE_W, 0, rotation),
    rotateWorldPoint(PLATE_W, PLATE_H, rotation),
    rotateWorldPoint(0, PLATE_H, rotation),
  ]
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return { minX, minY, width: maxX - minX, height: maxY - minY }
}

/** Keep the world point under (localX, localY) fixed while changing zoom. */
function computeZoomAtLocal(
  localX: number,
  localY: number,
  z: number,
  p: { x: number; y: number },
  _viewRotation: Rotation,
  opts: { multiply?: number; target?: number },
) {
  const nz =
    opts.target != null ? clampZoom(opts.target) : clampZoom(z * (opts.multiply ?? 1))
  const viewX = (localX - p.x) / z
  const viewY = (localY - p.y) / z
  return {
    zoom: nz,
    pan: { x: localX - viewX * nz, y: localY - viewY * nz },
  }
}

interface CircuitCanvasProps {
  tiles: PlacedTile[]
  /** Bumped when a circuit is loaded or cleared so view rotation can reset without React state on every G press. */
  canvasRevision: number
  loadViewRotation: Rotation
  selectedIds: string[]
  pendingCatalogId: string | null
  tileClipboard: TileClipboard | null
  pasteTarget: { gx: number; gy: number } | null
  onPasteTargetChange: (target: { gx: number; gy: number } | null) => void
  onPasteAtCell: (gx: number, gy: number) => boolean
  onTileClipboardChange: (clipboard: TileClipboard) => void
  onTilesChange: (tiles: PlacedTile[]) => void
  /** Ref-only sync for save/export; must not call setState synchronously on G. */
  onViewRotationChange?: (rotation: Rotation) => void
  onRemoveTiles: (instanceIds: string[]) => void
  onSelectionChange: (ids: string[]) => void
  onPendingClear: () => void
}

function screenToGrid(
  sx: number,
  sy: number,
  panX: number,
  panY: number,
  zoom: number,
  viewRotation: Rotation,
  rect: DOMRect,
): { gx: number; gy: number } | null {
  const world = screenToWorld(sx, sy, panX, panY, zoom, viewRotation, rect)
  const gx = Math.floor(world.x / GRID_CELL)
  const gy = Math.floor(world.y / GRID_CELL)
  if (!inPlateBounds(gx, gy)) return null
  return { gx, gy }
}

function screenToWorld(
  sx: number,
  sy: number,
  panX: number,
  panY: number,
  zoom: number,
  viewRotation: Rotation,
  rect: DOMRect,
): { x: number; y: number } {
  const viewX = (sx - rect.left - panX) / zoom
  const viewY = (sy - rect.top - panY) / zoom
  return rotateWorldPoint(viewX, viewY, inverseRotation(viewRotation))
}

function worldToScreen(
  x: number,
  y: number,
  pan: { x: number; y: number },
  zoom: number,
  viewRotation: Rotation,
): { x: number; y: number } {
  const view = rotateWorldPoint(x, y, viewRotation)
  return { x: pan.x + view.x * zoom, y: pan.y + view.y * zoom }
}

type DragState =
  | { kind: 'pan'; startX: number; startY: number; panX: number; panY: number }
  | {
      kind: 'tile'
      instanceId: string
      startScreenX: number
      startScreenY: number
      pointerOffsetX: number
      pointerOffsetY: number
      screenOffsetX: number
      screenOffsetY: number
    }
  | {
      kind: 'group'
      startX: number
      startY: number
      startScreenX: number
      startScreenY: number
      origins: Map<string, { gridX: number; gridY: number }>
    }
  | {
      kind: 'marquee'
      startX: number
      startY: number
      addToSelection: boolean
      pendingClick?: { kind: 'place' | 'paste'; gx: number; gy: number }
    }
  | { kind: 'rotateTap'; instanceId: string }
  | { kind: 'place'; catalogId: string }

type SmoothDragState =
  | {
      kind: 'tile'
      instanceId: string
      x: number
      y: number
      screenX: number
      screenY: number
      targetGx: number
      targetGy: number
      valid: boolean
    }
  | {
      kind: 'group'
      instanceIds: string[]
      origins: Map<string, { gridX: number; gridY: number }>
      dxWorld: number
      dyWorld: number
      dxScreen: number
      dyScreen: number
      targetDx: number
      targetDy: number
      valid: boolean
    }

type PlacementPreviewState = {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
  grid: { gx: number; gy: number } | null
}

type MarqueeState = {
  x0: number
  y0: number
  x1: number
  y1: number
}

type RotationFastPaint = {
  instanceId: string
  gridX: number
  gridY: number
  entry: CatalogEntry
  rotation: Rotation
}

const DRAG_SNAPSHOT_MOVE_PX = 4

type ZoomPreviewState = {
  baseZoom: number
  basePan: { x: number; y: number }
  commitTimer: number | null
}

export const CircuitCanvas = memo(function CircuitCanvas({
  tiles,
  canvasRevision,
  loadViewRotation,
  selectedIds,
  pendingCatalogId,
  tileClipboard,
  pasteTarget,
  onPasteTargetChange,
  onPasteAtCell,
  onTileClipboardChange,
  onTilesChange,
  onViewRotationChange,
  onRemoveTiles,
  onSelectionChange,
  onPendingClear,
}: CircuitCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 80, y: 60 })
  const viewRotationRef = useRef(loadViewRotation)
  const pendingCatalogIdRef = useRef<string | null>(null)
  const tileClipboardRef = useRef<TileClipboard | null>(null)
  const onTileClipboardChangeRef = useRef(onTileClipboardChange)
  const onTilesChangeRef = useRef(onTilesChange)
  const tilesRef = useRef(tiles)
  const placementRotationRef = useRef<Rotation>(0)
  const lastWheelAtRef = useRef(0)

  useEffect(() => {
    zoomRef.current = zoom
    panRef.current = pan
  }, [zoom, pan])

  const [placementRotation, setPlacementRotation] = useState<Rotation>(0)
  const hoverCellRef = useRef<{ gx: number; gy: number } | null>(null)
  const placementPreviewRef = useRef<PlacementPreviewState | null>(null)

  useEffect(() => {
    pendingCatalogIdRef.current = pendingCatalogId
  }, [pendingCatalogId])

  useEffect(() => {
    tileClipboardRef.current = tileClipboard
  }, [tileClipboard])

  useEffect(() => {
    onTileClipboardChangeRef.current = onTileClipboardChange
  }, [onTileClipboardChange])

  useEffect(() => {
    onTilesChangeRef.current = onTilesChange
  }, [onTilesChange])

  useEffect(() => {
    placementRotationRef.current = placementRotation
  }, [placementRotation])

  const [isPanning, setIsPanning] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const smoothDragRef = useRef<SmoothDragState | null>(null)
  const paintRef = useRef<() => void>(() => {})
  const paintFrameRef = useRef<number | null>(null)
  const viewStateFrameRef = useRef<number | null>(null)
  const zoomPreviewRef = useRef<ZoomPreviewState | null>(null)
  const plateSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  const staticSceneSnapshotRef = useRef<HTMLCanvasElement | null>(null)
  const dragSnapshotPendingRef = useRef(false)
  const rotationFastPaintRef = useRef<RotationFastPaint | null>(null)
  const snapshotCaptureRef = useRef(false)
  const canvasSizeRef = useRef({ width: 0, height: 0, dpr: 0 })
  const spaceHeldRef = useRef(false)
  const lastTileTapRef = useRef<{
    instanceId: string
    time: number
    screenX: number
    screenY: number
  } | null>(null)
  const selectedSet = new Set(selectedIds)

  const schedulePaint = useCallback(() => {
    if (paintFrameRef.current != null) return
    paintFrameRef.current = requestAnimationFrame(() => {
      paintFrameRef.current = null
      paintRef.current()
    })
  }, [])

  useEffect(() => {
    tilesRef.current = tiles
    staticSceneSnapshotRef.current = null
    schedulePaint()
  }, [tiles, schedulePaint])

  const updateMarquee = useCallback(
    (next: MarqueeState | null) => {
      marqueeRef.current = next
      schedulePaint()
    },
    [schedulePaint],
  )

  const syncViewState = useCallback(() => {
    if (viewStateFrameRef.current != null) return
    viewStateFrameRef.current = requestAnimationFrame(() => {
      viewStateFrameRef.current = null
      setZoom(zoomRef.current)
      setPan(panRef.current)
    })
  }, [])

  const clearZoomPreview = useCallback(() => {
    const preview = zoomPreviewRef.current
    if (preview?.commitTimer != null) {
      window.clearTimeout(preview.commitTimer)
    }
    const viewport = viewportRef.current
    if (viewport) {
      viewport.style.transform = ''
      viewport.style.willChange = ''
    }
    zoomPreviewRef.current = null
  }, [])

  const clearPlateSnapshot = useCallback(() => {
    plateSnapshotRef.current = null
  }, [])

  const clearStaticSceneSnapshot = useCallback(() => {
    staticSceneSnapshotRef.current = null
  }, [])

  const capturePlateSnapshot = useCallback(() => {
    const main = canvasRef.current
    if (!main) return
    let snap = plateSnapshotRef.current
    if (!snap) {
      snap = document.createElement('canvas')
      plateSnapshotRef.current = snap
    }
    snap.width = main.width
    snap.height = main.height
    snap.getContext('2d')?.drawImage(main, 0, 0)
  }, [])

  const captureStaticSceneSnapshot = useCallback(() => {
    const main = canvasRef.current
    if (!main) return
    let snap = staticSceneSnapshotRef.current
    if (!snap) {
      snap = document.createElement('canvas')
      staticSceneSnapshotRef.current = snap
    }
    snap.width = main.width
    snap.height = main.height
    snap.getContext('2d')?.drawImage(main, 0, 0)
  }, [])

  const captureDragSnapshot = useCallback(() => {
    snapshotCaptureRef.current = true
    paintRef.current()
    capturePlateSnapshot()
    snapshotCaptureRef.current = false
  }, [capturePlateSnapshot])

  const commitZoomPreview = useCallback(() => {
    clearZoomPreview()
    clearPlateSnapshot()
    clearStaticSceneSnapshot()
    paintRef.current()
    syncViewState()
  }, [clearPlateSnapshot, clearStaticSceneSnapshot, clearZoomPreview, syncViewState])

  const commitZoomPreviewIfNeeded = useCallback(() => {
    if (zoomPreviewRef.current) commitZoomPreview()
  }, [commitZoomPreview])

  const showZoomPreview = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }) => {
      const viewport = viewportRef.current
      if (!viewport) return

      let preview = zoomPreviewRef.current
      if (!preview) {
        preview = {
          baseZoom: zoomRef.current,
          basePan: panRef.current,
          commitTimer: null,
        }
      } else if (preview.commitTimer != null) {
        window.clearTimeout(preview.commitTimer)
      }

      const scale = nextZoom / preview.baseZoom
      const dx = nextPan.x - preview.basePan.x * scale
      const dy = nextPan.y - preview.basePan.y * scale

      viewport.style.transformOrigin = '0 0'
      viewport.style.willChange = 'transform'
      viewport.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`

      preview.commitTimer = window.setTimeout(commitZoomPreview, 90)
      zoomPreviewRef.current = preview
    },
    [commitZoomPreview],
  )

  const repaintNow = useCallback(() => {
    if (zoomPreviewRef.current) {
      clearZoomPreview()
    }
    paintRef.current()
  }, [clearZoomPreview])

  const updateSmoothDrag = useCallback(
    (next: SmoothDragState | null, opts?: { deferSnapshot?: boolean }) => {
      const hadDrag = smoothDragRef.current != null
      smoothDragRef.current = next
      if (next && !hadDrag) {
        if (opts?.deferSnapshot) {
          dragSnapshotPendingRef.current = true
        } else {
          dragSnapshotPendingRef.current = false
          captureDragSnapshot()
        }
      } else if (!next) {
        clearPlateSnapshot()
        dragSnapshotPendingRef.current = false
      }
      repaintNow()
    },
    [captureDragSnapshot, clearPlateSnapshot, repaintNow],
  )

  const applyTileRotation = useCallback(
    (instanceId: string) => {
      const tile = tilesRef.current.find((t) => t.instanceId === instanceId)
      if (!tile) return
      const entry = catalogById.get(tile.catalogId)
      if (!entry) return
      const rotation = nextRotation(tile.rotation)
      const nextTiles = tilesRef.current.map((t) =>
        t.instanceId === instanceId ? { ...t, rotation } : t,
      )
      tilesRef.current = nextTiles
      smoothDragRef.current = null
      clearPlateSnapshot()
      dragSnapshotPendingRef.current = false

      if (staticSceneSnapshotRef.current) {
        rotationFastPaintRef.current = {
          instanceId,
          gridX: tile.gridX,
          gridY: tile.gridY,
          entry,
          rotation,
        }
        repaintNow()
        rotationFastPaintRef.current = null
      } else {
        repaintNow()
      }
      requestAnimationFrame(() => onTilesChangeRef.current(nextTiles))
    },
    [clearPlateSnapshot, repaintNow],
  )

  useEffect(() => {
    setPlacementRotation(0)
    placementRotationRef.current = 0
    placementPreviewRef.current = null
    hoverCellRef.current = null
    clearStaticSceneSnapshot()
    repaintNow()
  }, [clearStaticSceneSnapshot, pendingCatalogId, repaintNow])

  const isDoubleClickOnTile = (
    instanceId: string,
    clientX: number,
    clientY: number,
  ) => {
    const lastTap = lastTileTapRef.current
    if (!lastTap || lastTap.instanceId !== instanceId) return false
    if (performance.now() - lastTap.time > DOUBLE_TAP_MS) return false
    return (
      Math.hypot(clientX - lastTap.screenX, clientY - lastTap.screenY) <=
      DOUBLE_TAP_MAX_MOVE_PX
    )
  }

  const isPanPointer = (e: React.PointerEvent | PointerEvent) =>
    e.button === 1 ||
    e.button === 2 ||
    spaceHeldRef.current ||
    (e.button === 0 && (e.altKey || e.ctrlKey))

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      spaceHeldRef.current = true
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return
      spaceHeldRef.current = false
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const currentViewRotation = viewRotationRef.current
    const plateTiles = tilesRef.current
    const clipboard = tileClipboardRef.current ?? tileClipboard

    // Cap DPR so full-screen Retina canvases do not repaint 4x as many pixels on every drag/zoom.
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const w = container.clientWidth
    const h = container.clientHeight
    const nextWidth = Math.round(w * dpr)
    const nextHeight = Math.round(h * dpr)
    const lastSize = canvasSizeRef.current
    if (
      canvas.width !== nextWidth ||
      canvas.height !== nextHeight ||
      lastSize.width !== w ||
      lastSize.height !== h ||
      lastSize.dpr !== dpr
    ) {
      canvas.width = nextWidth
      canvas.height = nextHeight
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      canvasSizeRef.current = { width: w, height: h, dpr }
      plateSnapshotRef.current = null
      staticSceneSnapshotRef.current = null
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const currentZoom = zoomRef.current
    const currentPan = panRef.current
    const activeSmoothDrag = smoothDragRef.current
    const snap = plateSnapshotRef.current
    const skipDragOverlay = snapshotCaptureRef.current
    const rotationFast = rotationFastPaintRef.current
    const staticSnap = staticSceneSnapshotRef.current

    if (rotationFast && staticSnap && !skipDragOverlay && !activeSmoothDrag) {
      if (zoomPreviewRef.current) {
        clearZoomPreview()
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(staticSnap, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.save()
      ctx.translate(currentPan.x, currentPan.y)
      ctx.scale(currentZoom, currentZoom)
      ctx.translate(PLATE_CENTER.x, PLATE_CENTER.y)
      ctx.rotate((currentViewRotation * Math.PI) / 180)
      ctx.translate(-PLATE_CENTER.x, -PLATE_CENTER.y)
      drawTile(
        ctx,
        rotationFast.gridX * GRID_CELL,
        rotationFast.gridY * GRID_CELL,
        rotationFast.entry,
        rotationFast.rotation,
        { selected: selectedSet.has(rotationFast.instanceId) },
      )
      ctx.restore()
      captureStaticSceneSnapshot()
      return
    }

    const pendingPlaceId = pendingCatalogIdRef.current
    const placementPreview = placementPreviewRef.current
    if (
      pendingPlaceId &&
      placementPreview &&
      staticSnap &&
      !activeSmoothDrag &&
      !rotationFast &&
      !skipDragOverlay
    ) {
      if (zoomPreviewRef.current) {
        clearZoomPreview()
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(staticSnap, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const drawCellHighlight = (
        gx: number,
        gy: number,
        options: { invalid: boolean; strong?: boolean },
      ) => {
        if (!inPlateBounds(gx, gy)) return
        const hx = gx * GRID_CELL
        const hy = gy * GRID_CELL
        ctx.fillStyle = options.invalid
          ? 'rgba(220, 80, 80, 0.22)'
          : options.strong
            ? 'rgba(77, 159, 255, 0.35)'
            : 'rgba(77, 159, 255, 0.18)'
        ctx.fillRect(hx, hy, GRID_CELL, GRID_CELL)
        ctx.strokeStyle = options.invalid
          ? 'rgba(220, 80, 80, 0.85)'
          : 'rgba(77, 159, 255, 0.9)'
        ctx.lineWidth = options.strong ? 3 : 2
        ctx.strokeRect(hx + 1, hy + 1, GRID_CELL - 2, GRID_CELL - 2)
      }

      ctx.save()
      ctx.translate(currentPan.x, currentPan.y)
      ctx.scale(currentZoom, currentZoom)
      ctx.translate(PLATE_CENTER.x, PLATE_CENTER.y)
      ctx.rotate((currentViewRotation * Math.PI) / 180)
      ctx.translate(-PLATE_CENTER.x, -PLATE_CENTER.y)

      const entry = catalogById.get(pendingPlaceId)
      if (entry) {
        const grid = placementPreview.grid
        const cellOccupied =
          grid != null &&
          plateTiles.some((t) => t.gridX === grid.gx && t.gridY === grid.gy)
        if (grid) {
          drawCellHighlight(grid.gx, grid.gy, {
            invalid: cellOccupied,
            strong: false,
          })
        }
        const invalid =
          grid == null ||
          plateTiles.some(
            (t) => t.gridX === grid?.gx && t.gridY === grid?.gy,
          )
        ctx.save()
        ctx.globalAlpha = invalid ? 0.42 : 0.76
        drawTile(
          ctx,
          placementPreview.worldX - GRID_CELL / 2,
          placementPreview.worldY - GRID_CELL / 2,
          entry,
          placementRotationRef.current,
        )
        ctx.restore()
      }
      ctx.restore()
      return
    }

    if (activeSmoothDrag && snap && !skipDragOverlay) {
      if (zoomPreviewRef.current) {
        clearZoomPreview()
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(snap, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const drawCellHighlight = (
        gx: number,
        gy: number,
        options: { invalid: boolean; strong?: boolean },
      ) => {
        if (!inPlateBounds(gx, gy)) return
        const hx = gx * GRID_CELL
        const hy = gy * GRID_CELL
        ctx.fillStyle = options.invalid
          ? 'rgba(220, 80, 80, 0.22)'
          : options.strong
            ? 'rgba(77, 159, 255, 0.35)'
            : 'rgba(77, 159, 255, 0.18)'
        ctx.fillRect(hx, hy, GRID_CELL, GRID_CELL)
        ctx.strokeStyle = options.invalid
          ? 'rgba(220, 80, 80, 0.85)'
          : 'rgba(77, 159, 255, 0.9)'
        ctx.lineWidth = options.strong ? 3 : 2
        ctx.strokeRect(hx + 1, hy + 1, GRID_CELL - 2, GRID_CELL - 2)
      }

      ctx.save()
      ctx.translate(currentPan.x, currentPan.y)
      ctx.scale(currentZoom, currentZoom)
      ctx.translate(PLATE_CENTER.x, PLATE_CENTER.y)
      ctx.rotate((currentViewRotation * Math.PI) / 180)
      ctx.translate(-PLATE_CENTER.x, -PLATE_CENTER.y)

      if (activeSmoothDrag.kind === 'tile') {
        drawCellHighlight(activeSmoothDrag.targetGx, activeSmoothDrag.targetGy, {
          invalid: !activeSmoothDrag.valid,
          strong: activeSmoothDrag.valid,
        })
      } else {
        for (const origin of activeSmoothDrag.origins.values()) {
          drawCellHighlight(
            origin.gridX + activeSmoothDrag.targetDx,
            origin.gridY + activeSmoothDrag.targetDy,
            {
              invalid: !activeSmoothDrag.valid,
              strong: activeSmoothDrag.valid,
            },
          )
        }
      }

      ctx.save()
      ctx.globalAlpha = activeSmoothDrag.valid ? 0.92 : 0.55
      if (activeSmoothDrag.kind === 'tile') {
        const tile = plateTiles.find((t) => t.instanceId === activeSmoothDrag.instanceId)
        const entry = tile ? catalogById.get(tile.catalogId) : null
        if (tile && entry) {
          drawTile(ctx, activeSmoothDrag.x, activeSmoothDrag.y, entry, tile.rotation, {
            selected: true,
          })
        }
      } else {
        for (const tile of plateTiles) {
          const origin = activeSmoothDrag.origins.get(tile.instanceId)
          if (!origin) continue
          const entry = catalogById.get(tile.catalogId)
          if (!entry) continue
          drawTile(
            ctx,
            origin.gridX * GRID_CELL + activeSmoothDrag.dxWorld,
            origin.gridY * GRID_CELL + activeSmoothDrag.dyWorld,
            entry,
            tile.rotation,
            { selected: true },
          )
        }
      }
      ctx.restore()
      ctx.restore()
      return
    }

    // Full repaints must drop the wheel-zoom CSS transform so the bitmap matches zoomRef/panRef.
    if (zoomPreviewRef.current) {
      clearZoomPreview()
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#2b3036'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(currentPan.x, currentPan.y)
    ctx.scale(currentZoom, currentZoom)
    ctx.translate(PLATE_CENTER.x, PLATE_CENTER.y)
    ctx.rotate((currentViewRotation * Math.PI) / 180)
    ctx.translate(-PLATE_CENTER.x, -PLATE_CENTER.y)

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    drawPlate(ctx, PLATE_W, PLATE_H)
    ctx.restore()

    const sorted = [...plateTiles].sort((a, b) => {
      const aSel = selectedSet.has(a.instanceId)
      const bSel = selectedSet.has(b.instanceId)
      if (aSel && !bSel) return 1
      if (!aSel && bSel) return -1
      return 0
    })
    const movingIds =
      activeSmoothDrag?.kind === 'tile'
        ? new Set([activeSmoothDrag.instanceId])
        : activeSmoothDrag?.kind === 'group'
          ? new Set(activeSmoothDrag.instanceIds)
          : null

    for (const tile of sorted) {
      if (movingIds?.has(tile.instanceId)) continue
      const entry = catalogById.get(tile.catalogId)
      if (!entry) continue
      drawTile(ctx, tile.gridX * GRID_CELL, tile.gridY * GRID_CELL, entry, tile.rotation, {
        selected: selectedSet.has(tile.instanceId),
      })
    }

    const placementPreviewState = placementPreviewRef.current
    const hoverCell = hoverCellRef.current
    const placementCell = pendingCatalogId
      ? (placementPreviewState?.grid ?? hoverCell)
      : null
    const pasteCell = clipboard ? (hoverCell ?? pasteTarget) : null
    const highlightCell = placementCell ?? pasteCell

    const drawCellHighlight = (
      gx: number,
      gy: number,
      options: { invalid: boolean; strong?: boolean },
    ) => {
      if (!inPlateBounds(gx, gy)) return
      const hx = gx * GRID_CELL
      const hy = gy * GRID_CELL
      ctx.fillStyle = options.invalid
        ? 'rgba(220, 80, 80, 0.22)'
        : options.strong
          ? 'rgba(77, 159, 255, 0.35)'
          : 'rgba(77, 159, 255, 0.18)'
      ctx.fillRect(hx, hy, GRID_CELL, GRID_CELL)
      ctx.strokeStyle = options.invalid
        ? 'rgba(220, 80, 80, 0.85)'
        : 'rgba(77, 159, 255, 0.9)'
      ctx.lineWidth = options.strong ? 3 : 2
      ctx.strokeRect(hx + 1, hy + 1, GRID_CELL - 2, GRID_CELL - 2)
    }

    if (highlightCell) {
      const cellOccupied = plateTiles.some(
        (t) => t.gridX === highlightCell.gx && t.gridY === highlightCell.gy,
      )
      const pasteEntry = clipboard ? catalogById.get(clipboard.catalogId) : null
      const pasteQuantityBlocked =
        pasteEntry != null &&
        plateTiles.filter((t) => t.catalogId === clipboard!.catalogId).length >=
          pasteEntry.quantity
      const pasteInvalid = cellOccupied || pasteQuantityBlocked
      const isPasteTarget =
        clipboard != null &&
        pasteTarget?.gx === highlightCell.gx &&
        pasteTarget?.gy === highlightCell.gy
      const highlightInvalid = placementCell ? cellOccupied : pasteInvalid
      drawCellHighlight(highlightCell.gx, highlightCell.gy, {
        invalid: highlightInvalid,
        strong: isPasteTarget,
      })
    }

    if (!skipDragOverlay) {
      if (activeSmoothDrag?.kind === 'tile') {
        drawCellHighlight(activeSmoothDrag.targetGx, activeSmoothDrag.targetGy, {
          invalid: !activeSmoothDrag.valid,
          strong: activeSmoothDrag.valid,
        })
      } else if (activeSmoothDrag?.kind === 'group') {
        for (const origin of activeSmoothDrag.origins.values()) {
          drawCellHighlight(
            origin.gridX + activeSmoothDrag.targetDx,
            origin.gridY + activeSmoothDrag.targetDy,
            {
              invalid: !activeSmoothDrag.valid,
              strong: activeSmoothDrag.valid,
            },
          )
        }
      }
    }

    if (pasteCell && clipboard && !pendingCatalogId) {
      const entry = catalogById.get(clipboard.catalogId)
      if (entry) {
        const cellOccupied = plateTiles.some(
          (t) => t.gridX === pasteCell.gx && t.gridY === pasteCell.gy,
        )
        const used = plateTiles.filter((t) => t.catalogId === clipboard.catalogId).length
        const invalid = cellOccupied || used >= entry.quantity
        ctx.save()
        ctx.globalAlpha = invalid ? 0.38 : 0.72
        drawTile(
          ctx,
          pasteCell.gx * GRID_CELL,
          pasteCell.gy * GRID_CELL,
          entry,
          clipboard.rotation,
        )
        ctx.restore()
      }
    }

    const activeMarquee = marqueeRef.current
    if (activeMarquee) {
      const mx = Math.min(activeMarquee.x0, activeMarquee.x1)
      const my = Math.min(activeMarquee.y0, activeMarquee.y1)
      const mw = Math.abs(activeMarquee.x1 - activeMarquee.x0)
      const mh = Math.abs(activeMarquee.y1 - activeMarquee.y0)
      ctx.fillStyle = 'rgba(77, 159, 255, 0.12)'
      ctx.fillRect(mx, my, mw, mh)
      ctx.strokeStyle = 'rgba(77, 159, 255, 0.95)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(mx, my, mw, mh)
      ctx.setLineDash([])
    }

    if (!skipDragOverlay && activeSmoothDrag) {
      ctx.save()
      ctx.globalAlpha = activeSmoothDrag.valid ? 0.92 : 0.55

      const drawMovingTile = (
        tile: PlacedTile,
        entry: NonNullable<ReturnType<typeof catalogById.get>>,
        x: number,
        y: number,
      ) => {
        drawTile(ctx, x, y, entry, tile.rotation, { selected: true })
      }

      if (activeSmoothDrag.kind === 'tile') {
        const tile = plateTiles.find((t) => t.instanceId === activeSmoothDrag.instanceId)
        const entry = tile ? catalogById.get(tile.catalogId) : null
        if (tile && entry) {
          drawMovingTile(tile, entry, activeSmoothDrag.x, activeSmoothDrag.y)
        }
      } else {
        for (const tile of plateTiles) {
          const origin = activeSmoothDrag.origins.get(tile.instanceId)
          if (!origin) continue
          const entry = catalogById.get(tile.catalogId)
          if (!entry) continue
          drawMovingTile(
            tile,
            entry,
            origin.gridX * GRID_CELL + activeSmoothDrag.dxWorld,
            origin.gridY * GRID_CELL + activeSmoothDrag.dyWorld,
          )
        }
      }

      ctx.restore()
    }

    if (placementPreviewState && pendingCatalogId) {
      const entry = catalogById.get(pendingCatalogId)
      if (entry) {
        const invalid =
          placementPreviewState.grid == null ||
          plateTiles.some(
            (t) =>
              t.gridX === placementPreviewState.grid?.gx &&
              t.gridY === placementPreviewState.grid?.gy,
          )
        ctx.save()
        ctx.globalAlpha = invalid ? 0.42 : 0.76
        drawTile(
          ctx,
          placementPreviewState.worldX - GRID_CELL / 2,
          placementPreviewState.worldY - GRID_CELL / 2,
          entry,
          placementRotationRef.current,
        )
        ctx.restore()
      }
    }

    ctx.restore()

    if (!smoothDragRef.current && !snapshotCaptureRef.current) {
      captureStaticSceneSnapshot()
    }
  }, [
    captureStaticSceneSnapshot,
    clearZoomPreview,
    selectedIds,
    pendingCatalogId,
    tileClipboard,
    pasteTarget,
  ])

  useEffect(() => {
    paintRef.current = paint
  }, [paint])

  useEffect(() => {
    viewRotationRef.current = loadViewRotation
    paintRef.current()
  }, [canvasRevision, loadViewRotation])

  useEffect(() => {
    paint()
    const ro = new ResizeObserver(paint)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      ro.disconnect()
      if (paintFrameRef.current != null) {
        cancelAnimationFrame(paintFrameRef.current)
        paintFrameRef.current = null
      }
      if (viewStateFrameRef.current != null) {
        cancelAnimationFrame(viewStateFrameRef.current)
        viewStateFrameRef.current = null
      }
      clearZoomPreview()
    }
  }, [clearZoomPreview, paint])

  const occupied = useCallback(
    (gx: number, gy: number, exceptIds?: Set<string>) =>
      tiles.some(
        (t) =>
          t.gridX === gx &&
          t.gridY === gy &&
          !(exceptIds?.has(t.instanceId) ?? false),
      ),
    [tiles],
  )

  const placeTile = (catalogId: string, gx: number, gy: number) => {
    if (occupied(gx, gy)) return
    const instanceId = crypto.randomUUID()
    onTilesChange([
      ...tiles,
      {
        instanceId,
        catalogId,
        gridX: gx,
        gridY: gy,
        rotation: placementRotation,
      },
    ])
    onSelectionChange([instanceId])
    onPendingClear()
  }

  const applyZoomAtLocal = useCallback(
    (localX: number, localY: number, opts: { multiply?: number; target?: number }) => {
      if (zoomPreviewRef.current) commitZoomPreview()
      const next = computeZoomAtLocal(
        localX,
        localY,
        zoomRef.current,
        panRef.current,
        viewRotationRef.current,
        opts,
      )
      zoomRef.current = next.zoom
      panRef.current = next.pan
      schedulePaint()
      syncViewState()
    },
    [commitZoomPreview, schedulePaint, syncViewState],
  )

  // Block Safari trackpad rotate/pinch gestures from transforming the canvas DOM.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const preventGesture = (e: Event) => e.preventDefault()
    el.addEventListener('gesturestart', preventGesture, { passive: false })
    el.addEventListener('gesturechange', preventGesture, { passive: false })
    el.addEventListener('gestureend', preventGesture, { passive: false })
    return () => {
      el.removeEventListener('gesturestart', preventGesture)
      el.removeEventListener('gesturechange', preventGesture)
      el.removeEventListener('gestureend', preventGesture)
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      lastWheelAtRef.current = performance.now()

      const rect = container.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Use small exponential steps so trackpads feel smooth and mouse wheels do not jump.
      const pinch = e.ctrlKey || e.metaKey
      const rawDelta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      const direction = Math.sign(rawDelta)
      if (direction === 0) return
      const magnitude = Math.min(1.5, Math.max(1, Math.abs(rawDelta) / 50))
      const step = pinch ? 0.03 : 0.045
      const factor = Math.exp(-direction * magnitude * step)
      const next = computeZoomAtLocal(
        mx,
        my,
        zoomRef.current,
        panRef.current,
        viewRotationRef.current,
        {
          multiply: factor,
        },
      )
      showZoomPreview(next.zoom, next.pan)
      zoomRef.current = next.zoom
      panRef.current = next.pan
    }

    container.addEventListener('wheel', onWheel, { passive: false })
    return () => container.removeEventListener('wheel', onWheel)
  }, [showZoomPreview])

  const zoomFromToolbar = (factor: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    applyZoomAtLocal(rect.width / 2, rect.height / 2, { multiply: factor })
  }

  const centerCanvas = useCallback(() => {
    if (zoomPreviewRef.current) commitZoomPreview()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const bounds = rotatedPlateBounds(viewRotationRef.current)
    const nextPan = {
      x: (rect.width - bounds.width * zoomRef.current) / 2 - bounds.minX * zoomRef.current,
      y:
        (rect.height - bounds.height * zoomRef.current) / 2 -
        bounds.minY * zoomRef.current,
    }
    panRef.current = nextPan
    schedulePaint()
    syncViewState()
  }, [commitZoomPreview, schedulePaint, syncViewState])

  const rotateView = useCallback(() => {
    const next = nextRotation(viewRotationRef.current)
    viewRotationRef.current = next
    if (zoomPreviewRef.current) {
      clearZoomPreview()
    }
    clearPlateSnapshot()
    clearStaticSceneSnapshot()
    paintRef.current()
    onViewRotationChange?.(next)
  }, [clearPlateSnapshot, clearStaticSceneSnapshot, clearZoomPreview, onViewRotationChange])

  const handlePointerDown = (e: React.PointerEvent) => {
    containerRef.current?.focus({ preventScroll: true })
    const rect = containerRef.current!.getBoundingClientRect()
    const currentPan = panRef.current
    const currentZoom = zoomRef.current
    const grid = screenToGrid(
      e.clientX,
      e.clientY,
      currentPan.x,
      currentPan.y,
      currentZoom,
      viewRotationRef.current,
      rect,
    )
    const world = screenToWorld(
      e.clientX,
      e.clientY,
      currentPan.x,
      currentPan.y,
      currentZoom,
      viewRotationRef.current,
      rect,
    )

    if (isPanPointer(e)) {
      commitZoomPreviewIfNeeded()
      e.preventDefault()
      canvasRef.current?.setPointerCapture(e.pointerId)
      setIsPanning(true)
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        panX: currentPan.x,
        panY: currentPan.y,
      }
      return
    }

    if (e.button !== 0) return

    const hit =
      grid != null
        ? tiles.find((t) => t.gridX === grid.gx && t.gridY === grid.gy)
        : undefined

    if (hit && grid && !tileClipboard) {
      const shift = e.shiftKey
      const inSelection = selectedSet.has(hit.instanceId)

      if (shift) {
        if (inSelection) {
          onSelectionChange(selectedIds.filter((id) => id !== hit.instanceId))
        } else {
          onSelectionChange([...selectedIds, hit.instanceId])
        }
        return
      }

      const activeIds = inSelection ? selectedIds : [hit.instanceId]
      if (!inSelection) {
        onSelectionChange(activeIds)
      }

      canvasRef.current?.setPointerCapture(e.pointerId)

      if (activeIds.length > 1) {
        const origins = new Map<string, { gridX: number; gridY: number }>()
        for (const t of tiles) {
          if (activeIds.includes(t.instanceId)) {
            origins.set(t.instanceId, { gridX: t.gridX, gridY: t.gridY })
          }
        }
        dragRef.current = {
          kind: 'group',
          startX: world.x,
          startY: world.y,
          startScreenX: e.clientX - rect.left,
          startScreenY: e.clientY - rect.top,
          origins,
        }
        commitZoomPreviewIfNeeded()
        updateSmoothDrag(
          {
            kind: 'group',
            instanceIds: activeIds,
            origins,
            dxWorld: 0,
            dyWorld: 0,
            dxScreen: 0,
            dyScreen: 0,
            targetDx: 0,
            targetDy: 0,
            valid: true,
          },
          { deferSnapshot: true },
        )
        return
      }

      if (isDoubleClickOnTile(hit.instanceId, e.clientX, e.clientY)) {
        lastTileTapRef.current = null
        canvasRef.current?.setPointerCapture(e.pointerId)
        dragRef.current = { kind: 'rotateTap', instanceId: hit.instanceId }
        if (zoomPreviewRef.current) {
          clearZoomPreview()
          syncViewState()
        }
        applyTileRotation(hit.instanceId)
        onSelectionChange([hit.instanceId])
        return
      }

      const tileX = hit.gridX * GRID_CELL
      const tileY = hit.gridY * GRID_CELL
      const tileScreen = worldToScreen(
        tileX,
        tileY,
        currentPan,
        currentZoom,
        viewRotationRef.current,
      )
      dragRef.current = {
        kind: 'tile',
        instanceId: hit.instanceId,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        pointerOffsetX: world.x - tileX,
        pointerOffsetY: world.y - tileY,
        screenOffsetX: e.clientX - rect.left - tileScreen.x,
        screenOffsetY: e.clientY - rect.top - tileScreen.y,
      }
      commitZoomPreviewIfNeeded()
      updateSmoothDrag(
        {
          kind: 'tile',
          instanceId: hit.instanceId,
          x: tileX,
          y: tileY,
          screenX: tileScreen.x,
          screenY: tileScreen.y,
          targetGx: hit.gridX,
          targetGy: hit.gridY,
          valid: true,
        },
        { deferSnapshot: true },
      )
      return
    }

    // Placing a new part from the palette: follow the pointer (no marquee / click-vs-drag wait).
    if (pendingCatalogId) {
      commitZoomPreviewIfNeeded()
      canvasRef.current?.setPointerCapture(e.pointerId)
      if (!e.shiftKey) {
        onSelectionChange([])
      }
      dragRef.current = { kind: 'place', catalogId: pendingCatalogId }
      hoverCellRef.current = grid
      placementPreviewRef.current = {
        screenX: e.clientX - rect.left,
        screenY: e.clientY - rect.top,
        worldX: world.x,
        worldY: world.y,
        grid,
      }
      repaintNow()
      return
    }

    // Empty plate or canvas: box-select (drag). Click without drag pastes.
    commitZoomPreviewIfNeeded()
    canvasRef.current?.setPointerCapture(e.pointerId)

    let pendingClick: { kind: 'place' | 'paste'; gx: number; gy: number } | undefined
    if (grid && tileClipboard && !occupied(grid.gx, grid.gy)) {
      pendingClick = { kind: 'paste', gx: grid.gx, gy: grid.gy }
    }

    if (!e.shiftKey) {
      onSelectionChange([])
    }

    dragRef.current = {
      kind: 'marquee',
      startX: world.x,
      startY: world.y,
      addToSelection: e.shiftKey,
      pendingClick,
    }
    updateMarquee({ x0: world.x, y0: world.y, x1: world.x, y1: world.y })
  }

  const updatePointerHover = (e: React.PointerEvent) => {
    if (!tileClipboard && !pendingCatalogIdRef.current) {
      hoverCellRef.current = null
      placementPreviewRef.current = null
      return
    }
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const currentPan = panRef.current
    const grid = screenToGrid(
      e.clientX,
      e.clientY,
      currentPan.x,
      currentPan.y,
      zoomRef.current,
      viewRotationRef.current,
      rect,
    )

    if (pendingCatalogIdRef.current) {
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        currentPan.x,
        currentPan.y,
        zoomRef.current,
        viewRotationRef.current,
        rect,
      )
      hoverCellRef.current = grid
      placementPreviewRef.current = {
        screenX: e.clientX - rect.left,
        screenY: e.clientY - rect.top,
        worldX: world.x,
        worldY: world.y,
        grid,
      }
      repaintNow()
      return
    }

    hoverCellRef.current = grid
    if (tileClipboard && grid && !occupied(grid.gx, grid.gy)) {
      onPasteTargetChange({ gx: grid.gx, gy: grid.gy })
    } else if (tileClipboard) {
      onPasteTargetChange(null)
    }
    schedulePaint()
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (drag?.kind === 'place') {
      updatePointerHover(e)
      return
    }

    updatePointerHover(e)
    const rect = containerRef.current!.getBoundingClientRect()

    if (drag?.kind === 'marquee') {
      const currentPan = panRef.current
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        currentPan.x,
        currentPan.y,
        zoomRef.current,
        viewRotationRef.current,
        rect,
      )
      updateMarquee({ x0: drag.startX, y0: drag.startY, x1: world.x, y1: world.y })
      return
    }

    if (!drag) return

    if (drag.kind === 'pan') {
      clearStaticSceneSnapshot()
      const newPan = {
        x: drag.panX + (e.clientX - drag.startX),
        y: drag.panY + (e.clientY - drag.startY),
      }
      panRef.current = newPan
      schedulePaint()
      syncViewState()
      return
    }

    if (drag.kind === 'group') {
      if (dragSnapshotPendingRef.current) {
        const moved = Math.hypot(
          e.clientX - drag.startScreenX,
          e.clientY - drag.startScreenY,
        )
        if (moved > DRAG_SNAPSHOT_MOVE_PX) {
          dragSnapshotPendingRef.current = false
          captureDragSnapshot()
        }
      }
      const currentZoom = zoomRef.current
      const currentPan = panRef.current
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        currentPan.x,
        currentPan.y,
        currentZoom,
        viewRotationRef.current,
        rect,
      )
      const dxScreen = e.clientX - rect.left - drag.startScreenX
      const dyScreen = e.clientY - rect.top - drag.startScreenY
      const dxWorld = world.x - drag.startX
      const dyWorld = world.y - drag.startY
      const dx = Math.round(dxWorld / GRID_CELL)
      const dy = Math.round(dyWorld / GRID_CELL)
      const groupIds = new Set(drag.origins.keys())
      updateSmoothDrag({
        kind: 'group',
        instanceIds: [...groupIds],
        origins: drag.origins,
        dxWorld,
        dyWorld,
        dxScreen,
        dyScreen,
        targetDx: dx,
        targetDy: dy,
        valid: canMoveGroup(tilesRef.current, groupIds, drag.origins, dx, dy),
      })
      e.preventDefault()
      return
    }

    if (drag.kind === 'tile') {
      if (dragSnapshotPendingRef.current) {
        const moved = Math.hypot(e.clientX - drag.startScreenX, e.clientY - drag.startScreenY)
        if (moved > DRAG_SNAPSHOT_MOVE_PX) {
          dragSnapshotPendingRef.current = false
          captureDragSnapshot()
        }
      }
      const currentPan = panRef.current
      const currentZoom = zoomRef.current
      const pointerWorld = screenToWorld(
        e.clientX,
        e.clientY,
        currentPan.x,
        currentPan.y,
        currentZoom,
        viewRotationRef.current,
        rect,
      )
      const x = pointerWorld.x - drag.pointerOffsetX
      const y = pointerWorld.y - drag.pointerOffsetY
      const screen = worldToScreen(x, y, currentPan, currentZoom, viewRotationRef.current)
      const gx = Math.round(x / GRID_CELL)
      const gy = Math.round(y / GRID_CELL)
      updateSmoothDrag({
        kind: 'tile',
        instanceId: drag.instanceId,
        x,
        y,
        screenX: screen.x,
        screenY: screen.y,
        targetGx: gx,
        targetGy: gy,
        valid: inPlateBounds(gx, gy) && !occupied(gx, gy, new Set([drag.instanceId])),
      })
      e.preventDefault()
    }
  }

  const finishPlaceDrag = (catalogId: string, e: React.PointerEvent) => {
    const rect = containerRef.current!.getBoundingClientRect()
    const grid = screenToGrid(
      e.clientX,
      e.clientY,
      panRef.current.x,
      panRef.current.y,
      zoomRef.current,
      viewRotationRef.current,
      rect,
    )
    if (grid && inPlateBounds(grid.gx, grid.gy) && !occupied(grid.gx, grid.gy)) {
      placeTile(catalogId, grid.gx, grid.gy)
    } else {
      placementPreviewRef.current = null
      hoverCellRef.current = null
      repaintNow()
    }
  }

  const finishMarquee = (drag: Extract<DragState, { kind: 'marquee' }>) => {
    const box = marqueeRef.current ?? {
      x0: drag.startX,
      y0: drag.startY,
      x1: drag.startX,
      y1: drag.startY,
    }
    const w = Math.abs(box.x1 - box.x0)
    const h = Math.abs(box.y1 - box.y0)
    const isClick = w < MARQUEE_MIN_PX && h < MARQUEE_MIN_PX

    if (isClick) {
      if (drag.pendingClick?.kind === 'paste') {
        if (!onPasteAtCell(drag.pendingClick.gx, drag.pendingClick.gy)) {
          onPasteTargetChange({ gx: drag.pendingClick.gx, gy: drag.pendingClick.gy })
        }
      }
      updateMarquee(null)
      return
    }

    const picked = tilesInWorldRect(tiles, box.x0, box.y0, box.x1, box.y1)
    const ids = picked.map((t) => t.instanceId)
    if (drag.addToSelection) {
      const merged = new Set([...selectedIds, ...ids])
      onSelectionChange([...merged])
    } else {
      onSelectionChange(ids)
    }
    updateMarquee(null)
  }

  const finishSmoothDrag = (
    dragState: Extract<DragState, { kind: 'tile' | 'group' }>,
    e: React.PointerEvent,
  ) => {
    const drag = smoothDragRef.current
    if (!drag) return

    if (drag.kind === 'tile') {
      const movePx = Math.hypot(
        e.clientX - dragState.startScreenX,
        e.clientY - dragState.startScreenY,
      )
      if (movePx <= DOUBLE_TAP_MAX_MOVE_PX) {
        const now = performance.now()
        const lastTap = lastTileTapRef.current
        const doubleTapped =
          lastTap?.instanceId === drag.instanceId &&
          now - lastTap.time <= DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - lastTap.screenX, e.clientY - lastTap.screenY) <=
            DOUBLE_TAP_MAX_MOVE_PX

        if (doubleTapped) {
          applyTileRotation(drag.instanceId)
          onSelectionChange([drag.instanceId])
          lastTileTapRef.current = null
          dragRef.current = null
          return
        }

        lastTileTapRef.current = {
          instanceId: drag.instanceId,
          time: now,
          screenX: e.clientX,
          screenY: e.clientY,
        }
        updateSmoothDrag(null)
        return
      } else {
        lastTileTapRef.current = null
      }

      if (drag.valid) {
        const tile = tilesRef.current.find((t) => t.instanceId === drag.instanceId)
        const moved =
          tile != null &&
          (tile.gridX !== drag.targetGx || tile.gridY !== drag.targetGy)
        if (moved) {
          const nextTiles = tilesRef.current.map((t) =>
            t.instanceId === drag.instanceId
              ? { ...t, gridX: drag.targetGx, gridY: drag.targetGy }
              : t,
          )
          tilesRef.current = nextTiles
          requestAnimationFrame(() => onTilesChangeRef.current(nextTiles))
        }
      }
    } else {
      lastTileTapRef.current = null
      const groupIds = new Set(drag.instanceIds)
      if (drag.valid) {
        onTilesChange(
          moveGroupFromOrigins(
            tiles,
            groupIds,
            drag.origins,
            drag.targetDx,
            drag.targetDy,
          ),
        )
      }
    }

    updateSmoothDrag(null)
  }

  const endPointer = (e: React.PointerEvent) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId)
    }
    const drag = dragRef.current
    if (drag?.kind === 'place') {
      finishPlaceDrag(drag.catalogId, e)
    } else if (drag?.kind === 'marquee') {
      finishMarquee(drag)
    } else if (drag?.kind === 'rotateTap') {
      // Rotation already applied on the second pointer down.
    } else if (drag?.kind === 'tile' || drag?.kind === 'group') {
      finishSmoothDrag(drag, e)
    }
    dragRef.current = null
    setIsPanning(false)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    endPointer(e)
  }

  const handlePointerLeave = (e: React.PointerEvent) => {
    hoverCellRef.current = null
    placementPreviewRef.current = null
    repaintNow()
    if (
      dragRef.current?.kind !== 'pan' &&
      dragRef.current?.kind !== 'marquee' &&
      dragRef.current?.kind !== 'place' &&
      dragRef.current?.kind !== 'rotateTap' &&
      !canvasRef.current?.hasPointerCapture(e.pointerId)
    ) {
      endPointer(e)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
  }

  const rotateSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    const set = new Set(selectedIds)
    const nextTiles = tilesRef.current.map((t) =>
      set.has(t.instanceId) ? { ...t, rotation: nextRotation(t.rotation) } : t,
    )
    tilesRef.current = nextTiles
    clearPlateSnapshot()
    repaintNow()
    requestAnimationFrame(() => onTilesChangeRef.current(nextTiles))
  }, [clearPlateSnapshot, selectedIds, repaintNow])

  const rotatePlacementPasteOrSelection = useCallback(() => {
    if (pendingCatalogId) {
      placementRotationRef.current = nextRotation(placementRotationRef.current)
      repaintNow()
      requestAnimationFrame(() =>
        setPlacementRotation(placementRotationRef.current),
      )
      return
    }
    const clip = tileClipboardRef.current ?? tileClipboard
    if (clip) {
      const next = {
        ...clip,
        rotation: nextRotation(clip.rotation),
      }
      tileClipboardRef.current = next
      repaintNow()
      requestAnimationFrame(() => onTileClipboardChangeRef.current(next))
      return
    }
    rotateSelected()
  }, [pendingCatalogId, tileClipboard, repaintNow, rotateSelected])

  function isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null
    if (!el) return false
    const tag = el.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (el.isContentEditable) return true
    return false
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.code !== 'KeyR' && e.key !== 'r' && e.key !== 'R') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      e.preventDefault()
      rotatePlacementPasteOrSelection()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotatePlacementPasteOrSelection])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.code !== 'KeyB' && e.key !== 'b' && e.key !== 'B') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      e.preventDefault()
      centerCanvas()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [centerCanvas])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.code !== 'KeyG' && e.key !== 'g' && e.key !== 'G') return
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return

      e.preventDefault()
      rotateView()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [rotateView])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault()
        onRemoveTiles(selectedIds)
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onSelectionChange([])
        onPendingClear()
        updateMarquee(null)
        dragRef.current = null
        updateSmoothDrag(null)
        placementPreviewRef.current = null
        hoverCellRef.current = null
        repaintNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    onRemoveTiles,
    onSelectionChange,
    onPendingClear,
    repaintNow,
    updateMarquee,
    updateSmoothDrag,
  ])

  return (
    <div
      className="canvas-panel"
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Circuit plate editor"
    >
      <div className="canvas-toolbar">
        <button type="button" onClick={() => zoomFromToolbar(1.1)}>
          Zoom in
        </button>
        <button type="button" onClick={() => zoomFromToolbar(1 / 1.1)}>
          Zoom out
        </button>
        <button
          type="button"
          onClick={() => {
            const container = containerRef.current
            if (!container) {
              zoomRef.current = 1
              panRef.current = { x: 80, y: 60 }
              setZoom(1)
              setPan({ x: 80, y: 60 })
              return
            }
            const rect = container.getBoundingClientRect()
            applyZoomAtLocal(rect.width / 2, rect.height / 2, { target: 1 })
          }}
        >
          Reset zoom
        </button>
        <button type="button" onClick={centerCanvas} title="Center canvas (B)">
          Center (B)
        </button>
        <button type="button" onClick={rotateView} title="Turn grid view (G)">
          Grid (G)
        </button>
        <button
          type="button"
          onClick={rotatePlacementPasteOrSelection}
          disabled={
            selectedIds.length === 0 && !pendingCatalogId && !tileClipboard
          }
          title="Rotate 90° clockwise"
        >
          Rotate (R)
        </button>
        <span className="zoom-label">{Math.round(zoom * 100)}%</span>
      </div>
      <div ref={viewportRef} className="circuit-viewport">
        <canvas
          ref={canvasRef}
          className={`circuit-canvas${tileClipboard ? ' paste-mode' : ''}${
            pendingCatalogId ? ' place-mode' : ''
          }${isPanning ? ' panning' : ''}`}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
        />
      </div>
    </div>
  )
})
