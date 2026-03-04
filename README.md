# Redistricting Simulator

An interactive gerrymandering simulation where you paint congressional districts on a procedurally-generated hex map and watch how boundary placement affects electoral outcomes in real time. Three parties, ten districts, and a battery of fairness metrics let you explore the mechanics of redistricting -- from pack-and-crack gerrymanders to proportional fair draws.

**[Live Demo](https://a9l.im/gerry)** | Part of the [a9l.im](https://a9l.im) portfolio

## What Makes It Interesting

- **Three-party system** -- Red, Blue, and Yellow parties with realistic urban/suburban/rural demographic leans make gerrymandering tactics more nuanced than a two-party model.
- **Fairness metrics** -- All-party efficiency gap (wasted-vote analysis), partisan symmetry (vote-share swap test), competitive districts, Polsby-Popper compactness, BFS contiguity, and dynamic majority-minority district requirements.
- **Auto-gerrymander vs fair draw** -- One-click pack-and-crack algorithm that maximizes seats for a chosen party, and a simulated-annealing fair-draw algorithm that minimizes proportionality error.
- **Election Monte Carlo** -- Simulate 50-500 elections with configurable Gaussian vote swings to stress-test a district plan's resilience.
- **Plan save/load** -- Save named plans to localStorage, export/import as JSON files, and share reproducible maps via seed-based URL hashes.
- **Seeded procedural generation** -- Mulberry32 PRNG produces deterministic maps from a seed. Population centers (cities, suburbs, towns), transportation corridors, and minority clusters are generated with fractal Brownian motion noise and Gaussian decay.

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
- **Partisan Symmetry** -- For each pair of parties, swap vote shares across all districts and recount seats. Measures whether the map treats parties equally (0-100%, higher is fairer).
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

Zero-dependency vanilla JS/HTML/CSS. SVG rendering (not Canvas). ES6 modules loaded via `<script type="module">`. Seeded PRNG (Mulberry32) for reproducible map generation. Simulated annealing for fair-draw optimization. The shared design system from [a9lim.github.io](https://github.com/a9lim/a9lim.github.io) provides glass panels, tool buttons, camera/zoom, info tips, keyboard shortcuts, and responsive breakpoints.

## Sibling Projects

- [Relativistic N-Body](https://github.com/a9lim/physsim) -- [a9l.im/physsim](https://a9l.im/physsim)
- [Cellular Metabolism](https://github.com/a9lim/biosim) -- [a9l.im/biosim](https://a9l.im/biosim)

## License

[AGPL-3.0](LICENSE)
