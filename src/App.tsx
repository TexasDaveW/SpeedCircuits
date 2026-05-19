import { useCallback, useEffect, useState } from 'react'
import { CircuitCanvas } from './components/CircuitCanvas'
import { Palette } from './components/Palette'
import { exportCircuit } from './circuit'
import { catalogById } from './catalog'
import { copyTile, pasteTileAt, type TileClipboard } from './tileClipboard'
import type { PlacedTile } from './types'
import './App.css'

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

export default function App() {
  const [tiles, setTiles] = useState<PlacedTile[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pendingCatalogId, setPendingCatalogId] = useState<string | null>(null)
  const [exportJson, setExportJson] = useState<string | null>(null)
  const [tileClipboard, setTileClipboard] = useState<TileClipboard | null>(null)
  const [pasteTarget, setPasteTarget] = useState<{ gx: number; gy: number } | null>(
    null,
  )

  const circuitJson = exportJson

  const clearPlacementModes = useCallback(() => {
    setPendingCatalogId(null)
    setPasteTarget(null)
  }, [])

  const handleExport = () => {
    const doc = exportCircuit(tiles)
    const text = JSON.stringify(doc, null, 2)
    setExportJson(text)
  }

  const handleCopyJson = async () => {
    if (!circuitJson) return
    await navigator.clipboard.writeText(circuitJson)
  }

  const handleDownload = () => {
    if (!circuitJson) return
    const blob = new Blob([circuitJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'circuit.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = () => {
    if (tiles.length === 0) return
    if (window.confirm('Remove all tiles from the canvas?')) {
      setTiles([])
      setSelectedIds([])
      setTileClipboard(null)
      setPasteTarget(null)
      setPendingCatalogId(null)
    }
  }

  const copySelectedTile = useCallback(() => {
    if (selectedIds.length !== 1) return false
    const tile = tiles.find((t) => t.instanceId === selectedIds[0])
    if (!tile) return false
    setTileClipboard(copyTile(tile))
    setPasteTarget(null)
    return true
  }, [tiles, selectedIds])

  const pasteFromClipboard = useCallback(() => {
    if (!tileClipboard || !pasteTarget) return false
    const placed = pasteTileAt(
      tileClipboard,
      tiles,
      pasteTarget.gx,
      pasteTarget.gy,
    )
    if (!placed) return false
    setTiles([...tiles, placed])
    setSelectedIds([placed.instanceId])
    setPasteTarget(null)
    setPendingCatalogId(null)
    return true
  }, [tileClipboard, pasteTarget, tiles])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      if (e.key === 'c' || e.key === 'C') {
        if (selectedIds.length !== 1) return
        e.preventDefault()
        copySelectedTile()
      }
      if (e.key === 'v' || e.key === 'V') {
        if (!tileClipboard || !pasteTarget) return
        e.preventDefault()
        pasteFromClipboard()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, tileClipboard, pasteTarget, copySelectedTile, pasteFromClipboard])

  const canCopy = selectedIds.length === 1
  const pasteCellFree =
    pasteTarget &&
    !tiles.some((t) => t.gridX === pasteTarget.gx && t.gridY === pasteTarget.gy)
  const quantityOk =
    tileClipboard &&
    (() => {
      const entry = catalogById.get(tileClipboard.catalogId)
      if (!entry) return false
      const used = tiles.filter((t) => t.catalogId === tileClipboard.catalogId).length
      return used < entry.quantity
    })()

  const canPaste = !!tileClipboard && !!pasteCellFree && !!quantityOk

  return (
    <div className="app">
      <Palette
        tiles={tiles}
        pendingCatalogId={pendingCatalogId}
        onPick={(id) => {
          setPendingCatalogId(id)
          if (id) {
            setPasteTarget(null)
            setSelectedIds([])
          }
        }}
      />
      <main className="workspace">
        <div className="workspace-actions">
          <button type="button" onClick={copySelectedTile} disabled={!canCopy} title="⌘C">
            Copy tile
          </button>
          <button type="button" onClick={pasteFromClipboard} disabled={!canPaste} title="⌘V">
            Paste tile
          </button>
          <button type="button" onClick={handleExport}>
            Export circuit JSON
          </button>
          {circuitJson && (
            <>
              <button type="button" onClick={handleCopyJson}>
                Copy JSON
              </button>
              <button type="button" onClick={handleDownload}>
                Download JSON
              </button>
            </>
          )}
          <button type="button" className="danger" onClick={handleClear}>
            Clear canvas
          </button>
        </div>
        {tileClipboard && (
          <p className="paste-hint">
            Click an <strong>empty</strong> plate cell to choose where to paste, then Paste
            or ⌘V. Occupied cells cannot be used.
          </p>
        )}
        {selectedIds.length > 1 && (
          <p className="paste-hint selection-hint">
            {selectedIds.length} tiles selected — drag to move together.{' '}
            <strong>Shift</strong>+click or drag a box to add to selection.
          </p>
        )}
        <CircuitCanvas
          tiles={tiles}
          selectedIds={selectedIds}
          pendingCatalogId={pendingCatalogId}
          clipboardActive={!!tileClipboard}
          pasteTarget={pasteTarget}
          onPasteTargetChange={setPasteTarget}
          onTilesChange={setTiles}
          onSelectionChange={(ids) => {
            setSelectedIds(ids)
            if (ids.length > 0) setPasteTarget(null)
          }}
          onPendingClear={clearPlacementModes}
        />
        {circuitJson && (
          <pre className="json-preview" aria-label="Exported circuit JSON">
            {circuitJson}
          </pre>
        )}
      </main>
    </div>
  )
}
