import { useEffect, useMemo, useState } from 'react'
import { COMPONENT_CATALOG, catalogById } from '../catalog'
import {
  PALETTE_GROUP_LABEL,
  PALETTE_GROUP_ORDER,
  paletteGroupFor,
  type PaletteGroup,
} from '../paletteGroups'
import type { CatalogEntry, PlacedTile } from '../types'

interface PaletteProps {
  tiles: PlacedTile[]
  pendingCatalogId: string | null
  onPick: (catalogId: string | null) => void
}

function countUsed(tiles: PlacedTile[], catalogId: string): number {
  return tiles.filter((t) => t.catalogId === catalogId).length
}

function groupItems() {
  const buckets = new Map<PaletteGroup, CatalogEntry[]>()
  for (const group of PALETTE_GROUP_ORDER) {
    buckets.set(group, [])
  }
  for (const entry of COMPONENT_CATALOG) {
    const group = paletteGroupFor(entry)
    buckets.get(group)!.push(entry)
  }
  return PALETTE_GROUP_ORDER.map((group) => ({
    group,
    items: buckets.get(group)!,
  })).filter(({ items }) => items.length > 0)
}

export function Palette({ tiles, pendingCatalogId, onPick }: PaletteProps) {
  const grouped = useMemo(() => groupItems(), [])
  const allGroups = useMemo(() => grouped.map((g) => g.group), [grouped])

  const [collapsed, setCollapsed] = useState<Set<PaletteGroup>>(() => new Set())

  useEffect(() => {
    if (!pendingCatalogId) return
    const entry = catalogById.get(pendingCatalogId)
    if (!entry) return
    const group = paletteGroupFor(entry)
    setCollapsed((prev) => {
      if (!prev.has(group)) return prev
      const next = new Set(prev)
      next.delete(group)
      return next
    })
  }, [pendingCatalogId])

  const toggleGroup = (group: PaletteGroup) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const expandAll = () => setCollapsed(new Set())
  const collapseAll = () => setCollapsed(new Set(allGroups))

  return (
    <aside className="palette">
      <header className="palette-header">
        <h1>SpeedCircuits</h1>
        <p>
          Select a tile, hover the plate to preview, R to rotate, then click to place.
        </p>
        <div className="palette-tree-actions">
          <button type="button" onClick={expandAll}>
            Expand all
          </button>
          <button type="button" onClick={collapseAll}>
            Collapse all
          </button>
        </div>
      </header>
      <nav className="palette-tree" aria-label="Component palette">
        {grouped.map(({ group, items }) => {
          const isOpen = !collapsed.has(group)
          const usedInGroup = items.reduce(
            (sum, e) => sum + countUsed(tiles, e.id),
            0,
          )
          const totalInGroup = items.reduce((sum, e) => sum + e.quantity, 0)
          const hasSelection = items.some((e) => e.id === pendingCatalogId)

          return (
            <section key={group} className="palette-tree-group">
              <button
                type="button"
                className={`palette-tree-toggle${isOpen ? ' open' : ''}${
                  hasSelection ? ' has-selection' : ''
                }`}
                onClick={() => toggleGroup(group)}
                aria-expanded={isOpen}
              >
                <span className="palette-tree-chevron" aria-hidden>
                  ▶
                </span>
                <span className="palette-tree-label">{PALETTE_GROUP_LABEL[group]}</span>
                <span className="palette-tree-meta">
                  {usedInGroup}/{totalInGroup}
                </span>
              </button>
              {isOpen && (
                <ul className="palette-tree-items">
                  {items.map((entry) => (
                    <PaletteItem
                      key={entry.id}
                      entry={entry}
                      used={countUsed(tiles, entry.id)}
                      selected={pendingCatalogId === entry.id}
                      disabled={countUsed(tiles, entry.id) >= entry.quantity}
                      onPick={() =>
                        onPick(pendingCatalogId === entry.id ? null : entry.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          )
        })}
      </nav>
    </aside>
  )
}

function PaletteItem({
  entry,
  used,
  selected,
  disabled,
  onPick,
}: {
  entry: CatalogEntry
  used: number
  selected: boolean
  disabled: boolean
  onPick: () => void
}) {
  return (
    <li>
      <button
        type="button"
        className={`palette-item${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
        onClick={onPick}
        disabled={disabled}
        title={entry.name}
      >
        <span className="palette-item-name">{entry.name}</span>
        <span className="palette-item-qty">
          {used}/{entry.quantity}
        </span>
      </button>
    </li>
  )
}

export function PalettePreview({ catalogId }: { catalogId: string }) {
  const entry = catalogById.get(catalogId)
  if (!entry) return null
  return <span className="palette-preview-label">{entry.name}</span>
}
