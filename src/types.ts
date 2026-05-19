export type TileCategory =
  | 'component'
  | 'routing'
  | 'power'
  | 'ground'
  | 'arduino'

export type Side = 'north' | 'east' | 'south' | 'west'

export type Rotation = 0 | 90 | 180 | 270

export type SymbolId =
  | 'resistor'
  | 'capacitor'
  | 'inductor'
  | 'diode'
  | 'led'
  | 'led_rgb'
  | 'npn'
  | 'nmos'
  | 'potentiometer'
  | 'switch_spdt'
  | 'switch_momentary'
  | 'sensor_resistive'
  | 'sensor'
  | 'sensor_north'
  | 'motor'
  | 'buzzer'
  | 'touch_pad'
  | 'ground'
  | 'ground_tile'
  | 'power'
  | 'power_tile'
  | 'arduino'

export interface CatalogEntry {
  id: string
  name: string
  category: TileCategory
  quantity: number
  valueLabel?: string
  typeLabel: string
  /** Conductor positions at 0° rotation */
  ports: Side[]
  /** Connects to ferrous plate ground */
  plateGround?: boolean
  symbolId?: SymbolId
}

export interface PlacedTile {
  instanceId: string
  catalogId: string
  gridX: number
  gridY: number
  rotation: Rotation
}

export interface CircuitConnection {
  a: { instanceId: string; side: Side }
  b: { instanceId: string; side: Side } | { net: 'PLATE_GND' | 'USB_VCC' }
}

export interface CircuitDocument {
  version: 1
  exportedAt: string
  tiles: Array<{
    instanceId: string
    catalogId: string
    name: string
    category: TileCategory
    value?: string
    gridX: number
    gridY: number
    rotation: Rotation
    plateGround?: boolean
  }>
  connections: CircuitConnection[]
  nets: string[][]
}
