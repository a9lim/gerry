# CLAUDE.md

Part of the **a9l.im** portfolio. See parent `site-meta/CLAUDE.md` for the shared design system specification. Sibling projects: `physsim`, `biosim`.

## Overview

Interactive redistricting/gerrymandering simulator. Users paint congressional districts on a procedurally-generated hex-tile map with three parties, ten districts, and real-time fairness metrics. Zero dependencies -- vanilla HTML/CSS/JS with SVG rendering.

## Running Locally

```bash
python -m http.server 8000
# or
npx serve .
```

No package.json, no test suite, no linter configured. Shared files load from absolute paths (`/shared-tokens.js`, `/shared-base.css`, etc.), so serve from within the parent `a9lim.github.io/` directory for full functionality.

## File Map

```
index.html              -- Markup: intro screen, toolbar, SVG map, sidebar (3 tabs), palette, plans dialog, election overlay
styles.css              -- Layout, glass panels, hex tiles, vote bars, tab system, plans dialog, election overlay, responsive breakpoints
colors.js               -- Extends shared palette with party colors, themed CSS var injection via IIFE
main.js                 -- Entry point: DOM cache ($), init, setupUI(), keyboard shortcuts, info tips, auto-district/election wiring
src/
  config.js             -- CONFIG object, hex geometry constants (SQRT3, HEX_W, HEX_H, HEX_CORNER_OFFSETS, HEX_DIRS), getHexesInRadius(), EASE_OUT, PALETTE_COLOR_MAP
  hex-math.js           -- hexToPixel, hexCorners, cornersToString, hexDistance (axial coordinate math)
  noise.js              -- hashNoise (sin-based hash), smoothNoise (bilinear interpolation), fbmNoise (fractal Brownian motion)
  prng.js               -- createPRNG (Mulberry32 seeded PRNG), randomSeed
  hex-generator.js      -- generateHexes: population centers, corridors, demographic tiers, party assignment, minority clusters
  state.js              -- state object, hexElements Map, initDistricts, undo/redo (snapshot/restore), mode management (setMode/clearModes)
  metrics.js            -- calculateMetrics, calculateEfficiencyGap, calculatePartisanSymmetry, calculateCompetitiveDistricts, calculateRequiredMMD, votePcts
  renderer.js           -- renderMap (SVG hex polygons + minority markers), renderBorders (incremental border cache), renderDistrictLabels, updateHexVisuals, refreshMinOpacity
  input.js              -- Mouse handlers, paintHexByKey/paintBrush, startPaintingAt/stopPainting, autoFillDistrict, getHexFromEvent/getHexFromPoint, hover/tooltip (via shared createSimTooltip), scheduleBorderUpdate
  touch.js              -- Pinch-zoom, pan, single-finger paint (delegates to input.js functions and camera)
  zoom.js               -- Camera init via shared createCamera(), resetCamera, zoomToFit, shiftForSidebar (reads --panel-w from computed styles)
  sidebar.js            -- updateMetrics UI, updateSidebarDetails (per-district detail), updateProportionality (vote% vs seat%), animated counters
  palette.js            -- renderDistrictPalette, updateDistrictPalette (active/party-color styling)
  plans.js              -- Plan save/load/delete/export/import (localStorage key "gerry-plans" + JSON file I/O)
  theme.js              -- initTheme, toggleTheme, syncTheme (refreshes hex opacity)
  auto-district.js      -- packAndCrack (gerrymander), fairDraw (simulated annealing), helper: _greedySeed, _spreadSeeds, _assignOrphans, _quickContiguityCheck
  election-sim.js       -- simulateElections (Monte Carlo with Gaussian swings), renderHistogram (Canvas 2D bar chart)
```

## Module Dependency Graph

