# Gerry — Gerrymandering & Electoral Fairness Simulator

Gerry is an interactive redistricting simulator that demonstrates how district boundaries affect election outcomes. Players draw districts on a procedural hex-tile map and evaluate their fairness using six quantitative metrics.

## Mechanics

The simulation generates a seeded procedural map of voters affiliated with three political parties, distributed across a hex grid. Players partition this grid into districts by painting hex tiles. Each district elects one representative by plurality vote.

## Fairness Metrics

Six metrics evaluate the drawn map:

- **Efficiency gap**: Measures wasted votes (votes for losing candidates plus excess votes for winners) as a fraction of total votes. Values above 8% suggest gerrymandering.
- **Partisan symmetry**: Tests whether both parties would win the same seat share if they received the same vote share. Asymmetry indicates structural bias.
- **Competitive districts**: Counts districts where the margin of victory is less than 10%.
- **Compactness**: Measures how geometrically compact districts are using the Polsby-Popper ratio (area relative to perimeter squared).
- **Contiguity**: Verifies that every district is a single connected region with no isolated fragments.
- **Majority-minority districts**: Counts districts where a minority group holds a voting majority.

## Algorithms

Automated redistricting modes include pack-and-crack (a classic gerrymandering strategy that concentrates opposition voters into a few districts while spreading the rest thin) and a simulated-annealing fair draw algorithm that optimizes for compactness and partisan symmetry. Monte Carlo election stress tests run thousands of simulated elections with voter turnout noise to evaluate how robust a map is.

## Educational Use

Designed for political science and civics education. Students experience firsthand how the same electorate can produce dramatically different outcomes depending on where district lines are drawn.

## Procedural Map Generation

Maps are generated from a seeded Perlin noise function that assigns party affiliation probabilities to each hex cell. The seed is adjustable via the URL hash, producing reproducible maps with configurable partisan lean, urban clustering, and minority population density. Population per cell varies by a log-normal distribution to simulate real demographic density patterns. Three density tiers — urban, suburban, and rural — produce distinct partisan compositions mimicking the urban-rural political divide.

## Majority-Minority Districts

The simulator tracks districts where a minority group holds a voting majority, as required for Voting Rights Act Section 2 compliance. The fairness dashboard flags maps that pack or crack minority populations, and the fair-draw algorithm includes a constraint term for minority representation. The pack-and-crack algorithm demonstrates how concentrating opposition voters into a few districts while distributing the remainder thinly yields disproportionate seat shares.
