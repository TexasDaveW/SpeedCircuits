import { COMPONENT_CATALOG, catalogById } from '../catalog'
import type { CatalogEntry, PlacedTile, TileCategory } from '../types'

const CATEGORY_ORDER: TileCategory[] = [
  'routing',
  'component',
  'power',
  'ground',
  'arduino',
]

const CATEGORY_LABEL: Record<TileCategory, string> = {
  routing: 'Routing',
  component: 'Components',
  power: 'Power',
  ground: 'Ground',
  arduino: 'Arduino',
}

interface PaletteProps {
  tiles: PlacedTile[]
  pendingCatalogId: string | null
  onPick: (catalogId: string | null) => void
}

function countUsed(tiles: PlacedTile[], catalogId: string): number {
  return tiles.filter((t) => t.catalogId === catalogId).length
}

export function Palette({ tiles, pendingCatalogId, onPick }: PaletteProps) {
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: COMPONENT_CATALOG.filter((e) => e.category === cat),
  }))

  return (
    <aside className="palette">
      <header className="palette-header">
        <h1>SpeedCircuits</h1>
        <p>Select a tile, then click the plate to place it.</p>
      </header>
      {grouped.map(({ cat, items }) => (
        <section key={cat} className="palette-section">
          <h2>{CATEGORY_LABEL[cat]}</h2>
          <ul>
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
        </section>
      ))}
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