```
main.js
  +-- config.js
  +-- state.js ------> config.js
  +-- prng.js
  +-- hex-generator.js -> config.js, hex-math.js, noise.js, state.js, prng.js, metrics.js
  +-- metrics.js -----> config.js, state.js
  +-- renderer.js ----> config.js, hex-math.js, state.js
  +-- input.js -------> config.js, state.js, metrics.js, renderer.js, zoom.js
  +-- touch.js -------> state.js, zoom.js, input.js
  +-- zoom.js --------> config.js, state.js (uses shared createCamera)
  +-- sidebar.js -----> config.js, state.js, metrics.js, renderer.js
  +-- palette.js -----> config.js, state.js, renderer.js
  +-- plans.js -------> state.js, hex-generator.js
  +-- theme.js -------> state.js, renderer.js
  +-- auto-district.js -> config.js, state.js
  +-- election-sim.js -> config.js, state.js
```

## Color System (colors.js)

Extends `shared-tokens.js` with project-specific party colors referencing `_PALETTE.extended.*`:

| Party | `_PALETTE` key | Extended source |
|-------|---------------|-----------------|
| Red | `red` | `extended.rose` (`#C46272`) |
| Blue | `blue` | `extended.blue` (`#5C92A8`) |
| Yellow | `yellow` | `extended.orange` (`#CC8E4E`) |
| None | `none` | `extended.slate` (`#8A7E72`) |
| Green (minority) | `green` | `extended.green` (`#509878`) |

An IIFE injects `<style id="project-vars">` with themed CSS vars:
- `--party-red/blue/yellow/green` with `-tint` (8% alpha) and `-wash` (18% alpha) variants for the three main parties
- `--tip-red/blue/yellow/green` (darker in dark theme, lighter in light theme -- opposite of party colors)
- `--hex-stroke`, `--hex-hover-stroke`, `--bar-track`, `--party-none`
- `--hex-min-opacity` (0.22 light, 0.30 dark)
- `--label-fill`, `--label-stroke`

Light theme darkens party colors via `_darken()` (from `shared-tokens.js`); dark theme uses base colors directly.

## State Management (src/state.js)

All application state lives in a single `state` object:
- `hexes` (Map): hex tiles keyed by `"q,r"` axial coordinates, each storing `{ id, q, r, s, population, votes: {red,blue,yellow}, party, partyWinner, minority, district }`
- `districts` (Object): 10 districts keyed 1-10, each with `{ id, population, votes, hexes[], minorityPop, isContiguous, compactness, winner, isMinorityMajority }`
- `undoStack` / `redoStack`: snapshots of hex-to-district assignments (max 50 entries)
- `currentDistrict`: active district being painted (1-10)
- `brushSize`: 0 (single hex), 1 (radius-1 = 7 hexes), 2 (radius-2 = 19 hexes)
- `paintState`: `{ mode: 'none'|'paint'|'erase', districtId }`
- Mode booleans: `deleteMode`, `eraseMode`, `panMode` (mutually exclusive via `setMode()`)
- Viewport: `viewBox`, `origViewBox`, `zoomLevel`, `isPanning`, `panStart`
- `seed`: current PRNG seed (stored in URL hash)
- `targetPop`: total population / numDistricts
- `maxPop`: highest hex population on current map (for opacity scaling)

`hexElements` (Map): separate Map from `"q,r"` keys to SVG `<g>` elements, avoiding `querySelector` lookups.

### Undo/Redo

Snapshots capture only `hex.district` for every hex (not full hex data). `pushUndoSnapshot()` appends to undo stack, clears redo. `undo()` pops from undo, pushes to redo. `redo()` pops from redo, pushes to undo. Both call `restoreSnapshot()` which reassigns districts and triggers full visual + metric update.

### Mode Management

Three mutually exclusive modes managed by `setMode(name, $)`: `delete`, `erase`, `pan`. Each has a `stateKey`, button reference, and CSS class. `setMode(null, $)` clears all modes. `clearModes($)` is an alias.

## Data Flow

```
User input (mouse/touch/keyboard)
  -> Paint/Erase/Zoom handler
  -> Mutate state (hex.district, viewBox)
  -> calculateMetrics() recalculates district stats
  -> scheduleBorderUpdate() batches SVG re-render via rAF
  -> updateMetrics() refreshes sidebar UI + proportionality bars
  -> pushUndoSnapshot() saves assignment state
```

