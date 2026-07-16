---
name: Gerry
title: Gerry — Gerrymandering and Electoral Fairness Simulator
description: Draw districts on a procedural hex map, compare six fairness measures, generate pack-and-crack or neutral plans, and stress-test Monte Carlo elections.
updated: 2026-07-16
---

# Gerry — Gerrymandering & Electoral Fairness Simulator

Gerry is an interactive redistricting simulator that demonstrates how district boundaries affect election outcomes. Players draw districts on a procedural hex-tile map and evaluate their fairness using six quantitative metrics.

## Mechanics

The simulation generates a seeded procedural map of voters affiliated with three political parties, distributed across a hex grid. Players partition this grid into districts by painting hex tiles. Each district elects one representative by plurality vote.

## Fairness Metrics

Six metrics evaluate the drawn map:

- **Efficiency gap**: Measures wasted votes (votes for losing candidates plus excess votes for winners) as a fraction of total votes. The dashboard warns above 7%.
- **Partisan symmetry**: Tests whether both parties would win the same seat share if they received the same vote share. Asymmetry indicates structural bias.
- **Competitive districts**: Counts districts where the margin of victory is less than 10%.
- **Compactness**: Measures how geometrically compact districts are using the Polsby-Popper ratio (area relative to perimeter squared).
- **Contiguity**: Verifies that every district is a single connected region with no isolated fragments.
- **Majority-minority districts**: Counts districts where a minority group holds a voting majority.

## Algorithms

Automated redistricting modes include pack-and-crack, which concentrates opposition voters into a few districts while spreading the rest thin, and a neutral draw. The neutral draw begins with fifteen rounds of Lloyd-style Voronoi relaxation, then assigns cells with a distance-priority multi-source flood fill that penalizes population imbalance. Monte Carlo election stress tests add turnout and preference noise across repeated elections to show how robust a plan is.

## Educational Use

Designed for political science and civics education. Students experience firsthand how the same electorate can produce dramatically different outcomes depending on where district lines are drawn.

## Procedural Map Generation

Maps are generated from seeded fractal terrain, corridor fields, and density centers that shape population, party preference, and minority share across the hex grid. Seeds are reproducible, while controls expose partisan lean and clustering. Urban, suburban, and rural density bands create visibly different electoral geographies without claiming to reproduce a particular jurisdiction.

## Accessibility

Gerry supports keyboard navigation for all controls, high-contrast mode via the theme toggle, and ARIA labels on toolbar buttons and metric displays. District assignments are visible through both color and numerical labels. No flashing content or motion hazards.

## Majority-Minority Districts

The simulator tracks districts where a minority group holds a voting majority and reports a simplified Section 2 warning when a sufficiently large, geographically compact minority population lacks an opportunity district. This is an educational diagnostic, not a legal compliance determination. The pack-and-crack mode also makes it possible to see how concentrating or fragmenting a population changes representation.
