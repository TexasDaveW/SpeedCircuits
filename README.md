# SpeedCircuits

Web-based magnetic tile circuit builder. Design circuits on a ferrous plate canvas, then export JSON for analysis and simulation.

## Run locally

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually http://localhost:5173).

## Usage

1. Pick a tile from the palette (quantities match the physical kit).
2. Click an empty cell on the metal plate to place it.
3. Drag tiles to move, **R** to rotate, **Delete** to remove.
4. Scroll or use toolbar buttons to zoom; drag empty space (or Alt+drag) to pan.
5. **Export circuit JSON** to generate connections, nets, and tile metadata.

Power and ground tiles connect to `USB_VCC` and `PLATE_GND` nets in the export.
