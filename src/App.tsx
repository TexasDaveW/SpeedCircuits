import { useCallback, useEffect, useRef, useState } from 'react'
import { CircuitCanvas } from './components/CircuitCanvas'
import { LessonPanel } from './components/LessonPanel'
import { Palette } from './components/Palette'
import { exportCircuit } from './circuit'
import { openCircuitJsonFile, saveCircuitJsonFile, sanitizeCircuitFilename } from './circuitFile'
import { getBuiltinLesson, resolveBuiltinLessonId } from './builtinCircuits'
import { importCircuit, parseCircuitJson } from './circuitImport'
import { catalogById } from './catalog'
import { readLessonPanelVisible, writeLessonPanelVisible } from './lessonPanelPreference'
import { copyTile, pasteTileAt, type TileClipboard } from './tileClipboard'
import { pushUndoSnapshot } from './tileUndo'
import type { CircuitLesson, CircuitView, PlacedTile, Rotation } from './types'
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
  const [circuitName, setCircuitName] = useState('circuit')
  const [lesson, setLesson] = useState<CircuitLesson | null>(null)
  const [viewRotation, setViewRotation] = useState<Rotation>(0)
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [showLessonPanel, setShowLessonPanel] = useState(readLessonPanelVisible)
  const [exportJson, setExportJson] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusIsError, setStatusIsError] = useState(false)
  const [tileClipboard, setTileClipboard] = useState<TileClipboard | null>(null)
  const [pasteTarget, setPasteTarget] = useState<{ gx: number; gy: number } | null>(
    null,
  )
  const fileInputRef = useRef<HTMLInputElement>(null)
  const undoStackRef = useRef<PlacedTile[][]>([])

  const clearUndoHistory = useCallback(() => {
    undoStackRef.current = []
  }, [])

  const clearPlacementModes = useCallback(() => {
    setPendingCatalogId(null)
    setPasteTarget(null)
    setTileClipboard(null)
  }, [])

  const setStatus = (message: string, isError = false) => {
    setStatusMessage(message)
    setStatusIsError(isError)
  }

  const buildCircuitJson = useCallback(
    (
      tileList: PlacedTile[],
      name: string,
      lessonInfo?: CircuitLesson | null,
      view?: CircuitView,
    ) => {
      const doc = exportCircuit(tileList, name, lessonInfo ?? undefined, view)
      return JSON.stringify(doc, null, 2)
    },
    [],
  )

  const loadCircuit = useCallback(
    (
      tileList: PlacedTile[],
      name?: string,
      lessonInfo?: CircuitLesson | null,
      view?: CircuitView | null,
      builtinId?: string | null,
    ) => {
      if (name?.trim()) setCircuitName(name.trim())
      const nextLesson = lessonInfo ?? null
      setLesson(nextLesson)
      setViewRotation(view?.rotation ?? 0)
      setActiveLessonId(builtinId ?? null)
      clearUndoHistory()
      setTiles(tileList)
      setSelectedIds([])
      clearPlacementModes()
      setExportJson(null)
      setStatus(`Loaded ${tileList.length} tile${tileList.length === 1 ? '' : 's'}.`)
    },
    [clearPlacementModes, clearUndoHistory],
  )

  const tryLoadJsonText = useCallback(
    (text: string, suggestedName?: string) => {
      const result = parseCircuitJson(text)
      if (!result.ok) {
        setStatus(result.errors.join(' '), true)
        return
      }
      if (
        tiles.length > 0 &&
        !window.confirm('Replace the current circuit with the opened file?')
      ) {
        return
      }
      loadCircuit(result.tiles, result.name ?? suggestedName, result.lesson, result.view, null)
    },
    [tiles.length, loadCircuit],
  )

  const handleLoadBuiltinLesson = useCallback(
    (lessonId: string, options?: { skipConfirm?: boolean }) => {
      const resolvedId = resolveBuiltinLessonId(lessonId) ?? lessonId
      const builtin = getBuiltinLesson(resolvedId)
      if (!builtin) {
        setStatus('Lesson not found.', true)
        return
      }
      if (
        !options?.skipConfirm &&
        tiles.length > 0 &&
        !window.confirm('Replace the current circuit with this lesson?')
      ) {
        return
      }
      const result = importCircuit(builtin.document)
      if (!result.ok) {
        setStatus(result.errors.join(' '), true)
        return
      }
      loadCircuit(
        result.tiles,
        result.name ?? builtin.name,
        result.lesson ?? builtin.lesson,
        result.view,
        builtin.id,
      )
      setStatus(`Loaded lesson ${builtin.order}: ${builtin.name}.`)
    },
    [tiles.length, loadCircuit],
  )

  const handleSaveCircuit = useCallback(async () => {
    const promptedName = window.prompt('Circuit name', circuitName)
    if (promptedName === null) {
      setStatus('Save cancelled.')
      return
    }
    const nextCircuitName = promptedName.trim() || 'circuit'
    setCircuitName(nextCircuitName)

    const json = buildCircuitJson(tiles, nextCircuitName, lesson, {
      rotation: viewRotation,
    })
    const result = await saveCircuitJsonFile(json, nextCircuitName)
    if (result === 'saved') {
      setStatus(
        `Saved "${sanitizeCircuitFilename(nextCircuitName)}.json". In Chrome/Edge you can pick the folder; otherwise it goes to your Downloads.`,
      )
    } else if (result === 'cancelled') {
      setStatus('Save cancelled.')
    } else {
      setStatus('Could not save file.', true)
    }
  }, [tiles, circuitName, lesson, viewRotation, buildCircuitJson])

  const handleOpenCircuit = useCallback(async () => {
    const opened = await openCircuitJsonFile()
    if (opened === null) {
      fileInputRef.current?.click()
      return
    }
    if (opened === 'cancelled') return
    if (opened === 'failed') {
      setStatus('Could not open file.', true)
      return
    }
    tryLoadJsonText(opened.text, opened.suggestedName)
  }, [tryLoadJsonText])

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const suggestedName = file.name.replace(/\.json$/i, '') || 'circuit'
    file.text().then(
      (text) => tryLoadJsonText(text, suggestedName),
      () => setStatus('Could not read file.', true),
    )
  }

  const handleCopyJson = async () => {
    const json =
      exportJson ??
      buildCircuitJson(tiles, circuitName, lesson, { rotation: viewRotation })
    if (!exportJson) setExportJson(json)
    try {
      await navigator.clipboard.writeText(json)
      setStatus('Circuit JSON copied to clipboard.')
    } catch {
      setStatus('Could not copy to clipboard.', true)
    }
  }

  const handlePreviewJson = () => {
    if (exportJson) {
      setExportJson(null)
      setStatus('JSON preview hidden.')
      return
    }
    const json = buildCircuitJson(tiles, circuitName, lesson, { rotation: viewRotation })
    setExportJson(json)
    setStatus('JSON preview shown below (click Preview JSON again to hide).')
  }

  const handleRemoveTiles = useCallback(
    (instanceIds: string[]) => {
      if (instanceIds.length === 0) return
      undoStackRef.current = pushUndoSnapshot(undoStackRef.current, tiles)
      const remove = new Set(instanceIds)
      setTiles(tiles.filter((t) => !remove.has(t.instanceId)))
      setSelectedIds([])
      setStatus(
        `Removed ${instanceIds.length} tile${instanceIds.length === 1 ? '' : 's'}. Press ⌘Z to undo.`,
      )
    },
    [tiles],
  )

  const handleUndo = useCallback(() => {
    const prev = undoStackRef.current.pop()
    if (!prev) {
      setStatus('Nothing to undo.', true)
      return
    }
    setTiles(prev)
    setSelectedIds([])
    setStatus('Undid last removal.')
  }, [])

  const handleClear = () => {
    if (tiles.length === 0) return
    if (window.confirm('Remove all tiles from the canvas?')) {
      undoStackRef.current = pushUndoSnapshot(undoStackRef.current, tiles)
      setTiles([])
      setSelectedIds([])
      setTileClipboard(null)
      setPasteTarget(null)
      setPendingCatalogId(null)
      setExportJson(null)
      setLesson(null)
      setViewRotation(0)
      setActiveLessonId(null)
      setStatus('Canvas cleared.')
    }
  }

  const copySelectedTile = useCallback(() => {
    if (selectedIds.length !== 1) return false
    const tile = tiles.find((t) => t.instanceId === selectedIds[0])
    if (!tile) return false
    setTileClipboard(copyTile(tile))
    setPasteTarget(null)
    setSelectedIds([])
    return true
  }, [tiles, selectedIds])

  const pasteAtCell = useCallback(
    (gx: number, gy: number) => {
      if (!tileClipboard) return false
      const placed = pasteTileAt(tileClipboard, tiles, gx, gy)
      if (!placed) return false
      setTiles([...tiles, placed])
      setSelectedIds([placed.instanceId])
      setPasteTarget(null)
      setTileClipboard(null)
      setPendingCatalogId(null)
      return true
    },
    [tileClipboard, tiles],
  )

  const pasteFromClipboard = useCallback(() => {
    if (!pasteTarget) return false
    return pasteAtCell(pasteTarget.gx, pasteTarget.gy)
  }, [pasteTarget, pasteAtCell])

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('lesson')
    if (!param) return
    const id = resolveBuiltinLessonId(param)
    if (!id) {
      setStatus(`Unknown lesson "${param}".`, true)
      return
    }
    handleLoadBuiltinLesson(id, { skipConfirm: true })
  }, [handleLoadBuiltinLesson])

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
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault()
        handleSaveCircuit()
      }
      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault()
        handleOpenCircuit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    selectedIds,
    tileClipboard,
    pasteTarget,
    copySelectedTile,
    pasteFromClipboard,
    handleSaveCircuit,
    handleOpenCircuit,
  ])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) return
      if (e.key !== 'z' && e.key !== 'Z') return
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return
      e.preventDefault()
      handleUndo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleUndo])

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

  const toggleLessonPanel = () => {
    setShowLessonPanel((on) => {
      const next = !on
      writeLessonPanelVisible(next)
      return next
    })
  }

  const lessonTitle = lesson?.title?.trim() || circuitName
  const lessonDescription = lesson?.description?.trim() || null

  return (
    <div className="app">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="file-input-hidden"
        onChange={handleFileInputChange}
      />
      <Palette
        tiles={tiles}
        pendingCatalogId={pendingCatalogId}
        activeLessonId={activeLessonId}
        onLoadLesson={handleLoadBuiltinLesson}
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
          <label className="circuit-name-field">
            <span>Name</span>
            <input
              type="text"
              value={circuitName}
              onChange={(e) => setCircuitName(e.target.value)}
              placeholder="circuit"
              spellCheck={false}
            />
          </label>
          <button type="button" onClick={handleSaveCircuit} title="⌘S">
            Save circuit…
          </button>
          <button type="button" onClick={handleOpenCircuit} title="⌘O">
            Open circuit…
          </button>
          <button type="button" onClick={handlePreviewJson}>
            Preview JSON
          </button>
          <button type="button" onClick={handleCopyJson}>
            Copy JSON
          </button>
          <button
            type="button"
            className={showLessonPanel ? 'toggle-active' : undefined}
            onClick={toggleLessonPanel}
            aria-pressed={showLessonPanel}
          >
            Lesson notes
          </button>
          <button type="button" onClick={copySelectedTile} disabled={!canCopy} title="⌘C">
            Copy tile
          </button>
          <button type="button" onClick={pasteFromClipboard} disabled={!canPaste} title="⌘V">
            Paste tile
          </button>
          <button type="button" onClick={handleUndo} title="⌘Z">
            Undo
          </button>
          <button type="button" className="danger" onClick={handleClear}>
            Clear canvas
          </button>
        </div>
        {statusMessage && (
          <p className={`file-status${statusIsError ? ' error' : ''}`}>{statusMessage}</p>
        )}
        {tileClipboard && (
          <p className="paste-hint">
            Click an empty cell to paste once. <strong>R</strong> to rotate before placing.{' '}
            <strong>Esc</strong> to cancel.
          </p>
        )}
        {selectedIds.length > 1 && (
          <p className="paste-hint selection-hint">
            {selectedIds.length} tiles selected — drag to move together.{' '}
            <strong>Shift</strong>+click or drag a box to add to selection.
          </p>
        )}
        <div className="workspace-body">
          <CircuitCanvas
            tiles={tiles}
            viewRotation={viewRotation}
            selectedIds={selectedIds}
            pendingCatalogId={pendingCatalogId}
            tileClipboard={tileClipboard}
            pasteTarget={pasteTarget}
            onPasteTargetChange={setPasteTarget}
            onPasteAtCell={pasteAtCell}
            onTileClipboardChange={setTileClipboard}
            onTilesChange={setTiles}
            onViewRotationChange={setViewRotation}
            onRemoveTiles={handleRemoveTiles}
            onSelectionChange={(ids) => {
              setSelectedIds(ids)
              if (ids.length > 0) setPasteTarget(null)
            }}
            onPendingClear={clearPlacementModes}
          />
          {showLessonPanel && (
            <LessonPanel title={lessonTitle} description={lessonDescription} />
          )}
        </div>
        {exportJson && (
          <div className="json-preview-wrap">
            <div className="json-preview-header">
              <span>JSON preview</span>
              <button type="button" onClick={() => setExportJson(null)}>
                Close
              </button>
            </div>
            <pre className="json-preview" aria-label="Circuit JSON preview">
              {exportJson}
            </pre>
          </div>
        )}
      </main>
    </div>
  )
}