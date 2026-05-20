// scripts/write-lesson3.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// src/catalog.ts
var COMPONENT_CATALOG = [
  { id: "corner-cube", name: "Corner cube", category: "routing", quantity: 12, typeLabel: "CORNER", ports: ["north", "east"] },
  { id: "optical-interrupt", name: "Optical interrupt", category: "component", quantity: 1, typeLabel: "OPTICAL", ports: ["west", "east"], valueLabel: "OPTO", symbolId: "sensor" },
  { id: "cross-cube", name: "Cross cube", category: "routing", quantity: 4, typeLabel: "CROSS", ports: ["north", "east", "south", "west"] },
  { id: "t-connector", name: "T connector", category: "routing", quantity: 4, typeLabel: "T-JOIN", ports: ["north", "east", "west"] },
  { id: "spring-contact", name: "Spring contact", category: "routing", quantity: 5, typeLabel: "SPRING", ports: ["west", "east"] },
  { id: "straight-cube", name: "Straight cube", category: "routing", quantity: 20, typeLabel: "STRAIGHT", ports: ["west", "east"] },
  { id: "resistor-150", name: "150\u03A9 resistor", category: "component", quantity: 4, valueLabel: "150\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "resistor-470", name: "470\u03A9 resistor", category: "component", quantity: 4, valueLabel: "470\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "resistor-1k", name: "1k resistor", category: "component", quantity: 4, valueLabel: "1k\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "resistor-4k7", name: "4.7k resistor", category: "component", quantity: 4, valueLabel: "4.7k\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "resistor-10k", name: "10k resistor", category: "component", quantity: 4, valueLabel: "10k\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "resistor-47k", name: "47k resistor", category: "component", quantity: 2, valueLabel: "47k\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "resistor-100k", name: "100k resistor", category: "component", quantity: 2, valueLabel: "100k\u03A9", typeLabel: "RESISTOR", ports: ["west", "east"], symbolId: "resistor" },
  { id: "cap-0u1", name: "0.1\xB5F capacitor", category: "component", quantity: 4, valueLabel: "0.1\xB5F", typeLabel: "CAPACITOR", ports: ["west", "east"], symbolId: "capacitor" },
  { id: "cap-1u", name: "1\xB5F capacitor", category: "component", quantity: 2, valueLabel: "1\xB5F", typeLabel: "CAPACITOR", ports: ["west", "east"], symbolId: "capacitor" },
  { id: "cap-10u", name: "10\xB5F capacitor", category: "component", quantity: 2, valueLabel: "10\xB5F", typeLabel: "CAPACITOR", ports: ["west", "east"], symbolId: "capacitor" },
  { id: "cap-47u", name: "47\xB5F capacitor", category: "component", quantity: 2, valueLabel: "47\xB5F", typeLabel: "CAPACITOR", ports: ["west", "east"], symbolId: "capacitor" },
  { id: "cap-100u", name: "100\xB5F capacitor", category: "component", quantity: 2, valueLabel: "100\xB5F", typeLabel: "CAPACITOR", ports: ["west", "east"], symbolId: "capacitor" },
  { id: "cap-1000u", name: "1000\xB5F capacitor", category: "component", quantity: 1, valueLabel: "1000\xB5F", typeLabel: "CAPACITOR", ports: ["west", "east"], symbolId: "capacitor" },
  { id: "ldr", name: "LDR", category: "component", quantity: 1, valueLabel: "LDR", typeLabel: "SENSOR", ports: ["west", "east"], symbolId: "sensor_resistive" },
  { id: "thermistor", name: "Thermistor", category: "component", quantity: 1, valueLabel: "NTC", typeLabel: "SENSOR", ports: ["west", "east"], symbolId: "sensor_resistive" },
  { id: "hall-sensor", name: "Hall sensor", category: "component", quantity: 1, valueLabel: "HALL", typeLabel: "SENSOR", ports: ["west", "east", "north"], symbolId: "sensor_north" },
  { id: "microphone", name: "Microphone", category: "component", quantity: 1, valueLabel: "MIC", typeLabel: "SENSOR", ports: ["west", "east"], symbolId: "sensor" },
  { id: "touch-pad", name: "Metal pad / touch cube", category: "component", quantity: 1, valueLabel: "TOUCH", typeLabel: "PAD", ports: ["west", "east"], symbolId: "touch_pad" },
  { id: "vibration-motor", name: "Vibration motor", category: "component", quantity: 1, valueLabel: "MOTOR", typeLabel: "OUTPUT", ports: ["west", "east"], symbolId: "motor" },
  { id: "buzzer", name: "Buzzer", category: "component", quantity: 1, valueLabel: "BUZZ", typeLabel: "OUTPUT", ports: ["west", "east"], symbolId: "buzzer" },
  { id: "tact-button", name: "Tact button", category: "component", quantity: 2, valueLabel: "BTN", typeLabel: "SWITCH", ports: ["west", "east"], symbolId: "switch_momentary" },
  { id: "slide-switch", name: "Slide switch SPDT", category: "component", quantity: 2, valueLabel: "SPDT", typeLabel: "SWITCH", ports: ["west", "east", "south"], symbolId: "switch_spdt" },
  { id: "rgb-led", name: "RGB LED", category: "component", quantity: 1, valueLabel: "RGB", typeLabel: "LED", ports: ["west", "east", "south"], symbolId: "led_rgb" },
  { id: "led-red", name: "Red LED", category: "component", quantity: 2, valueLabel: "RED", typeLabel: "LED", ports: ["west", "east"], symbolId: "led" },
  { id: "led-green", name: "Green LED", category: "component", quantity: 2, valueLabel: "GRN", typeLabel: "LED", ports: ["west", "east"], symbolId: "led" },
  { id: "led-blue", name: "Blue LED", category: "component", quantity: 2, valueLabel: "BLU", typeLabel: "LED", ports: ["west", "east"], symbolId: "led" },
  { id: "potentiometer", name: "Potentiometer", category: "component", quantity: 3, valueLabel: "POT", typeLabel: "POT", ports: ["west", "east", "south"], symbolId: "potentiometer" },
  { id: "npn", name: "NPN transistor", category: "component", quantity: 3, valueLabel: "NPN", typeLabel: "TRANSISTOR", ports: ["west", "east", "south"], symbolId: "npn" },
  { id: "nmos", name: "NMOS transistor", category: "component", quantity: 3, valueLabel: "NMOS", typeLabel: "MOSFET", ports: ["west", "east", "south"], symbolId: "nmos" },
  { id: "schottky", name: "Schottky diode", category: "component", quantity: 5, valueLabel: "DIODE", typeLabel: "SCHOTTKY", ports: ["west", "east"], symbolId: "diode" },
  { id: "inductor", name: "Inductor", category: "component", quantity: 3, valueLabel: "IND", typeLabel: "INDUCTOR", ports: ["west", "east"], symbolId: "inductor" },
  { id: "arduino-cube", name: "Arduino cube", category: "arduino", quantity: 1, valueLabel: "UNO", typeLabel: "ARDUINO", ports: ["north", "east", "south", "west"], symbolId: "arduino" },
  { id: "power-tile", name: "Power tile", category: "power", quantity: 1, valueLabel: "USB", typeLabel: "POWER", ports: ["south"], plateGround: true, symbolId: "power_tile" },
  { id: "ground-tile", name: "Ground tile", category: "ground", quantity: 6, valueLabel: "GND", typeLabel: "GROUND", ports: ["north"], plateGround: true, symbolId: "ground_tile" }
];
var catalogById = new Map(COMPONENT_CATALOG.map((e) => [e.id, e]));

