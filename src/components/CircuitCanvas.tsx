import { useCallback, useEffect, useRef, useState } from 'react'
import { catalogById, GRID_CELL } from '../catalog'
import { drawPlate, drawTile } from '../drawTile'
import { nextRotation } from '../geometry'
import { inPlateBounds, PLATE_COLS, PLATE_ROWS } from '../plate'
import { canMoveGroup, moveGroupFromOrigins, tilesInWorldRect } from '../selection'
import type { TileClipboard } from '../tileClipboard'
import type { PlacedTile, Rotation } from '../types'

const PLATE_W = PLATE_COLS * GRID_CELL
const PLATE_H = PLATE_ROWS * GRID_CELL
const MARQUEE_MIN_PX = 6
const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5
const DOUBLE_TAP_MS = 350
const DOUBLE_TAP_MAX_MOVE_PX = 10

function clampZoom(z: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
}

/** Keep the world point under (localX, localY) fixed while changing zoom. */
function computeZoomAtLocal(
  localX: number,
  localY: number,
  z: number,
  p: { x: number; y: number },
  opts: { multiply?: number; target?: number },
) {
  const nz =
    opts.target != null ? clampZoom(opts.target) : clampZoom(z * (opts.multiply ?? 1))
  const worldX = (localX - p.x) / z
  const worldY = (localY - p.y) / z
  return {
    zoom: nz,
    pan: { x: localX - worldX * nz, y: localY - worldY * nz },
  }
}

interface CircuitCanvasProps {
  tiles: PlacedTile[]
  selectedIds: string[]
  pendingCatalogId: string | null
  tileClipboard: TileClipboard | null
  pasteTarget: { gx: number; gy: number } | null
  onPasteTargetChange: (target: { gx: number; gy: number } | null) => void
  onPasteAtCell: (gx: number, gy: number) => boolean
  onTileClipboardChange: (clipboard: TileClipboard) => void
  onTilesChange: (tiles: PlacedTile[]) => void
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
  rect: DOMRect,
): { gx: number; gy: number } | null {
  const cx = (sx - rect.left - panX) / zoom
  const cy = (sy - rect.top - panY) / zoom
  const gx = Math.floor(cx / GRID_CELL)
  const gy = Math.floor(cy / GRID_CELL)
  if (!inPlateBounds(gx, gy)) return null
  return { gx, gy }
}

function screenToWorld(
  sx: number,
  sy: number,
  panX: number,
  panY: number,
  zoom: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: (sx - rect.left - panX) / zoom,
    y: (sy - rect.top - panY) / zoom,
  }
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
  grid: { gx: number; gy: number } | null
}

type MarqueeState = {
  x0: number
  y0: number
  x1: number
  y1: number
}

type ZoomPreviewState = {
  baseZoom: number
  basePan: { x: number; y: number }
  commitTimer: number | null
}

