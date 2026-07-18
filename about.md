---
name: Gerry
title: Gerry — Gerrymandering and Electoral Fairness Simulator
description: Draw districts on a procedural hex map, compare six fairness measures, generate pack-and-crack or neutral plans, and stress-test Monte Carlo elections.
updated: 2026-07-17
---

# Gerry — Gerrymandering & Electoral Fairness Simulator

Gerry is an interactive redistricting simulator that demonstrates how district boundaries affect election outcomes. Players draw districts on a procedural hex-tile map and evaluate their fairness using six quantitative metrics.

## Mechanics

The simulation generates a seeded procedural map of voters affiliated with three political parties, distributed across a hex grid. Players partition this grid into districts by painting hex tiles. Each district elects one representative by plurality vote.

## Fairness Metrics

Six metrics evaluate the drawn map:

- **Efficiency gap**: Measures wasted votes (votes for losing candidates plus excess votes for winners) as a fraction of total votes. The dashboard warns above 7%.
- **Partisan symmetry**: Swaps vote totals for each pair of the three parties district by district, recounts seats, and scores how closely each seat-gap reversal matches a symmetric plan.
- **Competitive districts**: Counts districts where the margin of victory is less than 10%.
- **Compactness**: Measures how geometrically compact districts are using the Polsby-Popper ratio (area relative to perimeter squared).
- **Contiguity**: Verifies that every district is a single connected region with no isolated fragments.
- **Majority-minority districts**: Counts districts where a minority group holds a voting majority.

## Algorithms

Automated redistricting modes include pack-and-crack, which concentrates opposition voters into a few districts while spreading the rest thin, and a neutral draw. The neutral draw runs fifteen rounds of Lloyd-style Voronoi relaxation, using a distance-priority multi-source flood fill with a soft population-balance penalty at each round and once more after convergence. Monte Carlo election stress tests run 50, 100, or 500 elections with correlated national party swings plus smaller district-level preference noise.

## Educational Use

Designed for political science and civics education. Students experience firsthand how the same electorate can produce dramatically different outcomes depending on where district lines are drawn.

## Procedural Map Generation

Maps are generated from seeded fractal terrain, corridor fields, and density centers that shape population, party preference, and minority share across the hex grid. Seeds are reproducible, while controls expose partisan lean and clustering. Urban, suburban, and rural density bands create visibly different electoral geographies without claiming to reproduce a particular jurisdiction.

## Accessibility

Gerry's buttons, native controls, sidebar tabs, district selectors, and documented shortcuts are keyboard-operable. The map itself exposes an accessible label, but assigning individual hexes still requires a pointer or touch; this is a known gap. Toolbar actions have ARIA labels, and district results are reported as text and numbers alongside the color-coded map. The theme toggle switches between light and dark presentations. Map generation and painting use brief transitions; the shared stylesheet collapses animation and transition durations when the operating system requests reduced motion.

## Majority-Minority Districts

The simulator tracks districts where the generated minority population exceeds half the district population. Its required-count readout is a deliberately simplified heuristic: zero below 15% statewide minority share, otherwise `max(1, floor(minorityShare * 8 * 0.5))`. It does not test geographic compactness, communities of interest, racially polarized voting, or the other facts required for a Voting Rights Act analysis, so it is not a legal compliance determination.
