# Redistricting Simulator

An interactive gerrymandering simulation that lets you paint congressional districts on a hex-tile map and observe how boundary placement affects electoral outcomes in real time.

Zero dependencies — vanilla HTML, CSS, and JavaScript with SVG rendering.

## Features

- **Interactive District Painting** — Left-click to assign hexes, right-click to erase, drag to paint continuously
- **Erase & Delete Modes** — Single-hex erasure or bulk district deletion
- **Zoom & Pan** — Scroll wheel zoom (0.3x–1.5x), middle-click drag to pan, pinch-to-zoom on touch
- **Touch Support** — Single-finger paint, two-finger pinch and pan
- **Undo/Redo** — Ctrl+Z / Ctrl+Y with 50 levels of history
- **Dark/Light Themes** — Warm cream / near-black canvases with adaptive colors
- **Efficiency Gap** — Wasted-vote analysis metric from *Gill v. Whitford*
- **Live Metrics** — Population deviation, compactness (Polsby-Popper), contiguity (BFS flood-fill), margin of victory, proportionality
- **Population Cap** — Districts cannot exceed 110% of target population
- **Organic Map Shape** — Irregular state-like boundary generated with trigonometric noise
- **Demographic Simulation** — Urban/suburban/rural tiers with realistic partisan lean (~45-45-10 R-B-Y split)
- **Hex Tooltips** — Hover for population, vote breakdown, and density tier
- **Responsive Design** — Adapts from desktop to mobile with bottom-sheet stats panel

## Getting Started

No build step required. Serve with any static HTTP server:

```bash
python -m http.server 8000
# or
npx serve .
```

Open `http://localhost:8000` in your browser.

## Architecture

Four files, ~3400 lines total:

| File | Lines | Purpose |
|------|-------|---------|
| `colors.js` | ~180 | Color system, font stacks, CSS custom property injection |
| `index.html` | ~345 | Markup — intro screen, toolbar, map canvas, sidebar, controls |
| `script.js` | ~1700 | All application logic, state management, rendering |
| `styles.css` | ~1195 | Layout, glass-morphism panels, responsive breakpoints |

### Key Design Decisions

- **`colors.js` as single source of truth** — Injects all color/font CSS custom properties at load time. JS reads party colors directly from a `_PALETTE` object; CSS uses `var(--party-red)` etc.
- **Single `state` object** — Hex data, district metrics, undo stacks, and viewport state in one place.
- **No per-hex event listeners** — SVG-level listeners with event bubbling and coordinate lookup via `getHexFromEvent()`.
- **Axial hex coordinates** — `(q, r)` system with precomputed geometry constants for fast rendering.
- **`requestAnimationFrame` throttling** — Border re-rendering batched to once per paint stroke.

## Controls

| Input | Action |
|-------|--------|
| Left-click / drag | Paint hex with active district |
| Right-click | Erase hex assignment |
| Scroll wheel | Zoom in/out |
| Middle-click drag | Pan the map |
| Ctrl+Z / Ctrl+Y | Undo / Redo |
| Number buttons (bottom) | Select active district |
| Stats toggle (toolbar) | Show/hide analysis panel |

## License

MIT