## Key Algorithms

### Hex Grid Generation (src/hex-generator.js)

Uses seeded Mulberry32 PRNG (`src/prng.js`) for deterministic output from a given seed. Grid is ~18 rows x 25 columns with an organic boundary generated by trigonometric noise (sin/cos at random frequencies and phases, not fbm).

Population centers:
- 2-3 large cities (strength 350-950, decay 1.2-3.0)
- 3-6 suburbs (placed near cities, strength 100-350, decay 0.6-1.8)
- 5-10 small towns (strength 50-250, decay 0.3-1.3)
- 1-3 transportation corridors between cities (linear population boost with exponential falloff)

Population uses Gaussian decay from centers, scaled by fbm terrain noise and micro-noise, with random outlier spikes and dead zones.

Three density tiers determine partisan lean:
- **Urban** (pop > 150): ~70% Blue, ~22% Red, ~8% Yellow
- **Suburban** (80-150): ~62% Red, ~25% Blue, ~13% Yellow
- **Rural** (<=80): ~76% Red, ~16% Blue, ~8% Yellow

Regional lean (`fbmNoise` at low frequency) shifts these probabilities per-hex. A `leanScale` factor (0.15-0.25) controls regional variation strength.

Vote assignment: winning-party hex gets 54-83% of non-Yellow votes; Yellow hexes get 28-36% Yellow. Minority status determined by fbm noise against density-dependent thresholds (urban 0.48, suburban 0.60, rural 0.78).

### Efficiency Gap (src/metrics.js, `calculateEfficiencyGap`)

All-party wasted-vote analysis using plurality thresholds:
- Winner's wasted votes = votes above (second-place votes + 1)
- Each loser's wasted votes = all their votes
- Returns `{ red, blue, yellow }` wasted-vote ratios (wasted / totalVotes)
- Returns `null` if fewer than 2 active districts
- Sidebar displays: gap between least-wasted and second-least-wasted party, with arrow showing advantaged party. Color warning at > 7%.

### Partisan Symmetry (src/metrics.js, `calculatePartisanSymmetry`)

For each pair of parties (3 pairs total), swaps their vote shares in every district and recounts seats. Deviation = |actualSeatGap + swappedSeatGap| (should be equal and opposite in a symmetric map). Average deviation normalized to 0-100% scale (100 = perfectly symmetric). Returns `null` if fewer than 2 active districts.

### Competitive Districts (src/metrics.js, `calculateCompetitiveDistricts`)

Counts districts where `(first - second) / total < 0.1`. Returns `{ competitive, total }`.

### Required Majority-Minority Districts (src/metrics.js, `calculateRequiredMMD`)

`floor(minorityShare * numDistricts)`, minimum 1 if minority share > 15%, else 0.

### Compactness (src/metrics.js, `calculateCompactness`)

Polsby-Popper: `4 * PI * area / perimeter^2 * 100`, clamped to 100. Area = hex count * hex area. Perimeter = count of boundary edges * hexSize.

### Contiguity (src/metrics.js, `checkContiguity`)

BFS from first hex in district; valid if visited count equals total hex count.

### Pack-and-Crack Gerrymander (src/auto-district.js, `packAndCrack`)

1. Clears all assignments
2. **Pack phase**: fills ~25% of districts (1-3) with highest-opposition hexes via BFS, seeded from hex with highest opposition share, queue sorted by opposition share
3. **Crack phase**: fills remaining districts seeded from hexes with highest target-party share, BFS expansion
4. Orphan assignment: iteratively assigns unassigned hexes to nearest adjacent district

### Fair Draw (src/auto-district.js, `fairDraw`)

