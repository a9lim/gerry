# CLAUDE.md

Part of the **a9l.im** portfolio. See root `CLAUDE.md` for the shared design system, head loading order, CSS conventions, and shared code policy. Sibling projects: `geon`, `shoals`, `cyano`.

## Shared Code Policy

Always prefer shared modules over project-specific reimplementations. This project uses: `shared-tokens.js`, `shared-utils.js`, `shared-haptics.js`, `shared-toolbar.js`, `shared-forms.js`, `shared-intro.js`, `shared-base.css`, `shared-tabs.js`, `shared-camera.js`, `shared-info.js`, `shared-shortcuts.js`, `shared-touch.js`. Before adding utility code, check whether a `shared-*.js` file already provides it. New utilities useful across projects should be added to the shared files in the root repo.

## Overview

Interactive redistricting/gerrymandering simulator. Users paint congressional districts on a procedurally-generated hex-tile map with three parties (Federalist, Farmer-Labor, Reform), eight districts, and real-time fairness metrics. Zero dependencies -- vanilla HTML/CSS/JS with SVG rendering.

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
  config.js             -- CONFIG object, hex geometry constants (SQRT3, HEX_W, HEX_H, HEX_CORNER_OFFSETS, HEX_DIRS), getHexesInRadius(), EASE_OUT, PALETTE_COLOR_MAP, PARTY_NAMES
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
  auto-district.js      -- packAndCrack (gerrymander), fairDraw (Lloyd's Voronoi relaxation), helpers: _voronoiAssign, _spreadSeeds, _assignOrphans, _mergeSmallDistricts, _quickContiguityCheck, _getNeighbors
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

| Party | Display Name | `_PALETTE` key | Extended source |
|-------|-------------|---------------|-----------------|
| Orange (Federalist) | Federalist | `orange` | `extended.orange` (`#CC8E4E`) |
| Lime (Farmer-Labor) | Farmer-Labor | `lime` | `extended.lime` |
| Purple (Reform) | Reform | `purple` | `extended.purple` |
| None | None | `none` | `extended.slate` (`#8A7E72`) |
| Blue (minority) | — | `blue` | `extended.blue` (`#5C92A8`) |

Internal keys are `orange`/`lime`/`purple` throughout the codebase. Display names are defined in `PARTY_NAMES` (src/config.js) and used in UI labels, toasts, sidebar, and election histogram.

An IIFE injects `<style id="project-vars">` with themed CSS vars:
- `--party-orange/lime/purple/blue` with `-tint` (8% alpha) and `-wash` (18% alpha) variants for the three main parties
- `--tip-orange/lime/purple/blue` (darker in dark theme, lighter in light theme -- opposite of party colors)
- `--hex-stroke`, `--hex-hover-stroke`, `--bar-track`, `--party-none`
- `--hex-min-opacity` (0.22 light, 0.30 dark)
- `--label-fill`, `--label-stroke`

Light theme darkens party colors via `_darken()` (from `shared-tokens.js`); dark theme uses base colors directly.

## State Management (src/state.js)

All application state lives in a single `state` object:
- `hexes` (Map): hex tiles keyed by `"q,r"` axial coordinates, each storing `{ id, q, r, s, population, votes: {orange,lime,purple}, party, partyWinner, minority, district }`
- `districts` (Object): 8 districts keyed 1-8, each with `{ id, population, votes, hexes[], minorityPop, isContiguous, compactness, winner, isMinorityMajority }`
- `undoStack` / `redoStack`: snapshots of hex-to-district assignments (max 50 entries)
- `currentDistrict`: active district being painted (1-8)
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

Population centers (rural-dominated maps):
- 1-2 large cities (strength 250-650, decay 0.8-2.0)
- 2-4 suburbs (placed near cities, strength 70-250, decay 0.4-1.3)
- 6-11 small towns (strength 50-250, decay 0.3-1.3)
- 1-3 transportation corridors between cities (linear population boost with exponential falloff)

Population uses Gaussian decay from centers, scaled by fbm terrain noise and micro-noise, with random outlier spikes and dead zones.

Three density tiers determine partisan lean:
- **Urban** (pop > 150): ~64% Lime (Farmer-Labor), ~28% Orange (Federalist), ~8% Purple (Reform)
- **Suburban** (80-150): ~76% Orange, ~14% Lime, ~10% Purple
- **Rural** (<=80): ~85% Orange, ~8% Lime, ~7% Purple

Regional lean (`fbmNoise` at low frequency) shifts these probabilities per-hex. A `leanScale` factor (0.15-0.25) controls regional variation strength. Target overall vote split is roughly 45% Orange / 45% Lime / 10% Purple.

Vote assignment: winning-party hex gets 54-83% of non-Purple votes; Purple hexes get 28-36% Purple. Minority status determined by fbm noise against density-dependent thresholds (urban 0.58, suburban 0.72, rural 0.88).

### Efficiency Gap (src/metrics.js, `calculateEfficiencyGap`)

All-party wasted-vote analysis using plurality thresholds:
- Winner's wasted votes = votes above (second-place votes + 1)
- Each loser's wasted votes = all their votes
- Returns `{ orange, lime, purple }` wasted-vote ratios (wasted / totalVotes)
- Returns `null` if fewer than 2 active districts
- Sidebar displays: gap between least-wasted and second-least-wasted party, with arrow showing advantaged party. Color warning at > 7%.

### Partisan Symmetry (src/metrics.js, `calculatePartisanSymmetry`)

For each pair of parties (3 pairs total), swaps their vote shares in every district and recounts seats. Deviation = |actualSeatGap + swappedSeatGap| (should be equal and opposite in a symmetric map). Average deviation normalized to 0-100% scale (100 = perfectly symmetric). Returns `null` if fewer than 2 active districts.

### Competitive Districts (src/metrics.js, `calculateCompetitiveDistricts`)

Counts districts where `(first - second) / total < 0.1`. Returns `{ competitive, total }`.

### Required Majority-Minority Districts (src/metrics.js, `calculateRequiredMMD`)

`floor(minorityShare * numDistricts * 0.5)`, minimum 1 if minority share > 15%, else 0.

### Compactness (src/metrics.js, `calculateCompactness`)

Polsby-Popper: `4 * PI * area / perimeter^2 * 100`, clamped to 100. Area = hex count * hex area. Perimeter = count of boundary edges * hexSize.

### Contiguity (src/metrics.js, `checkContiguity`)

BFS from first hex in district; valid if visited count equals total hex count.

### Pack-and-Crack Gerrymander (src/auto-district.js, `packAndCrack`)

1. Clears all assignments
2. **Pack phase**: fills ~25% of districts (1-2) with highest-opposition hexes via BFS, seeded from hex with highest opposition share, queue sorted by opposition share
3. **Crack phase**: simultaneous round-robin BFS from seeds placed via farthest-point sampling among unassigned hexes; all crack districts grow one hex per round in lockstep to prevent any district from starving the others
4. Orphan assignment: assigns unassigned hexes to adjacent district with lowest population
5. **Merge pass** (`_mergeSmallDistricts`): any district below 30% of target population is dissolved, its hexes redistributed, and the empty district ID is re-grown by splitting the largest district

### Fair Draw (src/auto-district.js, `fairDraw`)

Lloyd's Voronoi relaxation (15 iterations, no annealing):
1. Place seeds via farthest-point sampling (`_spreadSeeds`), starting from the map centroid
2. **Voronoi assignment** (`_voronoiAssign`): distance-priority BFS from all seeds simultaneously. Each hex goes to the nearest seed by axial distance, with a soft population weight that makes over-populated districts appear farther away (`effective_dist = geo_dist + 40 * max(0, pop/target - 0.8)^2`). Produces contiguous, compact, population-balanced partitions without hard cutoffs.
3. Move seeds to population-weighted centroids (snap to nearest hex in district)
4. Repeat 2-3. Districts converge to compact Voronoi cells.

### Election Simulation (src/election-sim.js)

Monte Carlo: for each simulated election, generates correlated national swing per party (Gaussian, sigma configurable) plus local noise (sigma * 0.3). Applies swings to district vote shares, normalizes, determines winner. Histogram rendered on Canvas 2D with per-party bar groups and mean seat counts.

## UI Architecture

Map-first floating-panel layout:
- **Intro screen**: themed splash with instruction cards (Paint/Erase/Navigate) and CTA button, dismissed on click
- **Toolbar** (`#toolbar.sim-toolbar.glass`): fixed glass bar at top with tool buttons. Title uses `<em>` for italic accent-gradient second word. Buttons: undo, redo, erase, delete, pan, auto-fill, auto-gerrymander (with party dropdown), fair draw, simulate elections, plans, randomize, reset, theme, stats toggle.
- **Map**: full-viewport SVG (`<main>` with `position: fixed; inset: 0`). SVG groups: `hex-group` (polygons), `border-group` (district border paths), `minority-group` (circles), `label-group` (district number labels).
- **District palette** (`#district-palette.sim-bar.glass`): fixed pill-shaped bar at bottom center with 8 numbered buttons. Active = bold + accent color. Assigned districts show party-color text.
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

Wraps `shared-camera.js`'s `createCamera()`. Camera is initialized from the SVG viewBox dimensions. Default zoom starts at 2/3 of the fit-to-viewport zoom (`_defaultZoom = _baseZoom / 1.5`) to show the full map with padding. Zoom range: default zoom to default * `CONFIG.zoomMaxRatio` (3x), so the display reads 100%-300%. Wheel zoom factor: 1.12. Button zoom: 1.25x with 200ms animation. Zoom-fit: 300ms to original viewBox center (offset for sidebar if open).

`shiftForSidebar(opening)`: on desktop (>900px), animates camera pan by half panel width when sidebar opens/closes. Reads `--panel-w` from computed styles (no hardcoded pixel values).

### Keyboard Shortcuts

All shortcuts registered via `initShortcuts()` from `shared-shortcuts.js`. Press `?` to open the help overlay.

| Group | Key | Action |
|-------|-----|--------|
| **Tools** | `E` | Toggle erase mode |
| | `D` | Toggle delete mode |
| | `P` | Toggle pan mode |
| | `A` | Auto-fill current district |
| | `B` | Cycle brush size (1 / 7 / 19 hexes) |
| | `Ctrl+Z` | Undo |
| | `Ctrl+Y` / `Ctrl+Shift+Z` | Redo |
| **Map** | `R` | Reset districts (clear all assignments) |
| | `N` | Randomize map (new seed) |
| | `G` | Auto-gerrymander (uses party dropdown selection) |
| | `F` | Fair draw (Voronoi relaxation) |
| | `M` | Run Monte Carlo election simulation |
| **Districts** | `1`-`8` | Select district 1-8 |
| **View** | `T` | Toggle theme |
| | `S` | Toggle sidebar |
| | `Escape` | Close sidebar |
| | `[` / `]` | Previous / next sidebar tab |
| | `=` / `-` | Zoom in / out |
| | `0` | Reset zoom (zoom-to-fit) |
| | `?` | Open keyboard shortcuts help overlay |

Note: `0` is zoom reset. Space/comma/period are not bound (no simulation playback in this project).

### Info Tips

Via `createInfoTip()` from `shared-info.js`: `?` buttons next to metrics triggered by `data-info` attribute. Data defined inline in `main.js` for: Efficiency Gap, Partisan Symmetry, Competitive Districts, Compactness, Contiguity, Majority-Minority, Population Balance.

### Touch Interactions

Touch input handled by `src/touch.js`, which delegates painting to `input.js` functions and zoom/pan to the shared camera.

- **Single-finger tap/drag**: paints the active district (or erases if erase mode is active via `#erase-btn` or `E` key)
- **Two-finger pinch**: zoom in/out
- **Two-finger drag**: pan the map
- There is no touch-native erase gesture; erase mode must be toggled via the `#erase-btn` toolbar button or the `E` key
- The hint bar at the bottom of the intro screen shows touch-appropriate instruction text on `(pointer: coarse)` devices

### Touch Targets

Touch-friendly sizing is applied via `@media (pointer: coarse)` rules in both `shared-base.css` (shared tool buttons, form controls) and `gerry/styles.css` (project-specific elements):

- District palette buttons expand to 44px minimum on touch devices
- Plan action buttons (save, load, delete, export) expand to 44px
- Map control buttons (zoom in/out/fit) expand to 44px

### Accessibility

- **Dialogs**: Plans dialog (`#plans-dialog`) and election overlay (`#election-overlay`) use `role="dialog"` and `aria-modal="true"` with `trapFocus()` to constrain keyboard navigation
- **Palette buttons**: each district palette button has `aria-pressed` reflecting the active selection state
- **Brush-size buttons**: have `aria-pressed` reflecting the current brush size
- **Skip link**: targets `#map-container` with `tabindex="-1"` for keyboard users to skip navigation
- **Election close button**: has `aria-label="Close"` for screen readers
- **About panel**: uses focus trap (via `shared-about.js`) when open
- **Tab navigation**: `shared-tabs.js` provides arrow-key navigation between sidebar tabs (Statewide, District, Tools)

## Key Patterns

### Performance

- **`$` object**: cached DOM element references built in `cacheDOMElements()` in `main.js`. All `getElementById` calls live in this single function. Use `$.elementName` everywhere else.
- **`hexElements` Map** (state.js): maps `"q,r"` keys to SVG `<g>` elements. Use instead of `querySelector('.hex[data-qr="..."]')`.
- **No per-hex event listeners**: SVG-level listeners on `$.svg` handle all hex interaction via event delegation. `getHexFromEvent()` walks from target polygon up to `.hex` group to get `data-qr`. `getHexFromPoint()` converts client coordinates to axial hex coordinates for touch input.
- **Precomputed constants** in `src/config.js`: `SQRT3`, `HEX_W`, `HEX_H`, `HEX_CORNER_OFFSETS`, `HEX_DIRS`, `HEX_RENDER_SIZE`. Avoid recalculating geometry.
- **`scheduleBorderUpdate()`** in `src/input.js`: collects changed district IDs in `_changedDistricts` Set, defers border re-rendering to one `requestAnimationFrame` per paint stroke for incremental updates.
- **Border cache** in `src/renderer.js`: `_borderCache` object stores built SVG groups and clip paths per district. Incremental updates only rebuild changed districts.

### Helpers

- **`votePcts(votes)`** in `src/metrics.js`: returns `{ orange, lime, purple }` as raw percentages. Callers round as needed.
- **`getHexesInRadius(q, r, radius)`** in `src/config.js`: returns array of `"q,r"` keys within axial distance. Used by brush painting.
- **`shiftForSidebar(opening)`** in `src/zoom.js`: reads `--panel-w` from computed styles -- no hardcoded pixel values.
- **`animateValue(el, end, duration, formatFn, id)`** from `shared-utils.js`: eased counter animation with cancelation support for smooth metric updates.

### CSS Patterns

- **`.glass`** (from `shared-base.css`): applied to `#toolbar`, `#map-controls`, `#district-palette`, `#sidebar`, `.plans-content`, `.election-panel`.
- **`.tool-btn`** (from `shared-base.css`): shared by toolbar buttons and map control buttons.
- **Theme icons**: CSS-driven via `[data-theme="light"] .icon-sun` / `[data-theme="dark"] .icon-moon` -- no JS visibility logic needed.
- **`font-variant-numeric: tabular-nums`**: inherited from `.stats-scroll` and `#map-controls` -- don't add individually to children.
- **Bar widths**: `.vote-bar, .prop-bar-fill { width: 0 }` in CSS -- JS sets width via inline style.
- Project-specific CSS var override: `--palette-h: 56px` (52px at 900px breakpoint).
- **Shared utilities**: `_toolbar.initSidebar()` for sidebar toggle/close/swipe/auto-open-on-desktop with `shiftForSidebar` callback, `_toolbar.initTheme('gerry-theme')` for theme persistence + system preference, `_intro.init()` for intro screen, `_forms.bindModeGroup()` for brush size toggles, `registerInfoTips()` for info tips, `initOverlayDismiss()` for plans dialog and election overlay dismiss.

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
- **Fair draw is deterministic** -- Lloyd's Voronoi relaxation uses no randomness; same map always produces the same district plan.