// src/geometry.ts
var OPPOSITE = {
  north: "south",
  east: "west",
  south: "north",
  west: "east"
};
var ROTATE_CW = {
  north: "east",
  east: "south",
  south: "west",
  west: "north"
};
function rotateSide(side, rotation) {
  const steps = rotation / 90;
  let s = side;
  for (let i = 0; i < steps; i++) s = ROTATE_CW[s];
  return s;
}
function sidesAtRotation(basePorts, rotation) {
  return basePorts.map((p) => rotateSide(p, rotation));
}
function oppositeSide(side) {
  return OPPOSITE[side];
}
function neighborOffset(side) {
  switch (side) {
    case "north":
      return { dx: 0, dy: -1 };
    case "east":
      return { dx: 1, dy: 0 };
    case "south":
      return { dx: 0, dy: 1 };
    case "west":
      return { dx: -1, dy: 0 };
  }
}

// src/circuit.ts
function portKey(instanceId, side) {
  return `${instanceId}:${side}`;
}
function buildConnections(tiles2) {
  const byCell = /* @__PURE__ */ new Map();
  for (const t of tiles2) {
    byCell.set(`${t.gridX},${t.gridY}`, t);
  }
  const connections = [];
  const seen = /* @__PURE__ */ new Set();
  for (const tile of tiles2) {
    const entry = catalogById.get(tile.catalogId);
    if (!entry) continue;
    const ports = sidesAtRotation(entry.ports, tile.rotation);
    if (entry.plateGround) {
      const key = `${tile.instanceId}:plate`;
      if (!seen.has(key)) {
        seen.add(key);
        const undersideOnly = entry.category === "ground" || entry.category === "power";
        const plateSide = entry.category === "power" ? "west" : entry.category === "ground" ? "south" : ports[0] ?? "south";
        connections.push({
          a: {
            instanceId: tile.instanceId,
            side: undersideOnly ? plateSide : ports[0] ?? "south"
          },
          b: { net: "PLATE_GND" }
        });
      }
    }
    if (entry.category === "power") {
      for (const side of ports) {
        connections.push({
          a: { instanceId: tile.instanceId, side },
          b: { net: "USB_VCC" }
        });
      }
    }
    for (const side of ports) {
      const { dx, dy } = neighborOffset(side);
      const neighbor = byCell.get(`${tile.gridX + dx},${tile.gridY + dy}`);
      if (!neighbor) continue;
      const neighborEntry = catalogById.get(neighbor.catalogId);
      if (!neighborEntry) continue;
      const neighborPorts = sidesAtRotation(neighborEntry.ports, neighbor.rotation);
      const facing = oppositeSide(side);
      if (!neighborPorts.includes(facing)) continue;
      const idA = tile.instanceId < neighbor.instanceId ? tile.instanceId : neighbor.instanceId;
      const idB = tile.instanceId < neighbor.instanceId ? neighbor.instanceId : tile.instanceId;
      const sideA = tile.instanceId < neighbor.instanceId ? side : facing;
      const sideB = tile.instanceId < neighbor.instanceId ? facing : side;
      const key = [portKey(idA, sideA), portKey(idB, sideB)].sort().join("|");
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({
        a: { instanceId: tile.instanceId, side },
        b: { instanceId: neighbor.instanceId, side: facing }
      });
    }
  }
  return connections;
}
function buildNets(connections) {
  const parent = /* @__PURE__ */ new Map();
  function find(x) {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x);
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  }
  function union(a, b) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  function endpointKey(end) {
    if ("net" in end) return `net:${end.net}`;
    return portKey(end.instanceId, end.side);
  }
  for (const c of connections) {
    union(endpointKey(c.a), endpointKey(c.b));
  }
  const groups = /* @__PURE__ */ new Map();
  for (const c of connections) {
    for (const end of [c.a, c.b]) {
      const key = endpointKey(end);
      const root = find(key);
      if (!groups.has(root)) groups.set(root, /* @__PURE__ */ new Set());
      groups.get(root).add(key);
    }
  }
  return [...groups.values()].map((s) => [...s].sort());
}
function exportCircuit(tiles2, name) {
  const connections = buildConnections(tiles2);
  const trimmed = name?.trim();
  return {
    version: 1,
    name: trimmed || void 0,
    exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
    tiles: tiles2.map((t) => {
      const entry = catalogById.get(t.catalogId);
      return {
        instanceId: t.instanceId,
        catalogId: t.catalogId,
        name: entry.name,
        category: entry.category,
        value: entry.valueLabel,
        gridX: t.gridX,
        gridY: t.gridY,
        rotation: t.rotation,
        plateGround: entry.plateGround
      };
    }),
    connections,
    nets: buildNets(connections)
  };
}

// scripts/write-lesson3.ts
var tiles = [
  { instanceId: "power-1", catalogId: "power-tile", gridX: 5, gridY: 3, rotation: 0 },
  { instanceId: "resistor-1", catalogId: "resistor-1k", gridX: 5, gridY: 4, rotation: 90 },
  { instanceId: "led-red-1", catalogId: "led-red", gridX: 5, gridY: 5, rotation: 270 },
  { instanceId: "led-green-1", catalogId: "led-green", gridX: 5, gridY: 6, rotation: 270 },
  { instanceId: "ground-1", catalogId: "ground-tile", gridX: 5, gridY: 7, rotation: 0 }
];
var outDir = join(process.cwd(), "circuit jsons");
mkdirSync(outDir, { recursive: true });
var doc = exportCircuit(tiles, "Two LEDs in Series");
writeFileSync(join(outDir, "03-two-leds-in-series.json"), `${JSON.stringify(doc, null, 2)}
`);
