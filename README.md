# Redistricting Simulator

An interactive gerrymandering simulation that lets you paint congressional districts on a hex-tile map and observe how boundary placement affects electoral outcomes in real time.

**[Live Demo →](https://a9l.im/gerry)** · Part of the [a9l.im](https://a9l.im) portfolio

## Features

- **Interactive District Painting** — Left-click to assign hexes, right-click to erase, drag to paint continuously
- **Erase & Delete Modes** — Single-hex erasure or bulk district deletion
- **Zoom & Pan** — Scroll wheel zoom (0.3x–1.5x), middle-click drag to pan, pinch-to-zoom on touch
- **Touch Support** — Single-finger paint, two-finger pinch and pan
- **Undo/Redo** — Ctrl+Z / Ctrl+Y with 50 levels of history
- **Dark/Light Themes** — Warm cream / near-black canvases with adaptive party colors
- **Efficiency Gap** — Wasted-vote analysis metric from *Gill v. Whitford*
- **Live Metrics** — Population deviation, compactness (Polsby-Popper), contiguity (BFS flood-fill), margin of victory, proportionality
- **Population Cap** — Districts cannot exceed 110% of target population
- **Organic Map Shape** — Irregular state-like boundary generated with trigonometric noise
- **Demographic Simulation** — Urban/suburban/rural tiers with realistic partisan lean (~45-45-10 R-B-Y split)
- **Hex Tooltips** — Hover for population, vote breakdown, and density tier
- **Responsive Design** — Adapts from desktop to mobile with bottom-sheet stats panel

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

## Running Locally

```bash
python -m http.server 8000
# or: npx serve .
```

No build step, no dependencies. Shared design system files (`shared-tokens.js`, `shared-base.css`) load from the root site — serve from the parent `a9lim.github.io/` directory for full functionality.

## Architecture

ES6 modules loaded via `<script type="module" src="main.js">`. Non-module `colors.js` loads in `<head>` to freeze `_PALETTE` before modules run.

```
index.html              — Markup: intro screen, toolbar, map canvas, sidebar, controls
styles.css              — Layout, glass panels, hex tiles, vote bars, responsive breakpoints
colors.js               — Extends shared palette with party colors, themed CSS var injection
main.js                 — Entry point: DOM cache ($), init, setupUI()
src/
  config.js             — CONFIG, hex geometry constants (SQRT3, HEX_W, etc.)
  hex-math.js           — Axial coordinate math, hex-to-pixel conversion
  noise.js              — Trigonometric noise for organic map boundary
  hex-generator.js      — Population, vote, and demographic generation
  state.js              — Single state object, districts, undo/redo
  metrics.js            — Compactness, contiguity, efficiency gap (pure functions)
  renderer.js           — SVG rendering, borders, district labels
  input.js              — Mouse handlers, painting, hover/tooltip
  touch.js              — Pinch-zoom, pan, touch-paint
  zoom.js               — Wheel zoom, smooth zoom, zoomToFit
  sidebar.js            — Metrics UI, proportionality display
  palette.js            — District palette rendering, mode management
  theme.js              — Light/dark theme toggle
```

Uses the shared design system from [a9lim.github.io](https://github.com/a9lim/a9lim.github.io) — glass panels, tool buttons, intro screen, sidebar stats, and responsive breakpoints.

### Key Design Decisions

- **`colors.js` as single source of truth** — Party colors reference `_PALETTE.extended.*` from the shared token system. JS reads colors directly; CSS uses `var(--party-red)` etc.
- **Single `state` object** in `src/state.js` — Hex data, district metrics, undo stacks, and viewport state in one place.
- **No per-hex event listeners** — SVG-level listeners with event bubbling and coordinate lookup via `getHexFromEvent()`.
- **Axial hex coordinates** — `(q, r)` system with precomputed geometry constants in `src/config.js` for fast rendering.
- **`requestAnimationFrame` throttling** — Border re-rendering batched to once per paint stroke.

## Sibling Projects

- [Relativistic N-Body](https://github.com/a9lim/physsim) — [a9l.im/physsim](https://a9l.im/physsim)
- [Cellular Metabolism](https://github.com/a9lim/biosim) — [a9l.im/biosim](https://a9l.im/biosim)

## License

[AGPL-3.0](LICENSE)
