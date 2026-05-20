import type { CatalogEntry } from './types'

export type PaletteGroup =
  | 'routing'
  | 'resistors'
  | 'capacitors'
  | 'inductors'
  | 'magnetic'
  | 'diodes'
  | 'transistors'
  | 'leds'
  | 'switches'
  | 'potentiometers'
  | 'sensors'
  | 'outputs'
  | 'power'
  | 'mcu'

export const PALETTE_GROUP_ORDER: PaletteGroup[] = [
  'power',
  'routing',
  'mcu',
  'resistors',
  'capacitors',
  'inductors',
  'magnetic',
  'diodes',
  'transistors',
  'leds',
  'switches',
  'potentiometers',
  'sensors',
  'outputs',
]

export const PALETTE_GROUP_LABEL: Record<PaletteGroup, string> = {
  routing: 'Routing',
  resistors: 'Resistors',
  capacitors: 'Capacitors',
  inductors: 'Inductors',
  magnetic: 'Magnetic',
  diodes: 'Diodes',
  transistors: 'Transistors',
  leds: 'LEDs',
  switches: 'Switches',
  potentiometers: 'Potentiometers',
  sensors: 'Sensors',
  outputs: 'Outputs',
  power: 'Power & ground',
  mcu: 'MCU',
}

const POWER_IDS = new Set(['power-tile', 'ground-tile'])

export function paletteGroupFor(entry: CatalogEntry): PaletteGroup {
  if (POWER_IDS.has(entry.id)) return 'power'
  if (entry.category === 'arduino') return 'mcu'
  if (entry.category === 'routing') return 'routing'
  if (entry.category === 'magnetic') return 'magnetic'
  if (entry.category === 'power' || entry.category === 'ground') return 'power'

  switch (entry.symbolId) {
    case 'resistor':
      return 'resistors'
    case 'capacitor':
      return 'capacitors'
    case 'inductor':
      return 'inductors'
    case 'diode':
      return 'diodes'
    case 'npn':
    case 'nmos':
      return 'transistors'
    case 'led':
    case 'led_rgb':
      return 'leds'
    case 'switch_momentary':
    case 'switch_spdt':
      return 'switches'
    case 'potentiometer':
      return 'potentiometers'
    case 'motor':
    case 'buzzer':
      return 'outputs'
    case 'sensor':
    case 'sensor_resistive':
    case 'sensor_north':
    case 'hall_sensor':
    case 'touch_pad':
      return 'sensors'
    default:
      return 'sensors'
  }
}
