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
      offsetGx: number
      offsetGy: number
    }
  | {
      kind: 'group'
      startGx: number
      startGy: number
      origins: Map<string, { gridX: number; gridY: number }>
    }
  | {
      kind: 'marquee'
      startX: number
      startY: number
      addToSelection: boolean
      pendingClick?: { kind: 'place' | 'paste'; gx: number; gy: number }
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
  }, [pendingCatalogId])
  const [marquee, setMarquee] = useState<{
    x0: number
    y0: number
    x1: number
    y1: number
  } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const dragRef = useRef<DragState | null>(null)
  const spaceHeldRef = useRef(false)
  const selectedSet = new Set(selectedIds)

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

    const dpr = window.devicePixelRatio || 1
    const w = container.clientWidth
    const h = container.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = '#2b3036'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.translate(pan.x, pan.y)
    ctx.scale(zoom, zoom)

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

    for (const tile of sorted) {
      const entry = catalogById.get(tile.catalogId)
      if (!entry) continue
      drawTile(ctx, tile.gridX * GRID_CELL, tile.gridY * GRID_CELL, entry, tile.rotation, {
        selected: selectedSet.has(tile.instanceId),
      })
    }

    const placementCell = pendingCatalogId ? hoverCell : null
    const pasteCell = tileClipboard ? (hoverCell ?? pasteTarget) : null
    const highlightCell = placementCell ?? pasteCell

    if (highlightCell) {
      const hx = highlightCell.gx * GRID_CELL
      const hy = highlightCell.gy * GRID_CELL
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
      ctx.fillStyle = highlightInvalid
        ? 'rgba(220, 80, 80, 0.22)'
        : isPasteTarget
          ? 'rgba(77, 159, 255, 0.35)'
          : 'rgba(77, 159, 255, 0.18)'
      ctx.fillRect(hx, hy, GRID_CELL, GRID_CELL)
      ctx.strokeStyle = highlightInvalid
        ? 'rgba(220, 80, 80, 0.85)'
        : 'rgba(77, 159, 255, 0.9)'
      ctx.lineWidth = isPasteTarget ? 3 : 2
      ctx.strokeRect(hx + 1, hy + 1, GRID_CELL - 2, GRID_CELL - 2)
    }

    if (placementCell && pendingCatalogId) {
      const entry = catalogById.get(pendingCatalogId)
      if (entry) {
        const cellOccupied = tiles.some(
          (t) => t.gridX === placementCell.gx && t.gridY === placementCell.gy,
        )
        ctx.save()
        ctx.globalAlpha = cellOccupied ? 0.38 : 0.72
        drawTile(
          ctx,
          placementCell.gx * GRID_CELL,
          placementCell.gy * GRID_CELL,
          entry,
          placementRotation,
        )
        ctx.restore()
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

    if (marquee) {
      const mx = Math.min(marquee.x0, marquee.x1)
      const my = Math.min(marquee.y0, marquee.y1)
      const mw = Math.abs(marquee.x1 - marquee.x0)
      const mh = Math.abs(marquee.y1 - marquee.y0)
      ctx.fillStyle = 'rgba(77, 159, 255, 0.12)'
      ctx.fillRect(mx, my, mw, mh)
      ctx.strokeStyle = 'rgba(77, 159, 255, 0.95)'
      ctx.lineWidth = 2
      ctx.setLineDash([6, 4])
      ctx.strokeRect(mx, my, mw, mh)
      ctx.setLineDash([])
    }

    ctx.restore()

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
    pan,
    zoom,
    pendingCatalogId,
    tileClipboard,
    pasteTarget,
    hoverCell,
    placementRotation,
    marquee,
  ])

  useEffect(() => {
    paint()
    const ro = new ResizeObserver(paint)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [paint])

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
      const next = computeZoomAtLocal(localX, localY, zoomRef.current, panRef.current, opts)
      zoomRef.current = next.zoom
      panRef.current = next.pan
      setZoom(next.zoom)
      setPan(next.pan)
    },
    [],
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
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      lastWheelAtRef.current = performance.now()

      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      // Trackpad pinch-zoom on macOS sets ctrlKey; use gentler steps for pinch.
      const pinch = e.ctrlKey || e.metaKey
      const factor = pinch
        ? e.deltaY > 0
          ? 0.98
          : 1.02
        : e.deltaY > 0
          ? 0.92
          : 1.08
      const next = computeZoomAtLocal(mx, my, zoomRef.current, panRef.current, {
        multiply: factor,
      })
      zoomRef.current = next.zoom
      panRef.current = next.pan
      setZoom(next.zoom)
      setPan(next.pan)
    }

    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const zoomFromToolbar = (factor: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    applyZoomAtLocal(rect.width / 2, rect.height / 2, { multiply: factor })
  }

  const centerCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const nextPan = {
      x: (rect.width - PLATE_W * zoomRef.current) / 2,
      y: (rect.height - PLATE_H * zoomRef.current) / 2,
    }
    panRef.current = nextPan
    setPan(nextPan)
  }, [])

  const handlePointerDown = (e: React.PointerEvent) => {
    containerRef.current?.focus({ preventScroll: true })
    const rect = canvasRef.current!.getBoundingClientRect()
    const grid = screenToGrid(e.clientX, e.clientY, pan.x, pan.y, zoom, rect)
    const world = screenToWorld(e.clientX, e.clientY, pan.x, pan.y, zoom, rect)

    if (isPanPointer(e)) {
      e.preventDefault()
      canvasRef.current?.setPointerCapture(e.pointerId)
      setIsPanning(true)
      dragRef.current = {
        kind: 'pan',
        startX: e.clientX,
        startY: e.clientY,
        panX: pan.x,
        panY: pan.y,
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
          startGx: grid.gx,
          startGy: grid.gy,
          origins,
        }
        return
      }

      dragRef.current = {
        kind: 'tile',
        instanceId: hit.instanceId,
        offsetGx: grid.gx - hit.gridX,
        offsetGy: grid.gy - hit.gridY,
      }
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
    setMarquee({ x0: world.x, y0: world.y, x1: world.x, y1: world.y })
  }

  const updateHoverCell = (e: React.PointerEvent) => {
    if (!tileClipboard && !pendingCatalogId) {
      setHoverCell(null)
      return
    }
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const grid = screenToGrid(e.clientX, e.clientY, pan.x, pan.y, zoom, rect)
    setHoverCell(grid)
    if (tileClipboard && grid && !occupied(grid.gx, grid.gy)) {
      onPasteTargetChange({ gx: grid.gx, gy: grid.gy })
    } else if (tileClipboard) {
      onPasteTargetChange(null)
    }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    updateHoverCell(e)
    const rect = canvasRef.current!.getBoundingClientRect()
    const drag = dragRef.current

    if (drag?.kind === 'marquee') {
      const world = screenToWorld(e.clientX, e.clientY, pan.x, pan.y, zoom, rect)
      setMarquee({ x0: drag.startX, y0: drag.startY, x1: world.x, y1: world.y })
      return
    }

    if (!drag) return

    if (drag.kind === 'pan') {
      const newPan = {
        x: drag.panX + (e.clientX - drag.startX),
        y: drag.panY + (e.clientY - drag.startY),
      }
      panRef.current = newPan
      setPan(newPan)
      return
    }

    const grid = screenToGrid(e.clientX, e.clientY, pan.x, pan.y, zoom, rect)
    if (!grid) return

    if (drag.kind === 'group') {
      const dx = grid.gx - drag.startGx
      const dy = grid.gy - drag.startGy
      const groupIds = new Set(drag.origins.keys())
      if (!canMoveGroup(tiles, groupIds, drag.origins, dx, dy)) return
      onTilesChange(moveGroupFromOrigins(tiles, groupIds, drag.origins, dx, dy))
      return
    }

    if (drag.kind === 'tile') {
      const gx = grid.gx - drag.offsetGx
      const gy = grid.gy - drag.offsetGy
      if (!inPlateBounds(gx, gy)) return
      if (occupied(gx, gy, new Set([drag.instanceId]))) return

      onTilesChange(
        tiles.map((t) =>
          t.instanceId === drag.instanceId ? { ...t, gridX: gx, gridY: gy } : t,
        ),
      )
    }
  }

  const finishMarquee = (drag: Extract<DragState, { kind: 'marquee' }>) => {
    const box = marquee ?? {
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
      setMarquee(null)
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
    setMarquee(null)
  }

  const endPointer = (e: React.PointerEvent) => {
    if (canvasRef.current?.hasPointerCapture(e.pointerId)) {
      canvasRef.current.releasePointerCapture(e.pointerId)
    }
    const drag = dragRef.current
    if (drag?.kind === 'marquee') {
      finishMarquee(drag)
    }
    dragRef.current = null
    setIsPanning(false)
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    endPointer(e)
  }

  const handlePointerLeave = (e: React.PointerEvent) => {
    setHoverCell(null)
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
        setMarquee(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, onRemoveTiles, onSelectionChange, onPendingClear])

  return (
    <div
      className="canvas-panel"
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label="Circuit plate editor"
    >
      <div className="canvas-toolbar">
        <button type="button" onClick={() => zoomFromToolbar(1.15)}>
          Zoom in
        </button>
        <button type="button" onClick={() => zoomFromToolbar(1 / 1.15)}>
          Zoom out
        </button>
        <button
          type="button"
          onClick={() => {
            const canvas = canvasRef.current
            if (!canvas) {
              zoomRef.current = 1
              panRef.current = { x: 80, y: 60 }
              setZoom(1)
              setPan({ x: 80, y: 60 })
              return
            }
            const rect = canvas.getBoundingClientRect()
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