1. **Greedy seed** (`_greedySeed`): places seeds via farthest-point sampling (`_spreadSeeds`), grows each district via BFS to population cap, then assigns orphans
2. **Simulated annealing** (3000 iterations, T: 1.0 -> 0.01):
   - Picks random border hex, swaps to random adjacent district
   - Quick BFS contiguity check before accepting
   - Objective function: proportionality error (|voteShare - seatShare| summed over parties) minus compactness bonus (interior/total hex ratio) minus population equality bonus
   - Metropolis criterion: accept if objective improves, or with probability exp(-delta/T)

### Election Simulation (src/election-sim.js)

Monte Carlo: for each simulated election, generates correlated national swing per party (Gaussian, sigma configurable) plus local noise (sigma * 0.3). Applies swings to district vote shares, normalizes, determines winner. Histogram rendered on Canvas 2D with per-party bar groups and mean seat counts.

## UI Architecture

Map-first floating-panel layout:
- **Intro screen**: themed splash with instruction cards (Paint/Erase/Navigate) and CTA button, dismissed on click
- **Toolbar** (`#toolbar.sim-toolbar.glass`): fixed glass bar at top with tool buttons. Title uses `<em>` for italic accent-gradient second word. Buttons: undo, redo, erase, delete, pan, auto-fill, auto-gerrymander (with party dropdown), fair draw, simulate elections, plans, randomize, reset, theme, stats toggle.
- **Map**: full-viewport SVG (`<main>` with `position: fixed; inset: 0`). SVG groups: `hex-group` (polygons), `border-group` (district border paths), `minority-group` (circles), `label-group` (district number labels).
- **District palette** (`#district-palette.sim-bar.glass`): fixed pill-shaped bar at bottom center with 10 numbered buttons. Active = bold + accent color. Assigned districts show party-color text.
- **Stats panel** (`#sidebar.sim-panel.glass`): toggleable floating panel, right side on desktop, bottom sheet on mobile (<=900px). **Three tabs** (Statewide, District, Tools):
  - **Statewide**: seat counts, districts created, MMD count, efficiency gap, partisan symmetry, competitive districts, popular-vote-vs-seats proportionality bars with legend
  - **District**: selected district details (winner, margin, population, deviation, compactness, contiguity, minority-majority, vote bar breakdown)
  - **Tools**: brush size toggle (1/3/7 display labels = radius 0/1/2)
- **Zoom controls** (`#map-controls.sim-controls.glass`): floating left-side panel with zoom-in, zoom-level display, zoom-out, separator, zoom-fit buttons
- **Plans dialog** (`#plans-dialog`): modal overlay with save input, plan list (load/export/delete per plan), export-current and import buttons
- **Election overlay** (`#election-overlay`): modal with swing sigma slider, election count dropdown, run button, and Canvas 2D histogram
- Entrance animations gated by `.app-ready` class added to `<body>` when intro is dismissed

### Tab System

`shared-tabs.js` (loaded as plain `<script>` at end of body) handles tab switching (`.tab-btn` click toggles `.active` on buttons and panels). Not in any module file. Tabs: `statewide`, `district`, `tools`.

### Responsive Breakpoints

- **1100px**: panel narrows to 320px
- **900px**: toolbar/palette shrink, sidebar becomes bottom sheet with swipe-to-dismiss. Shared `shared-base.css` rules handle `--toolbar-h: 48px`, `.sim-toolbar` positioning, `.sim-brand` sizing, `.tool-sep` sizing. Project-specific: `.tool-btn` 36x36, palette/map-controls adjustments. `--palette-h: 52px`.
- **600px**: shared rules handle `.sim-brand`/`.sim-toolbar-actions`/`.tool-sep` further. Project-specific: `.tool-btn` 34x34, palette sizing.
- **440px**: shared `.hide-sm` hides non-essential elements. Project-specific: brand hidden, toolbar centered.

### Plan Save/Load (src/plans.js)