export function CircuitCanvas({
  tiles,
  selectedIds,
  pendingCatalogId,
  tileClipboard,
  pasteTarget,
  onPasteTargetChange,
  onPasteAtCell,
  onTileClipboardChange,
  onTilesChange,
  onRemoveTiles,
  onSelectionChange,
  onPendingClear,
}: CircuitCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 80, y: 60 })
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 80, y: 60 })
  const pendingCatalogIdRef = useRef<string | null>(null)
  const tileClipboardRef = useRef<TileClipboard | null>(null)
  const onTileClipboardChangeRef = useRef(onTileClipboardChange)
  const lastWheelAtRef = useRef(0)

  useEffect(() => {
    zoomRef.current = zoom
    panRef.current = pan
  }, [zoom, pan])

  const [hoverCell, setHoverCell] = useState<{ gx: number; gy: number } | null>(null)
  const [placementRotation, setPlacementRotation] = useState<Rotation>(0)

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
    setPlacementRotation(0)
    setPlacementPreview(null)
  }, [pendingCatalogId])
  const [placementPreview, setPlacementPreview] =
    useState<PlacementPreviewState | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const marqueeRef = useRef<MarqueeState | null>(null)
  const smoothDragRef = useRef<SmoothDragState | null>(null)
  const paintRef = useRef<() => void>(() => {})
  const paintFrameRef = useRef<number | null>(null)
  const viewStateFrameRef = useRef<number | null>(null)
  const zoomPreviewRef = useRef<ZoomPreviewState | null>(null)
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

  const updateMarquee = useCallback(
    (next: MarqueeState | null) => {
      marqueeRef.current = next
      schedulePaint()
    },
    [schedulePaint],
  )

  const updateSmoothDrag = useCallback(
    (next: SmoothDragState | null) => {
      smoothDragRef.current = next
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
    const canvas = canvasRef.current
    if (canvas) {
      canvas.style.transform = ''
      canvas.style.willChange = ''
    }
    zoomPreviewRef.current = null
  }, [])

  const commitZoomPreview = useCallback(() => {
    clearZoomPreview()
    paintRef.current()
    syncViewState()
  }, [clearZoomPreview, syncViewState])

  const showZoomPreview = useCallback(
    (nextZoom: number, nextPan: { x: number; y: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return

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

      canvas.style.transformOrigin = '0 0'
      canvas.style.willChange = 'transform'
      canvas.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`

      preview.commitTimer = window.setTimeout(commitZoomPreview, 90)
      zoomPreviewRef.current = preview
    },
    [commitZoomPreview],
  )

  const isPanPointer = (e: React.PointerEvent | PointerEvent) =>
    e.button === 1 ||
    spaceHeldRef.current ||
    (e.button === 0 && (e.altKey || e.ctrlKey)) ||
    (e.button === 2 && e.ctrlKey)

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
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const currentZoom = zoomRef.current
    const currentPan = panRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#2b3036'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(currentPan.x, currentPan.y)
    ctx.scale(currentZoom, currentZoom)

    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.45)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    drawPlate(ctx, PLATE_W, PLATE_H)
    ctx.restore()

    const sorted = [...tiles].sort((a, b) => {
      const aSel = selectedSet.has(a.instanceId)
      const bSel = selectedSet.has(b.instanceId)
      if (aSel && !bSel) return 1
      if (!aSel && bSel) return -1
      return 0
    })
    const activeSmoothDrag = smoothDragRef.current
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

    const placementCell = pendingCatalogId ? (placementPreview?.grid ?? hoverCell) : null
    const pasteCell = tileClipboard ? (hoverCell ?? pasteTarget) : null
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
      const cellOccupied = tiles.some(
        (t) => t.gridX === highlightCell.gx && t.gridY === highlightCell.gy,
      )
      const pasteEntry = tileClipboard ? catalogById.get(tileClipboard.catalogId) : null
      const pasteQuantityBlocked =
        pasteEntry != null &&
        tiles.filter((t) => t.catalogId === tileClipboard!.catalogId).length >=
          pasteEntry.quantity
      const pasteInvalid = cellOccupied || pasteQuantityBlocked
      const isPasteTarget =
        tileClipboard != null &&
        pasteTarget?.gx === highlightCell.gx &&
        pasteTarget?.gy === highlightCell.gy
      const highlightInvalid = placementCell ? cellOccupied : pasteInvalid
      drawCellHighlight(highlightCell.gx, highlightCell.gy, {
        invalid: highlightInvalid,
        strong: isPasteTarget,
      })
    }

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

    if (pasteCell && tileClipboard && !pendingCatalogId) {
      const entry = catalogById.get(tileClipboard.catalogId)
      if (entry) {
        const cellOccupied = tiles.some(
          (t) => t.gridX === pasteCell.gx && t.gridY === pasteCell.gy,
        )
        const used = tiles.filter((t) => t.catalogId === tileClipboard.catalogId).length
        const invalid = cellOccupied || used >= entry.quantity
        ctx.save()
        ctx.globalAlpha = invalid ? 0.38 : 0.72
        drawTile(
          ctx,
          pasteCell.gx * GRID_CELL,
          pasteCell.gy * GRID_CELL,
          entry,
          tileClipboard.rotation,
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

    ctx.restore()

    if (activeSmoothDrag) {
      ctx.save()
      ctx.globalAlpha = activeSmoothDrag.valid ? 0.92 : 0.55

      const drawFloatingTile = (
        tile: PlacedTile,
        entry: NonNullable<ReturnType<typeof catalogById.get>>,
        screenX: number,
        screenY: number,
      ) => {
        ctx.save()
        ctx.translate(screenX, screenY)
        ctx.scale(currentZoom, currentZoom)
        drawTile(ctx, 0, 0, entry, tile.rotation, { selected: true })
        ctx.restore()
      }

      if (activeSmoothDrag.kind === 'tile') {
        const tile = tiles.find((t) => t.instanceId === activeSmoothDrag.instanceId)
        const entry = tile ? catalogById.get(tile.catalogId) : null
        if (tile && entry) {
          drawFloatingTile(tile, entry, activeSmoothDrag.screenX, activeSmoothDrag.screenY)
        }
      } else {
        for (const tile of tiles) {
          const origin = activeSmoothDrag.origins.get(tile.instanceId)
          if (!origin) continue
          const entry = catalogById.get(tile.catalogId)
          if (!entry) continue
          drawFloatingTile(
            tile,
            entry,
            currentPan.x +
              origin.gridX * GRID_CELL * currentZoom +
              activeSmoothDrag.dxScreen,
            currentPan.y +
              origin.gridY * GRID_CELL * currentZoom +
              activeSmoothDrag.dyScreen,
          )
        }
      }

      ctx.restore()
    }

    if (placementPreview && pendingCatalogId) {
      const entry = catalogById.get(pendingCatalogId)
      if (entry) {
        const invalid =
          placementPreview.grid == null ||
          tiles.some(
            (t) =>
              t.gridX === placementPreview.grid?.gx &&
              t.gridY === placementPreview.grid?.gy,
          )
        ctx.save()
        ctx.globalAlpha = invalid ? 0.42 : 0.76
        ctx.translate(
          placementPreview.screenX - (GRID_CELL * currentZoom) / 2,
          placementPreview.screenY - (GRID_CELL * currentZoom) / 2,
        )
        ctx.scale(currentZoom, currentZoom)
        drawTile(ctx, 0, 0, entry, placementRotation)
        ctx.restore()
      }
    }

    if (pendingCatalogId) {
      ctx.fillStyle = '#b8c4d8'
      ctx.font = '14px system-ui, sans-serif'
      ctx.fillText(
        'Click to place · R to rotate · scroll to zoom · Esc to cancel',
        16,
        h - 16,
      )
    } else if (tileClipboard) {
      ctx.fillStyle = '#b8c4d8'
      ctx.font = '14px system-ui, sans-serif'
      const msg =
        'Click an empty cell to paste once · R to rotate · Esc to cancel'
      ctx.fillText(msg, 16, h - 16)
    } else if (selectedIds.length === 0) {
      ctx.fillStyle = '#7d8796'
      ctx.font = '13px system-ui, sans-serif'
      ctx.fillText(
        'Drag on empty space to box-select tiles · Shift+drag adds · R: rotates · B: centers · Ctrl/Space+drag pans',
        16,
        h - 16,
      )
    }
  }, [
    tiles,
    selectedIds,
    pendingCatalogId,
    tileClipboard,
    pasteTarget,
    hoverCell,
    placementPreview,
    placementRotation,
  ])

  useEffect(() => {
    paintRef.current = paint
  }, [paint])

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
      const next = computeZoomAtLocal(localX, localY, zoomRef.current, panRef.current, opts)
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
      const next = computeZoomAtLocal(mx, my, zoomRef.current, panRef.current, {
        multiply: factor,
      })
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
    const nextPan = {
      x: (rect.width - PLATE_W * zoomRef.current) / 2,
      y: (rect.height - PLATE_H * zoomRef.current) / 2,
    }
    panRef.current = nextPan
    schedulePaint()
    syncViewState()
  }, [commitZoomPreview, schedulePaint, syncViewState])

  const handlePointerDown = (e: React.PointerEvent) => {
    if (zoomPreviewRef.current) commitZoomPreview()
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
      rect,
    )
    const world = screenToWorld(
      e.clientX,
      e.clientY,
      currentPan.x,
      currentPan.y,
      currentZoom,
      rect,
    )

    if (isPanPointer(e)) {
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
        updateSmoothDrag({
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
        })
        return
      }

      const tileX = hit.gridX * GRID_CELL
      const tileY = hit.gridY * GRID_CELL
      const tileScreenX = currentPan.x + tileX * currentZoom
      const tileScreenY = currentPan.y + tileY * currentZoom
      dragRef.current = {
        kind: 'tile',
        instanceId: hit.instanceId,
        startScreenX: e.clientX,
        startScreenY: e.clientY,
        pointerOffsetX: world.x - tileX,
        pointerOffsetY: world.y - tileY,
        screenOffsetX: e.clientX - rect.left - tileScreenX,
        screenOffsetY: e.clientY - rect.top - tileScreenY,
      }
      updateSmoothDrag({
        kind: 'tile',
        instanceId: hit.instanceId,
        x: tileX,
        y: tileY,
        screenX: tileScreenX,
        screenY: tileScreenY,
        targetGx: hit.gridX,
        targetGy: hit.gridY,
        valid: true,
      })
      return
    }

    // Empty plate or canvas: box-select (drag). Click without drag places/pastes.
    canvasRef.current?.setPointerCapture(e.pointerId)

    let pendingClick: { kind: 'place' | 'paste'; gx: number; gy: number } | undefined
    if (grid && pendingCatalogId) {
      pendingClick = { kind: 'place', gx: grid.gx, gy: grid.gy }
    } else if (grid && tileClipboard && !occupied(grid.gx, grid.gy)) {
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

  const updateHoverCell = (e: React.PointerEvent) => {
    if (!tileClipboard && !pendingCatalogId) {
      setHoverCell(null)
      setPlacementPreview(null)
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
      rect,
    )
    setHoverCell(grid)
    if (pendingCatalogId) {
      setPlacementPreview({
        screenX: e.clientX - rect.left,
        screenY: e.clientY - rect.top,
        grid,
      })
    }
    if (tileClipboard && grid && !occupied(grid.gx, grid.gy)) {
      onPasteTargetChange({ gx: grid.gx, gy: grid.gy })
    } else if (tileClipboard) {
      onPasteTargetChange(null)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    updateHoverCell(e)
    const rect = containerRef.current!.getBoundingClientRect()
    const drag = dragRef.current

    if (drag?.kind === 'marquee') {
      const currentPan = panRef.current
      const world = screenToWorld(
        e.clientX,
        e.clientY,
        currentPan.x,
        currentPan.y,
        zoomRef.current,
        rect,
      )
      updateMarquee({ x0: drag.startX, y0: drag.startY, x1: world.x, y1: world.y })
      return
    }

    if (!drag) return

    if (drag.kind === 'pan') {
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
      const currentZoom = zoomRef.current
      const dxScreen = e.clientX - rect.left - drag.startScreenX
      const dyScreen = e.clientY - rect.top - drag.startScreenY
      const dxWorld = dxScreen / currentZoom
      const dyWorld = dyScreen / currentZoom
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
        valid: canMoveGroup(tiles, groupIds, drag.origins, dx, dy),
      })
      e.preventDefault()
      return
    }

    if (drag.kind === 'tile') {
      const currentPan = panRef.current
      const currentZoom = zoomRef.current
      const screenX = e.clientX - rect.left - drag.screenOffsetX
      const screenY = e.clientY - rect.top - drag.screenOffsetY
      const x = (screenX - currentPan.x) / currentZoom
      const y = (screenY - currentPan.y) / currentZoom
      const gx = Math.round(x / GRID_CELL)
      const gy = Math.round(y / GRID_CELL)
      updateSmoothDrag({
        kind: 'tile',
        instanceId: drag.instanceId,
        x,
        y,
        screenX,
        screenY,
        targetGx: gx,
        targetGy: gy,
        valid: inPlateBounds(gx, gy) && !occupied(gx, gy, new Set([drag.instanceId])),
      })
      e.preventDefault()
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
      if (drag.pendingClick?.kind === 'place' && pendingCatalogId) {
        placeTile(pendingCatalogId, drag.pendingClick.gx, drag.pendingClick.gy)
      } else if (drag.pendingClick?.kind === 'paste') {
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
          onTilesChange(
            tiles.map((t) =>
              t.instanceId === drag.instanceId
                ? { ...t, rotation: nextRotation(t.rotation) }
                : t,
            ),
          )
          onSelectionChange([drag.instanceId])
          lastTileTapRef.current = null
          updateSmoothDrag(null)
          return
        }

        lastTileTapRef.current = {
          instanceId: drag.instanceId,
          time: now,
          screenX: e.clientX,
          screenY: e.clientY,
        }
      } else {
        lastTileTapRef.current = null
      }

      if (drag.valid) {
        onTilesChange(
          tiles.map((t) =>
            t.instanceId === drag.instanceId
              ? { ...t, gridX: drag.targetGx, gridY: drag.targetGy }
              : t,
          ),
        )
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
    if (drag?.kind === 'marquee') {
      finishMarquee(drag)
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
    setHoverCell(null)
    setPlacementPreview(null)
    if (
      dragRef.current?.kind !== 'pan' &&
      dragRef.current?.kind !== 'marquee' &&
      !canvasRef.current?.hasPointerCapture(e.pointerId)
    ) {
      endPointer(e)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    if (e.ctrlKey) e.preventDefault()
  }

  const rotateSelected = useCallback(() => {
    if (selectedIds.length === 0) return
    const set = new Set(selectedIds)
    onTilesChange(
      tiles.map((t) =>
        set.has(t.instanceId) ? { ...t, rotation: nextRotation(t.rotation) } : t,
      ),
    )
  }, [selectedIds, tiles, onTilesChange])

  const rotatePlacementPasteOrSelection = useCallback(() => {
    if (pendingCatalogId) {
      setPlacementRotation((r) => nextRotation(r))
      return
    }
    if (tileClipboard) {
      onTileClipboardChange({
        ...tileClipboard,
        rotation: nextRotation(tileClipboard.rotation),
      })
      return
    }
    rotateSelected()
  }, [pendingCatalogId, tileClipboard, onTileClipboardChange, rotateSelected])

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
      // Ignore key events that often follow trackpad pinch/zoom gestures.
      if (performance.now() - lastWheelAtRef.current < 200) return

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
        setPlacementPreview(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    onRemoveTiles,
    onSelectionChange,
    onPendingClear,
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
      <canvas
        ref={canvasRef}
        className={`circuit-canvas${tileClipboard ? ' paste-mode' : ''}${
          pendingCatalogId ? ' place-mode' : ''
        }${isPanning ? ' panning' : ''}`}
        title="R: rotates · B: centers · Hold Ctrl or Space and drag to pan · scroll to zoom"
        onContextMenu={handleContextMenu}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
      />
    </div>
  )
}
