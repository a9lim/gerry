// Procedural hex map generation: population centers, party leans, minority clusters.
// Deterministic from a single integer seed via Mulberry32 PRNG.
import { CONFIG } from './config.js';
import { hexDistance } from './hex-math.js';
import { hashNoise, fbmNoise } from './noise.js';
import { state, initDistricts } from './state.js';
import { createPRNG } from './prng.js';
import { calculateMetrics } from './metrics.js';

function getHexWinner(hex) {
    const { red, blue, yellow } = hex.votes;
    const max = Math.max(red, blue, yellow);
    if (max === red) return 'red';
    if (max === blue) return 'blue';
    return 'yellow';
}

/**
 * Generates the full hex grid from `seed`.
 *
 * 1. **Boundary shape**: trigonometric noise (sin/cos at random frequencies)
 *    sculpts an organic state outline from the rectangular grid.
 * 2. **Population**: Gaussian decay from randomly-placed city/suburb/town
 *    centers, plus linear corridor boosts between cities, layered with
 *    fractal Brownian motion terrain noise and random outlier spikes.
 * 3. **Party lean**: three density tiers (urban/suburban/rural) set base
 *    probabilities; low-frequency fbm regional lean shifts them per-hex.
 * 4. **Vote split**: winning party gets 54-83% of non-Yellow votes;
 *    Yellow-plurality hexes get 28-36% Yellow. Remaining votes split
 *    randomly between the other two parties.
 * 5. **Minority status**: fbm noise against density-dependent thresholds
 *    (lower threshold in urban areas = more minority hexes near cities).
 */
