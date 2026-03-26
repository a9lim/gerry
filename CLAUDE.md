# CLAUDE.md

Part of the **a9l.im** portfolio. See root `CLAUDE.md` for the shared design system and shared code policy. Sibling projects: `geon`, `shoals`, `cyano`.

## Rules

- Always prefer shared modules over project-specific reimplementations. Check `shared-*.js` files before adding utility code.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Serve from root — shared files load via absolute paths. No build step, test suite, or linter.

## Overview

Interactive redistricting/gerrymandering simulator. Procedural hex-tile map with three parties (Federalist, Farmer-Labor, Reform), eight districts, real-time fairness metrics. SVG rendering, plan save/load, Monte Carlo election simulation, pack-and-crack and fair-draw algorithms. Zero dependencies, vanilla ES6 modules.

## Architecture

**`main.js`**: entry point, `$` DOM cache via `cacheDOMElements()`, keyboard shortcuts, info tips, auto-district/election wiring.

**State**: single `state` object in `state.js`. `hexes` Map keyed by `"q,r"` axial coordinates. `hexElements` Map (separate) maps keys to SVG `<g>` elements — use instead of `querySelector`. Undo/redo captures only `hex.district` assignments (max 50 snapshots).

**Rendering**: SVG-based. No per-hex event listeners — SVG-level delegation on `$.svg`. `scheduleBorderUpdate()` batches border re-rendering via rAF with `_changedDistricts` Set for incremental updates. Border cache stores built SVG groups per district.

**Seeding**: map seed in `location.hash` as `#seed=<number>`. Mulberry32 PRNG for deterministic hex generation.

## Color System

Internal party keys are `orange`/`lime`/`purple` throughout. Display names in `PARTY_NAMES` (config.js): Federalist, Farmer-Labor, Reform. Colors reference `_PALETTE.extended.*` from shared-tokens.js.

## Key Algorithms

### Hex Generation

Population from Gaussian-decay centers (cities, suburbs, towns) + corridors + fbm terrain noise. Three density tiers → partisan lean:
- Urban (>150): ~64% Lime, ~28% Orange, ~8% Purple
- Suburban (80-150): ~76% Orange, ~14% Lime, ~10% Purple
- Rural (≤80): ~85% Orange, ~8% Lime, ~7% Purple

### Pack-and-Crack (`packAndCrack`)

1. **Pack**: fills ~25% of districts with highest-opposition hexes via sorted BFS
2. **Crack**: simultaneous round-robin BFS from farthest-point seeds — lockstep one-hex-per-round growth
3. Orphan assignment + merge pass (dissolves districts below 30% target pop, re-grows by splitting largest)

### Fair Draw (`fairDraw`)

Lloyd's Voronoi relaxation (15 iterations). Distance-priority BFS from all seeds simultaneously with soft population weight: `effective_dist = geo_dist + 40 * max(0, pop/target - 0.8)²`. **Deterministic** — no randomness.

### Metrics

- **Efficiency gap**: all-party wasted-vote analysis (plurality thresholds). Warning at >7%
- **Partisan symmetry**: pairwise seat-swap deviation, normalized 0-100%
- **Competitive districts**: margin < 10%
- **Compactness**: Polsby-Popper (`4πA/P²`)
- **Contiguity**: BFS reachability

### Election Simulation

Monte Carlo with Gaussian swings. Uses `Math.random()` (not seeded PRNG) — non-deterministic by design.

## Gotchas

- **Brush size display vs value** — buttons display "1", "3", "7" but `data-brush` values are 0, 1, 2 (radii). Actual hex counts: 1, 7, 19
- **Auto-fill breaks at capacity** — `autoFillDistrict` stops when no candidate fits under `targetPop * 1.1`, even if district is not full. By design
- **`data-theme="light"` must be on `<html>`** — CSS theme rules depend on it before JS runs
- **Media queries use `:root` only** — layout tokens (`--panel-w`, `--toolbar-h`) are not theme-specific. Don't add `[data-theme]` selectors in media queries
- **Intro card SVGs need explicit attributes** — `.tool-btn svg` defaults don't apply
- **Shared CSS at domain root** — `/shared-base.css` absolute path requires serving from parent directory
- **`shiftForSidebar()`** reads `--panel-w` from computed styles — no hardcoded pixel values
- **Bar widths** — `.vote-bar, .prop-bar-fill { width: 0 }` in CSS; JS sets width via inline style
- **`font-variant-numeric: tabular-nums`** inherited from `.stats-scroll` and `#map-controls` — don't add individually to children
