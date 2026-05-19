import type { Side, SymbolId } from '../types'

export interface SymbolBounds {
  x: number
  y: number
  w: number
  h: number
}

export type SymbolLeads = Partial<Record<Side, { x: number; y: number }>>

export type { SymbolId }
