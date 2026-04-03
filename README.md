# Gerry

An interactive gerrymandering simulator. Paint congressional districts on a procedural hex-tile map and watch how boundary placement shapes electoral outcomes in real time.

**[Try it](https://a9l.im/gerry)** | Part of the [a9l.im](https://a9l.im) portfolio

## What It Does

You draw district boundaries on a randomly generated map populated by three political parties (Federalist, Farmer-Labor, Reform) with realistic urban/suburban/rural demographic leans. The simulator scores your map on six fairness metrics -- efficiency gap, partisan symmetry, competitive districts, compactness, contiguity, and majority-minority representation -- so you can see exactly how and why a given map is fair or unfair.

Two automated algorithms let you compare extremes: a pack-and-crack gerrymander that maximizes seats for a chosen party, and a Lloyd's relaxation fair draw that optimizes for population balance and compactness. A Monte Carlo election simulator stress-tests any plan against random vote swings.

## Concepts Covered

- **Gerrymandering tactics** -- packing and cracking, three-party dynamics where you can sacrifice one opposition to benefit another
- **Efficiency gap** -- wasted-vote analysis across three parties, with the 7% warning threshold used in real court cases
- **Partisan symmetry** -- whether a map treats parties equally when vote shares are swapped
- **Compactness** -- Polsby-Popper score measuring how circular districts are
- **Contiguity** -- whether all hexes in a district are physically connected
- **Majority-minority districts** -- ensuring minority communities get adequate representation
- **Monte Carlo simulation** -- running 50-500 elections with Gaussian vote swings to see which plans are resilient

## Quick Start

Click or drag to paint hexes with the active district color. Right-click to erase. Use the numbered palette at the bottom to switch between 8 districts, or press keys 1-8. The sidebar shows live fairness metrics as you draw.

Toolbar buttons give you auto-fill (greedy fill to population target), automated gerrymander, fair draw, election simulation, and plan save/load/export.

Press `?` for the full keyboard shortcut overlay.

## Running Locally

```bash
cd path/to/a9lim.github.io && python -m http.server
```

No build step or dependencies. Shared design system files load from the parent directory via absolute paths, so serve from the repository root.

## Tech

Zero-dependency vanilla JS. SVG rendering with event delegation (no per-hex listeners). Seeded PRNG (Mulberry32) for reproducible maps -- seeds stored in URL hashes for sharing. ES6 modules, no build step.

## License

[AGPL-3.0](LICENSE)
