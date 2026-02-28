// ─── Metrics (pure computation) ───
import { CONFIG, HEX_DIRS } from './config.js';
import { state } from './state.js';

export function calculateMetrics() {
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = {
            id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 },
            hexes: [], minorityPop: 0, isContiguous: false, compactness: 0,
            winner: 'none', isMinorityMajority: false
        };
    }
    state.hexes.forEach(hex => {
        const d = state.districts[hex.district];
        if (d) {
            d.population += hex.population;
            d.votes.red += hex.votes.red;
            d.votes.blue += hex.votes.blue;
            d.votes.yellow += hex.votes.yellow;
            if (hex.minority) d.minorityPop += hex.population;
            d.hexes.push(hex);
        }
    });
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            const { red, blue, yellow } = d.votes;
            const max = Math.max(red, blue, yellow);
            d.winner = max === red ? 'red' : max === blue ? 'blue' : 'yellow';
            d.isMinorityMajority = (d.minorityPop / d.population) > 0.5;
            d.isContiguous = checkContiguity(d);
            d.compactness = calculateCompactness(d);
        }
    }
}

function checkContiguity(d) {
    if (d.hexes.length === 0) return true;
    const visited = new Set([d.hexes[0].id]);
    const queue = [d.hexes[0]];
    let head = 0;
    while (head < queue.length) {
        const curr = queue[head++];
        for (const dir of HEX_DIRS) {
            const neighbor = state.hexes.get(`${curr.q + dir.dq},${curr.r + dir.dr}`);
            if (neighbor && neighbor.district === d.id && !visited.has(neighbor.id)) {
                visited.add(neighbor.id);
                queue.push(neighbor);
            }
        }
    }
    return queue.length === d.hexes.length;
}

function calculateCompactness(d) {
    if (d.hexes.length === 0) return 0;
    let perimeter = 0;
    for (const hex of d.hexes) {
        for (const dir of HEX_DIRS) {
            const neighbor = state.hexes.get(`${hex.q + dir.dq},${hex.r + dir.dr}`);
            if (!neighbor || neighbor.district !== d.id) perimeter++;
        }
    }
    if (perimeter === 0) return 100;
    return Math.min(100, Math.round((32.648 * d.hexes.length) / (perimeter * perimeter) * 100));
}

export function calculateEfficiencyGap() {
    let wastedRed = 0, wastedBlue = 0, totalVotes = 0;
    let numActiveDistricts = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        numActiveDistricts++;

        const { red: redV, blue: blueV } = d.votes;
        const districtTotal = redV + blueV;
        if (districtTotal === 0) continue;

        totalVotes += districtTotal;
        const threshold = Math.floor(districtTotal / 2) + 1;

        if (redV > blueV) {
            wastedRed += redV - threshold;
            wastedBlue += blueV;
        } else {
            wastedBlue += blueV - threshold;
            wastedRed += redV;
        }
    }

    if (totalVotes === 0 || numActiveDistricts < 2) return null;
    return (wastedRed - wastedBlue) / totalVotes;
}

export function votePcts(votes) {
    const total = votes.red + votes.blue + votes.yellow;
    if (total === 0) return { red: 0, blue: 0, yellow: 0 };
    return { red: votes.red / total * 100, blue: votes.blue / total * 100, yellow: votes.yellow / total * 100 };
}
