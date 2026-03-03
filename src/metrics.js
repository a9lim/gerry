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
    const s = CONFIG.hexSize;
    const area = d.hexes.length * 1.5 * Math.sqrt(3) * s * s;
    const perim = perimeter * s;
    return Math.min(100, Math.round(4 * Math.PI * area / (perim * perim) * 100));
}

export function calculateEfficiencyGap() {
    const wasted = { red: 0, blue: 0, yellow: 0 };
    let totalVotes = 0;
    let numActiveDistricts = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        numActiveDistricts++;

        const { red, blue, yellow } = d.votes;
        const districtTotal = red + blue + yellow;
        if (districtTotal === 0) continue;

        totalVotes += districtTotal;
        // Plurality threshold: need more than any other single party
        const max = Math.max(red, blue, yellow);
        const winner = max === red ? 'red' : max === blue ? 'blue' : 'yellow';

        for (const party of ['red', 'blue', 'yellow']) {
            if (party === winner) {
                // Winner wastes votes above what was needed to win
                // In plurality: threshold = second-place votes + 1
                const others = [red, blue, yellow].filter((_, j) => ['red', 'blue', 'yellow'][j] !== party);
                const threshold = Math.max(...others) + 1;
                wasted[party] += d.votes[party] - threshold;
            } else {
                // Losers waste all their votes
                wasted[party] += d.votes[party];
            }
        }
    }

    if (totalVotes === 0 || numActiveDistricts < 2) return null;
    return {
        red: wasted.red / totalVotes,
        blue: wasted.blue / totalVotes,
        yellow: wasted.yellow / totalVotes,
    };
}

export function calculatePartisanSymmetry() {
    const activeDistricts = [];
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) activeDistricts.push(d);
    }
    if (activeDistricts.length < 2) return null;

    const parties = ['red', 'blue', 'yellow'];
    const actualSeats = { red: 0, blue: 0, yellow: 0 };
    for (const d of activeDistricts) {
        if (d.winner !== 'none') actualSeats[d.winner]++;
    }

    let totalDeviation = 0;
    let pairCount = 0;

    // For each pair of parties, swap their vote shares and recount
    for (let a = 0; a < parties.length; a++) {
        for (let b = a + 1; b < parties.length; b++) {
            const pA = parties[a], pB = parties[b];
            const swappedSeats = { red: 0, blue: 0, yellow: 0 };

            for (const d of activeDistricts) {
                const swapped = { ...d.votes };
                // Swap the two parties' votes
                const tmp = swapped[pA];
                swapped[pA] = swapped[pB];
                swapped[pB] = tmp;
                // Find winner under swapped scenario
                const max = Math.max(swapped.red, swapped.blue, swapped.yellow);
                const winner = max === swapped.red ? 'red' : max === swapped.blue ? 'blue' : 'yellow';
                swappedSeats[winner]++;
            }

            // Deviation: how much did the seat gap change?
            const actualGap = actualSeats[pA] - actualSeats[pB];
            const swappedGap = swappedSeats[pA] - swappedSeats[pB];
            // In a symmetric map, swapping votes should swap seats proportionally
            // Deviation = |actualGap + swappedGap| (they should be equal and opposite)
            totalDeviation += Math.abs(actualGap + swappedGap);
            pairCount++;
        }
    }

    const avgDeviation = totalDeviation / pairCount;
    // Normalize: max possible deviation = 2 * numActiveDistricts
    const maxDev = 2 * activeDistricts.length;
    return Math.max(0, Math.round((1 - avgDeviation / maxDev) * 100));
}

export function calculateCompetitiveDistricts() {
    let competitive = 0;
    let total = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        total++;

        const totalVotes = d.votes.red + d.votes.blue + d.votes.yellow;
        if (totalVotes === 0) continue;

        const sorted = [d.votes.red, d.votes.blue, d.votes.yellow].sort((a, b) => b - a);
        const margin = (sorted[0] - sorted[1]) / totalVotes;
        if (margin < 0.1) competitive++;
    }

    return { competitive, total };
}

export function calculateRequiredMMD() {
    let totalPop = 0, totalMinority = 0;

    state.hexes.forEach(hex => {
        totalPop += hex.population;
        if (hex.minority) totalMinority += hex.population;
    });

    if (totalPop === 0) return 0;
    const minorityShare = totalMinority / totalPop;
    if (minorityShare < 0.15) return 0;
    return Math.max(1, Math.floor(minorityShare * CONFIG.numDistricts));
}

export function votePcts(votes) {
    const total = votes.red + votes.blue + votes.yellow;
    if (total === 0) return { red: 0, blue: 0, yellow: 0 };
    return { red: votes.red / total * 100, blue: votes.blue / total * 100, yellow: votes.yellow / total * 100 };
}
