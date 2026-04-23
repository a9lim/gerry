# Gerry

An interactive gerrymandering simulator that runs entirely in the browser. You paint congressional districts on a procedural hex-tile map and see how your choices move fairness metrics in real time. 

**[Try it](https://a9l.im/gerry)** | Part of the [a9l.im](https://a9l.im) portfolio

## What It Does

Draw district boundaries on a randomly generated map populated by three political parties (Federalist, Farmer-Labor, Reform) with realistic urban, suburban, and rural demographic leans. The simulator scores your map on six fairness metrics (efficiency gap, partisan symmetry, competitive districts, compactness, contiguity, and majority-minority representation), so you can see firsthand how and why a given map is fair or unfair.

Two automated algorithms let you compare extremes: a pack-and-crack gerrymander that maximizes seats for a chosen party, and a Lloyd's relaxation fair draw that optimizes for population balance and compactness. A Monte Carlo election simulator stress-tests any plan against random vote swings.

## Concepts Covered

- **Gerrymandering tactics**: packing and cracking, three-party dynamics where you can sacrifice one opposition to benefit another
- **Efficiency gap**: wasted-vote analysis across three parties, with the 7% warning threshold used in real court cases
- **Partisan symmetry**: whether a map treats parties equally when vote shares are swapped
- **Compactness**: Polsby-Popper score measuring how circular districts are
- **Contiguity**: whether all hexes in a district are physically connected
- **Majority-minority districts**: ensuring minority communities get adequate representation
- **Monte Carlo simulation**: running 50 to 500 elections with Gaussian vote swings to see which plans are resilient

## Quick Start

Click or drag to paint hexes with the active district color. Right-click to erase. Use the numbered palette at the bottom to switch between 8 districts, or press keys 1-8. The sidebar updates fairness metrics as you draw, so you get immediate feedback on every change.

Toolbar buttons give you auto-fill (greedy fill to population target), automated gerrymander, fair draw, election simulation, and plan save, load, and export. Press `?` for the full keyboard shortcut overlay.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

Shared design system files load from the parent directory via absolute paths, so please serve from the repository root. There's no build step or dependencies.

## Tech

Vanilla JS with no dependencies. SVG rendering with event delegation (no per-hex listeners). Seeded PRNG (Mulberry32) for reproducible maps, and seeds are stored in URL hashes for sharing. ES6 modules load directly without a build step.

## License

[AGPL-3.0](LICENSE)
