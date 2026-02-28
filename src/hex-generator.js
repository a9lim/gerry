// ─── Hex Grid Generation ───
import { CONFIG } from './config.js';
import { hexDistance } from './hex-math.js';
import { hashNoise, fbmNoise } from './noise.js';
import { state, initDistricts } from './state.js';
import { calculateMetrics } from './metrics.js';

function getHexWinner(hex) {
    const { red, blue, yellow } = hex.votes;
    const max = Math.max(red, blue, yellow);
    if (max === red) return 'red';
    if (max === blue) return 'blue';
    return 'yellow';
}

export function generateHexes() {
    let idCounter = 0;
    const centerX = CONFIG.cols / 2;
    const centerY = CONFIG.rows / 2;
    const maxRadius = Math.min(CONFIG.cols, CONFIG.rows) / 2 + 1;

    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const freq1 = 2 + Math.random() * 4;
    const freq2 = 3 + Math.random() * 5;
    const amp1 = 1 + Math.random() * 2;
    const amp2 = 0.5 + Math.random() * 2;
    const baseRadius = maxRadius * (0.75 + Math.random() * 0.15);

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

    const noiseSeed = Math.random() * 10000;
    const partySeed = Math.random() * 10000;
    const minoritySeed = Math.random() * 10000;

    // Population centers
    const numLargeCities = Math.floor(Math.random() * 2) + 2;
    const numSmallTowns = Math.floor(Math.random() * 6) + 5;
    const numSuburbs = Math.floor(Math.random() * 4) + 3;
    const centers = [];

    for (let i = 0; i < numLargeCities; i++) {
        const c = validCoords[Math.floor(Math.random() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: Math.random() * 600 + 350, decay: Math.random() * 1.8 + 1.2, type: 'city' });
    }
    for (let i = 0; i < numSuburbs; i++) {
        const city = centers[Math.floor(Math.random() * Math.min(centers.length, numLargeCities))];
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.5 + Math.random() * 4;
        centers.push({
            q: city.q + Math.round(Math.cos(angle) * dist),
            r: city.r + Math.round(Math.sin(angle) * dist),
            strength: Math.random() * 250 + 100, decay: Math.random() * 1.2 + 0.6, type: 'suburb'
        });
    }
    for (let i = 0; i < numSmallTowns; i++) {
        const c = validCoords[Math.floor(Math.random() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: Math.random() * 200 + 50, decay: Math.random() * 1.0 + 0.3, type: 'town' });
    }

    // Transportation corridors
    const corridors = [];
    if (centers.length >= 2) {
        const numCorridors = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numCorridors; i++) {
            const a = centers[Math.floor(Math.random() * numLargeCities)];
            const b = centers[Math.floor(Math.random() * centers.length)];
            if (a !== b) corridors.push({ q1: a.q, r1: a.r, q2: b.q, r2: b.r, width: 1.5 + Math.random(), strength: 60 + Math.random() * 80 });
        }
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    state.maxPop = 0;
    const leanScale = 0.15 + Math.random() * 0.1;

    validCoords.forEach(c => {
        const { q, r } = c;

        const terrainNoise = fbmNoise(q * 0.3, r * 0.3, noiseSeed, 5);
        const microNoise = fbmNoise(q * 1.2, r * 1.2, noiseSeed + 50, 3);
        let pop = Math.floor(3 + terrainNoise * 70 + microNoise * 30 + Math.random() * 20);

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

        if (Math.random() < 0.10) pop += Math.floor(Math.random() * 120 + 30);
        if (hashNoise(q * 0.8, r * 0.8, noiseSeed + 2000) > 0.82) {
            pop = Math.floor(pop * (0.1 + Math.random() * 0.2));
        }

        pop = Math.floor(pop * (0.4 + hashNoise(q * 1.7, r * 1.7, noiseSeed + 333) * 1.2));
        pop = Math.max(3, Math.floor(pop * (0.7 + hashNoise(q * 3.1, r * 3.1, noiseSeed + 444) * 0.6)));

        if (pop > state.maxPop) state.maxPop = pop;

        const regionalLean = fbmNoise(q * leanScale, r * leanScale, partySeed, 3);
        const isUrban = pop > 150;
        const isSuburban = pop > 80 && pop <= 150;

        let party;
        const roll = Math.random();

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

        const votes = { red: 0, blue: 0, yellow: 0 };
        if (party === 'yellow') {
            const yellowBoost = 0.28 + Math.random() * 0.08;
            votes.yellow = Math.floor(pop * yellowBoost);
            const rest = pop - votes.yellow;
            const redShare = 0.3 + Math.random() * 0.4;
            votes.red = Math.floor(rest * redShare);
            votes.blue = rest - votes.red;
        } else {
            const yellowPct = 0.04 + Math.random() * 0.08;
            votes.yellow = Math.floor(pop * yellowPct);
            const majorRemainder = pop - votes.yellow;
            const baseMargin = isUrban ? 0.58 : (isSuburban ? 0.54 : 0.58);
            const winningPct = baseMargin + Math.random() * 0.25;
            votes[party] = Math.floor(majorRemainder * winningPct);
            const loser = party === 'red' ? 'blue' : 'red';
            votes[loser] = majorRemainder - votes[party];
        }

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