- `savePlan(name)`: serializes `{ name, seed, hexAssignments, timestamp }` to localStorage key `gerry-plans`
- `loadPlan(name, ...)`: if plan has a seed, regenerates the map from that seed first, then restores hex assignments and updates visuals/metrics. Updates URL hash.
- `deletePlan(name)`: removes from localStorage
- `exportPlan(name)`: reads from localStorage and triggers JSON file download
- `exportCurrentPlan(name)`: exports live state (not from localStorage) as JSON download
- `importPlan(file)`: reads JSON, validates `hexAssignments` object exists, saves to localStorage. Returns Promise.
- `listPlans()`: returns array of `{ name, timestamp }`

### Brush System (src/input.js)

- `state.brushSize`: 0 (radius 0 = 1 hex), 1 (radius 1 = 7 hexes), 2 (radius 2 = 19 hexes). Toggle buttons in sidebar Tools tab set `state.brushSize` via `data-brush` attribute.
- `paintBrush(qr)`: if `brushSize <= 0`, paints single hex; otherwise calls `getHexesInRadius(q, r, brushSize)` from config.js and paints each result via `paintHexByKey()`.
- `autoFillDistrict(districtId, ...)`: greedy nearest-neighbor. Finds unassigned hexes adjacent to district boundary, deduplicates, sorts by Manhattan distance to centroid, adds best candidate if it fits under `targetPop * CONFIG.popCapRatio`. Returns count of hexes added; shows toast.

### SVG Rendering Pipeline (src/renderer.js)

`renderMap($)`: clears hex-group and minority-group, creates SVG `<polygon>` elements for each hex (colored by `partyWinner`, opacity scaled by `population / maxPop` with min opacity from CSS var). Minority hexes get `<circle>` markers. Computes viewBox from map bounds with padding and vertical clearance offset. Calls `renderBorders()`.

`renderBorders($, changedDistricts?)`: incremental border cache system. If `changedDistricts` Set is provided, only rebuilds those districts; otherwise full re-render. For each district:
1. Finds boundary segments (edges between differently-assigned hexes)
2. Chains segments into continuous SVG paths using adjacency map
3. Builds clip path from hex polygons
4. Creates SVG group with district border path (stroked with `_darken(partyColor)`), clipped to district region
5. MMD overlay path added for majority-minority districts

`renderDistrictLabels($)`: places numbered text labels at each district's centroid.

`scheduleBorderUpdate($)` (in input.js): throttles border re-rendering to one `requestAnimationFrame` per paint stroke via `_changedDistricts` Set.

### Camera / Zoom (src/zoom.js)

Wraps `shared-camera.js`'s `createCamera()`. Camera is initialized from the SVG viewBox dimensions. Zoom range: base zoom (fit) to base * `CONFIG.zoomMaxRatio` (3x). Wheel zoom factor: 1.12. Button zoom: 1.25x with 200ms animation. Zoom-fit: 300ms to original viewBox center (offset for sidebar if open).

`shiftForSidebar(opening)`: on desktop (>900px), animates camera pan by half panel width when sidebar opens/closes. Reads `--panel-w` from computed styles (no hardcoded pixel values).

### Keyboard Shortcuts and Info Tips

- **Shortcuts** via `initShortcuts()` from `shared-shortcuts.js`: E (erase mode), D (delete mode), A (auto-fill), N (randomize map), 1-9/0 (select district 1-10), T (theme), S (sidebar). Press `?` for help overlay.
- **Info tips** via `createInfoTip()` from `shared-info.js`: `?` buttons next to metrics triggered by `data-info` attribute. Data defined inline in `main.js` for: Efficiency Gap, Partisan Symmetry, Competitive Districts, Compactness, Contiguity, Majority-Minority, Population Balance.

## Key Patterns

### Performance

