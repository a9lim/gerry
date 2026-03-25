# Gerry

An interactive gerrymandering simulator where you paint congressional districts on a procedurally-generated hex map and watch how boundary placement affects electoral outcomes in real time. Three parties, ten districts, six fairness metrics, automated gerrymander and fair-draw algorithms, and Monte Carlo election simulation -- all in zero-dependency vanilla JavaScript with SVG rendering.

**[Live Demo](https://a9l.im/gerry)** | Part of the [a9l.im](https://a9l.im) portfolio

## Highlights

- **Three-party system** -- Red, Blue, and Yellow parties with realistic urban/suburban/rural demographic leans, generated via seeded fractal Brownian motion noise
- **6 fairness metrics** -- all-party efficiency gap (wasted-vote analysis), partisan symmetry (vote-share swap test), competitive districts (< 10% margin), Polsby-Popper compactness, BFS contiguity, and majority-minority district requirements
- **Automated algorithms** -- one-click pack-and-crack gerrymander that maximizes seats for a chosen party, and a simulated-annealing fair-draw algorithm (3,000 iterations) that minimizes proportionality error
- **Monte Carlo election simulation** -- 50--500 elections with configurable Gaussian vote swings and correlated local noise, rendered as a per-party seat histogram
- **Seeded procedural generation** -- Mulberry32 PRNG produces deterministic maps with cities, suburbs, towns, transportation corridors, and minority clusters. Seeds stored in URL hashes for sharing
- **Plan management** -- save, load, export, and import district plans as JSON; up to 50-level undo/redo
- **Adjustable brush** -- paint 1, 7, or 19 hexes at a time with radius 0/1/2 brushes

## What Makes It Interesting

The simulator goes beyond simple two-party models. With three parties, gerrymandering tactics become more nuanced -- you can pack one party's voters while splitting the other two, or create competitive three-way races. The efficiency gap and partisan symmetry metrics capture different aspects of fairness, and often disagree on what constitutes a "fair" map. The automated algorithms let you compare a maximally gerrymandered plan against a computationally optimized fair draw, then stress-test both with Monte Carlo elections to see which plans are resilient to vote swings.

## Controls

| Input | Action |
|-------|--------|
| Left-click / drag | Paint hex with active district (brush size adjustable) |
| Right-click | Erase hex assignment |
| Scroll wheel | Zoom in/out (up to 3x) |
| Middle-click drag | Pan the map |
| Touch: one finger | Paint |
| Touch: two fingers | Pinch-zoom and pan |
| Ctrl+Z / Ctrl+Y | Undo / Redo (50 levels) |
| Number keys 0-9 | Select district (0 = district 10) |
| District palette (bottom) | Click numbered buttons to select active district |
| Brush toggle (sidebar Tools tab) | Switch between radius 0/1/2 (paints 1/7/19 hexes) |
| Auto-fill (toolbar) | Greedy-fill current district to 110% population target |
| Auto-gerrymander (toolbar) | Pack-and-crack for selected party |
| Fair draw (toolbar) | Simulated-annealing proportional assignment |
| Simulate elections (toolbar) | Monte Carlo election overlay |
| Plans (toolbar) | Save, load, export, or import district plans |
| Stats toggle (toolbar) | Show/hide analysis panel |

### Keyboard Shortcuts

E (erase mode), D (delete mode), A (auto-fill), N (randomize map), 1-9/0 (select district), T (theme), S (sidebar). Press `?` for the full help overlay.

## Metrics

- **Efficiency Gap** -- Three-party wasted-vote analysis. Winner's wasted votes = votes above second-place + 1; each loser wastes all votes. Values above 7% may indicate gerrymandering.
- **Partisan Symmetry** -- For each pair of parties, swaps vote shares across all districts and recounts seats. Measures whether the map treats parties equally (0-100%, higher is fairer).
- **Competitive Districts** -- Districts where the margin of victory is under 10%.
- **Compactness** -- Polsby-Popper score (4pi * area / perimeter^2). Higher means more circular.
- **Contiguity** -- BFS flood-fill verifies all hexes in a district are connected.
- **Majority-Minority Districts** -- Required count derived from `floor(minorityShare * numDistricts)`, minimum 1 if minority population exceeds 15%.
- **Population Balance** -- Districts should stay within 110% of the target population (total population / 10).

## Running Locally

```bash
python -m http.server 8000
# or: npx serve .
```

No build step, no dependencies. Shared design system files (`shared-tokens.js`, `shared-base.css`, etc.) load from the root site via absolute paths. For full functionality, serve from within the parent `a9lim.github.io/` directory so those shared files resolve.

## Tech

Zero-dependency vanilla JS/HTML/CSS. SVG rendering (not Canvas). ES6 modules loaded via `<script type="module">`. Seeded PRNG (Mulberry32) for reproducible map generation. Simulated annealing for fair-draw optimization. Incremental border rendering with per-district SVG caching. Event delegation on SVG (no per-hex listeners). The shared design system from [a9lim.github.io](https://github.com/a9lim/a9lim.github.io) provides glass panels, tool buttons, camera/zoom, info tips, keyboard shortcuts, and responsive breakpoints.

## Architecture

```
index.html              -- Markup: intro screen, toolbar, SVG map, sidebar (3 tabs), palette,
                            plans dialog, election overlay
styles.css              -- Layout, glass panels, hex tiles, vote bars, tab system, responsive
colors.js               -- Extends shared palette with party colors, themed CSS var injection
main.js                 -- Entry point: DOM cache, init, keyboard shortcuts, info tips
src/
  config.js             -- Hex geometry constants, getHexesInRadius(), palette color map
  hex-math.js           -- Axial coordinate math: hexToPixel, hexCorners, hexDistance
  noise.js              -- Hash noise, bilinear interpolation, fractal Brownian motion
  prng.js               -- Mulberry32 seeded PRNG
  hex-generator.js      -- Procedural map: population centers, corridors, demographics, minorities
  state.js              -- State object, undo/redo snapshots, mode management
  metrics.js            -- Efficiency gap, partisan symmetry, competitive districts, compactness,
                            contiguity, majority-minority, vote percentages
  renderer.js           -- SVG hex polygons, incremental border cache, district labels
  input.js              -- Mouse handlers, brush painting, auto-fill, hover tooltip
  touch.js              -- Pinch-zoom, pan, single-finger paint
  zoom.js               -- Camera via shared-camera.js, sidebar-aware viewport shift
  sidebar.js            -- Metric display, per-district details, proportionality bars
  palette.js            -- District palette rendering and active-state styling
  plans.js              -- Plan save/load/delete/export/import (localStorage + JSON)
  theme.js              -- Light/dark theme toggle
  auto-district.js      -- Pack-and-crack gerrymander, simulated-annealing fair draw
  election-sim.js       -- Monte Carlo election simulation with Canvas 2D histogram
```

## Sibling Projects

- [Geon](https://github.com/a9lim/physsim) -- [a9l.im/physsim](https://a9l.im/physsim)
- [Cyano](https://github.com/a9lim/biosim) -- [a9l.im/biosim](https://a9l.im/biosim)
- [Shoals](https://github.com/a9lim/finsim) -- [a9l.im/finsim](https://a9l.im/finsim)

## License

[AGPL-3.0](LICENSE)
