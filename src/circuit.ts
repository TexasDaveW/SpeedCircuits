import { catalogById } from './catalog'
import { neighborOffset, oppositeSide, rotateSide, sidesAtRotation } from './geometry'
import type {
  CircuitConnection,
  CircuitDocument,
  CircuitLesson,
  CircuitView,
  PlacedTile,
  Side,
} from './types'

function portKey(instanceId: string, side: Side): string {
  return `${instanceId}:${side}`
}

function linkPorts(
  connections: CircuitConnection[],
  seen: Set<string>,
  instanceId: string,
  sideA: Side,
  sideB: Side,
) {
  const key = [portKey(instanceId, sideA), portKey(instanceId, sideB)].sort().join('|')
  if (seen.has(key)) return
  seen.add(key)
  connections.push({
    a: { instanceId, side: sideA },
    b: { instanceId, side: sideB },
  })
}

export function buildConnections(tiles: PlacedTile[]): CircuitConnection[] {
  const byCell = new Map<string, PlacedTile>()
  for (const t of tiles) {
    byCell.set(`${t.gridX},${t.gridY}`, t)
  }

  const connections: CircuitConnection[] = []
  const seen = new Set<string>()

  for (const tile of tiles) {
    const entry = catalogById.get(tile.catalogId)
    if (!entry) continue

    const ports = sidesAtRotation(entry.ports, tile.rotation)

    if (entry.plateGround) {
      const key = `${tile.instanceId}:plate`
      if (!seen.has(key)) {
        seen.add(key)
        const undersideOnly =
          entry.category === 'ground' || entry.category === 'power'
        // Underside plate contact uses a side not listed in ports (avoids shorting V+ to GND).
        const plateSide: Side =
          entry.category === 'power'
            ? 'west'
            : entry.category === 'ground'
              ? 'south'
              : (ports[0] ?? 'south')
        connections.push({
          a: {
            instanceId: tile.instanceId,
            side: undersideOnly ? plateSide : (ports[0] ?? 'south'),
          },
          b: { net: 'PLATE_GND' },
        })
      }
    }

    if (entry.category === 'power') {
      for (const side of ports) {
        connections.push({
          a: { instanceId: tile.instanceId, side },
          b: { net: 'USB_VCC' },
        })
      }
    }

    for (const side of ports) {
      const { dx, dy } = neighborOffset(side)
      const neighbor = byCell.get(`${tile.gridX + dx},${tile.gridY + dy}`)
      if (!neighbor) continue

      const neighborEntry = catalogById.get(neighbor.catalogId)
      if (!neighborEntry) continue

      const neighborPorts = sidesAtRotation(neighborEntry.ports, neighbor.rotation)
      const facing = oppositeSide(side)
      if (!neighborPorts.includes(facing)) continue

      const idA = tile.instanceId < neighbor.instanceId ? tile.instanceId : neighbor.instanceId
      const idB = tile.instanceId < neighbor.instanceId ? neighbor.instanceId : tile.instanceId
      const sideA = tile.instanceId < neighbor.instanceId ? side : facing
      const sideB = tile.instanceId < neighbor.instanceId ? facing : side
      const key = [portKey(idA, sideA), portKey(idB, sideB)].sort().join('|')
      if (seen.has(key)) continue
      seen.add(key)
      connections.push({
        a: { instanceId: tile.instanceId, side },
        b: { instanceId: neighbor.instanceId, side: facing },
      })
    }

    // Overpass: W↔E and N↔S internally; the two axes do not short together.
    if (entry.id === 'overpass-cube') {
      linkPorts(
        connections,
        seen,
        tile.instanceId,
        rotateSide('west', tile.rotation),
        rotateSide('east', tile.rotation),
      )
      linkPorts(
        connections,
        seen,
        tile.instanceId,
        rotateSide('north', tile.rotation),
        rotateSide('south', tile.rotation),
      )
    }

    // Hall: west and east are the same SIG output (use either side when flipped).
    if (entry.id === 'hall-sensor') {
      linkPorts(
        connections,
        seen,
        tile.instanceId,
        rotateSide('west', tile.rotation),
        rotateSide('east', tile.rotation),
      )
    }

    // Optical interrupt: north↔south = IR LED (L+/L−); west/east = phototransistor S+/S− (no short across pairs).
    if (entry.id === 'optical-interrupt') {
      linkPorts(
        connections,
        seen,
        tile.instanceId,
        rotateSide('north', tile.rotation),
        rotateSide('south', tile.rotation),
      )
    }

    // NPN: west and east are the same base (route control or Darlington link from either side).
    if (entry.id === 'npn') {
      linkPorts(
        connections,
        seen,
        tile.instanceId,
        rotateSide('west', tile.rotation),
        rotateSide('east', tile.rotation),
      )
    }
  }

  return connections
}

export function buildNets(connections: CircuitConnection[]): string[][] {
  const parent = new Map<string, string>()

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x)
    const p = parent.get(x)!
    if (p === x) return x
    const root = find(p)
    parent.set(x, root)
    return root
  }

  function union(a: string, b: string) {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  function endpointKey(
    end: CircuitConnection['a'] | CircuitConnection['b'],
  ): string {
    if ('net' in end) return `net:${end.net}`
    return portKey(end.instanceId, end.side)
  }

  for (const c of connections) {
    union(endpointKey(c.a), endpointKey(c.b))
  }

  const groups = new Map<string, Set<string>>()
  for (const c of connections) {
    for (const end of [c.a, c.b]) {
      const key = endpointKey(end)
      const root = find(key)
      if (!groups.has(root)) groups.set(root, new Set())
      groups.get(root)!.add(key)
    }
  }

  return [...groups.values()].map((s) => [...s].sort())
}

export function exportCircuit(
  tiles: PlacedTile[],
  name?: string,
  lesson?: CircuitLesson,
  view?: CircuitView,
): CircuitDocument {
  const connections = buildConnections(tiles)
  const trimmed = name?.trim()
  const description = lesson?.description?.trim()
  const viewRotation = view?.rotation ?? 0
  return {
    version: 1,
    name: trimmed || undefined,
    lesson: description
      ? {
          title: lesson?.title?.trim() || trimmed || undefined,
          description,
        }
      : undefined,
    view: viewRotation !== 0 ? { rotation: viewRotation } : undefined,
    exportedAt: new Date().toISOString(),
    tiles: tiles.map((t) => {
      const entry = catalogById.get(t.catalogId)!
      return {
        instanceId: t.instanceId,
        catalogId: t.catalogId,
        name: entry.name,
        category: entry.category,
        value: entry.valueLabel,
        gridX: t.gridX,
        gridY: t.gridY,
        rotation: t.rotation,
        plateGround: entry.plateGround,
      }
    }),
    connections,
    nets: buildNets(connections),
  }
}
