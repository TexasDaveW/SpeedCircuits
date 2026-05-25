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

## Host on GitHub Pages

The repo includes a workflow that builds and deploys on every push to `main`.

1. On GitHub, open **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push `main` (or run the **Deploy to GitHub Pages** workflow manually).

Live app: **https://texasdavew.github.io/SpeedCircuits/**

To preview a production build locally (same base path as Pages):

```bash
GITHUB_PAGES=true npm run build
npm run preview
```