export function generateHexes(seed) {
    const rand = createPRNG(seed);
    let idCounter = 0;
    const centerX = CONFIG.cols / 2;
    const centerY = CONFIG.rows / 2;
    const maxRadius = Math.min(CONFIG.cols, CONFIG.rows) / 2 + 1;

    // Boundary noise: two trig harmonics give an organic state outline.
    const phase1 = rand() * Math.PI * 2;
    const phase2 = rand() * Math.PI * 2;
    const freq1 = 2 + rand() * 4;
    const freq2 = 3 + rand() * 5;
    const amp1 = 1 + rand() * 2;
    const amp2 = 0.5 + rand() * 2;
    const baseRadius = maxRadius * (0.75 + rand() * 0.15);

    const validCoords = [];
    for (let r = 0; r < CONFIG.rows; r++) {
        const r_offset = Math.floor(r / 2);
        for (let q = -r_offset; q < CONFIG.cols - r_offset; q++) {
            const y = r, x = q + r_offset;
            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            const angle = Math.atan2(y - centerY, x - centerX);
            const noise = Math.sin(angle * freq1 + phase1) * amp1 + Math.cos(angle * freq2 + phase2) * amp2;
            if (dist <= baseRadius + noise) {
                validCoords.push({ q, r, x, y, dist });
            }
        }
    }

    const noiseSeed = rand() * 10000;
    const partySeed = rand() * 10000;
    const minoritySeed = rand() * 10000;

    // Place population centers: large cities, suburbs (near cities), small towns.
    const numLargeCities = Math.floor(rand() * 2) + 2;
    const numSmallTowns = Math.floor(rand() * 6) + 5;
    const numSuburbs = Math.floor(rand() * 4) + 3;
    const centers = [];

    for (let i = 0; i < numLargeCities; i++) {
        const c = validCoords[Math.floor(rand() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: rand() * 600 + 350, decay: rand() * 1.8 + 1.2, type: 'city' });
    }
    // Suburbs placed at random angles 1.5-5.5 hexes from a city center.
    for (let i = 0; i < numSuburbs; i++) {
        const city = centers[Math.floor(rand() * Math.min(centers.length, numLargeCities))];
        const angle = rand() * Math.PI * 2;
        const dist = 1.5 + rand() * 4;
        centers.push({
            q: city.q + Math.round(Math.cos(angle) * dist),
            r: city.r + Math.round(Math.sin(angle) * dist),
            strength: rand() * 250 + 100, decay: rand() * 1.2 + 0.6, type: 'suburb'
        });
    }
    for (let i = 0; i < numSmallTowns; i++) {
        const c = validCoords[Math.floor(rand() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: rand() * 200 + 50, decay: rand() * 1.0 + 0.3, type: 'town' });
    }

    // Transportation corridors: linear population boost with exponential falloff.
    const corridors = [];
    if (centers.length >= 2) {
        const numCorridors = Math.floor(rand() * 3) + 1;
        for (let i = 0; i < numCorridors; i++) {
            const a = centers[Math.floor(rand() * numLargeCities)];
            const b = centers[Math.floor(rand() * centers.length)];
            if (a !== b) corridors.push({ q1: a.q, r1: a.r, q2: b.q, r2: b.r, width: 1.5 + rand(), strength: 60 + rand() * 80 });
        }
    }

    /** Point-to-segment distance for corridor population falloff. */
    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        const t = clamp(((px - x1) * dx + (py - y1) * dy) / lenSq, 0, 1);
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    state.maxPop = 0;
    // leanScale controls spatial frequency of regional partisan variation.
    const leanScale = 0.15 + rand() * 0.1;

    validCoords.forEach(c => {
        const { q, r } = c;

        // Layer terrain fbm and micro-noise for natural population variation.
        const terrainNoise = fbmNoise(q * 0.3, r * 0.3, noiseSeed, 5);
        const microNoise = fbmNoise(q * 1.2, r * 1.2, noiseSeed + 50, 3);
        let pop = Math.floor(3 + terrainNoise * 70 + microNoise * 30 + rand() * 20);

        // Gaussian decay from each population center.
        for (const center of centers) {
            const d = hexDistance(q, r, center.q, center.r);
            const localNoise = 0.5 + hashNoise(q, r, noiseSeed + 777);
            const edgeJitter = 0.8 + hashNoise(q * 2.3, r * 2.3, noiseSeed + 555) * 0.4;
            pop += Math.floor(center.strength * Math.exp(-d / (center.decay * edgeJitter)) * localNoise);
        }

        for (const cor of corridors) {
            const d = distToSegment(q, r, cor.q1, cor.r1, cor.q2, cor.r2);
            if (d < cor.width * 2.5) {
                pop += Math.floor(cor.strength * Math.exp(-d / cor.width) * (0.3 + hashNoise(q, r, noiseSeed + 999) * 0.7));
            }
        }

        // Random outlier spikes (~10%) and dead zones (low-noise regions).
        if (rand() < 0.10) pop += Math.floor(rand() * 120 + 30);
        if (hashNoise(q * 0.8, r * 0.8, noiseSeed + 2000) > 0.82) {
            pop = Math.floor(pop * (0.1 + rand() * 0.2));
        }

        // Final variance layers prevent uniform-looking regions.
        pop = Math.floor(pop * (0.4 + hashNoise(q * 1.7, r * 1.7, noiseSeed + 333) * 1.2));
        pop = Math.max(3, Math.floor(pop * (0.7 + hashNoise(q * 3.1, r * 3.1, noiseSeed + 444) * 0.6)));

        if (pop > state.maxPop) state.maxPop = pop;

        // Party lean: low-frequency fbm creates regional political blocs.
        const regionalLean = fbmNoise(q * leanScale, r * leanScale, partySeed, 3);
        const isUrban = pop > CONFIG.urbanThreshold;
        const isSuburban = pop > CONFIG.suburbanThreshold && pop <= CONFIG.urbanThreshold;

        // Three density tiers with different base probabilities.
        // Urban skews Blue (~70%), rural skews Red (~76%), Yellow is the third party.
        let party;
        const roll = rand();

        if (isUrban) {
            const blueChance = 0.70 + (regionalLean - 0.5) * 0.15;
            const redChance = 0.22 - (regionalLean - 0.5) * 0.1;
            party = roll < blueChance ? 'blue' : roll < blueChance + redChance ? 'red' : 'yellow';
        } else if (isSuburban) {
            const redChance = 0.62 + (0.5 - regionalLean) * 0.15;
            const blueChance = 0.25 + (regionalLean - 0.5) * 0.1;
            party = roll < redChance ? 'red' : roll < redChance + blueChance ? 'blue' : 'yellow';
        } else {
            const redChance = 0.76 + (0.5 - regionalLean) * 0.12;
            const blueChance = 0.16 + (regionalLean - 0.5) * 0.08;
            party = roll < redChance ? 'red' : roll < redChance + blueChance ? 'blue' : 'yellow';
        }

        // Vote distribution: winning party gets a majority; remainder split.
        const votes = { red: 0, blue: 0, yellow: 0 };
        if (party === 'yellow') {
            const yellowBoost = 0.28 + rand() * 0.08;
            votes.yellow = Math.floor(pop * yellowBoost);
            const rest = pop - votes.yellow;
            const redShare = 0.3 + rand() * 0.4;
            votes.red = Math.floor(rest * redShare);
            votes.blue = rest - votes.red;
        } else {
            const yellowPct = 0.04 + rand() * 0.08;
            votes.yellow = Math.floor(pop * yellowPct);
            const majorRemainder = pop - votes.yellow;
            const baseMargin = isUrban ? 0.58 : (isSuburban ? 0.54 : 0.58);
            const winningPct = baseMargin + rand() * 0.25;
            votes[party] = Math.floor(majorRemainder * winningPct);
            const loser = party === 'red' ? 'blue' : 'red';
            votes[loser] = majorRemainder - votes[party];
        }

        // Minority status: fbm noise against density-dependent threshold.
        // Lower threshold in urban areas = higher minority concentration near cities.
        const minorityNoise = fbmNoise(q * 0.35, r * 0.35, minoritySeed, 4) * 0.7
            + fbmNoise(q * 0.9, r * 0.9, minoritySeed + 500, 3) * 0.3;
        const minorityThreshold = isUrban ? 0.48 : (isSuburban ? 0.60 : 0.78);

        const hex = {
            id: ++idCounter, q, r, s: -q - r,
            population: pop, votes, party,
            minority: minorityNoise > minorityThreshold,
            district: 0
        };
        hex.partyWinner = getHexWinner(hex);
        state.hexes.set(`${q},${r}`, hex);
    });

    initDistricts();
    calculateMetrics();
}