- **`$` object**: cached DOM element references built in `cacheDOMElements()` in `main.js`. All `getElementById` calls live in this single function. Use `$.elementName` everywhere else.
- **`hexElements` Map** (state.js): maps `"q,r"` keys to SVG `<g>` elements. Use instead of `querySelector('.hex[data-qr="..."]')`.
- **No per-hex event listeners**: SVG-level listeners on `$.svg` handle all hex interaction via event delegation. `getHexFromEvent()` walks from target polygon up to `.hex` group to get `data-qr`. `getHexFromPoint()` converts client coordinates to axial hex coordinates for touch input.
- **Precomputed constants** in `src/config.js`: `SQRT3`, `HEX_W`, `HEX_H`, `HEX_CORNER_OFFSETS`, `HEX_DIRS`, `HEX_RENDER_SIZE`. Avoid recalculating geometry.
- **`scheduleBorderUpdate()`** in `src/input.js`: collects changed district IDs in `_changedDistricts` Set, defers border re-rendering to one `requestAnimationFrame` per paint stroke for incremental updates.
- **Border cache** in `src/renderer.js`: `_borderCache` object stores built SVG groups and clip paths per district. Incremental updates only rebuild changed districts.

### Helpers

- **`votePcts(votes)`** in `src/metrics.js`: returns `{ red, blue, yellow }` as raw percentages. Callers round as needed.
- **`getHexesInRadius(q, r, radius)`** in `src/config.js`: returns array of `"q,r"` keys within axial distance. Used by brush painting.
- **`shiftForSidebar(opening)`** in `src/zoom.js`: reads `--panel-w` from computed styles -- no hardcoded pixel values.
- **`animateValue(el, end, duration, formatFn, id)`** in `src/sidebar.js`: eased counter animation with cancelation support for smooth metric updates.

### CSS Patterns

- **`.glass`** (from `shared-base.css`): applied to `#toolbar`, `#map-controls`, `#district-palette`, `#sidebar`, `.plans-content`, `.election-panel`.
- **`.tool-btn`** (from `shared-base.css`): shared by toolbar buttons and map control buttons.
- **Theme icons**: CSS-driven via `[data-theme="light"] .icon-sun` / `[data-theme="dark"] .icon-moon` -- no JS visibility logic needed.
- **`font-variant-numeric: tabular-nums`**: inherited from `.stats-scroll` and `#map-controls` -- don't add individually to children.
- **Bar widths**: `.vote-bar, .prop-bar-fill { width: 0 }` in CSS -- JS sets width via inline style.
- Project-specific CSS var override: `--palette-h: 56px` (52px at 900px breakpoint).

### URL Hash Seeding

Map seed is stored in `location.hash` as `#seed=<number>`. On init, if a valid seed is in the hash, that seed is used; otherwise a random seed is generated. `randomizeMap()` and `loadPlan()` both update the hash via `history.replaceState()`.

## Gotchas

- **No `@import` in CSS** -- fonts are loaded via `<link>` in HTML. Duplicate `@import` in `styles.css` causes FOUC.
- **`data-theme="light"` must be on `<html>`** -- CSS theme rules (icon visibility, color-scheme, project-vars) depend on it before JS runs.
- **Media queries use `:root` only** -- layout tokens (`--panel-w`, `--toolbar-h`) are not theme-specific. Don't add `[data-theme]` selectors in media queries.
- **Intro card SVGs keep their attributes** -- `.tool-btn svg` defaults don't apply to intro cards. Those SVGs need explicit `fill="none" stroke="currentColor"` etc.
- **Shared CSS at domain root** -- `shared-base.css` is loaded via `/shared-base.css` (absolute path). When serving locally, serve from the parent `a9lim.github.io/` directory or the shared files won't resolve.
- **`shared-touch.js`** -- loaded via `<script src="/shared-touch.js">` in index.html for swipe-to-dismiss bottom sheet. Provides `initSwipeDismiss()` used in `setupUI()`.
- **Brush size display vs value** -- buttons display "1", "3", "7" but `data-brush` values are 0, 1, 2 (radii). Actual hex counts painted: 1, 7, 19.
- **Auto-fill breaks at capacity** -- `autoFillDistrict` stops when no candidate hex fits under `targetPop * 1.1`, even if district is not full. This is by design to prevent overfilling.
- **Election simulation uses `Math.random()`** -- not the seeded PRNG. Results are non-deterministic by design.
- **Fair draw uses `Math.random()`** -- simulated annealing is non-deterministic. Different runs on the same map produce different district plans.
