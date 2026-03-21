// Fairness metrics: efficiency gap, partisan symmetry, competitive districts,
// compactness (Polsby-Popper), contiguity (BFS), required majority-minority count.
import { CONFIG, HEX_DIRS } from './config.js';
import { state } from './state.js';

/** Recomputes all per-district stats from current hex assignments. */
export function calculateMetrics() {
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = {
            id: i, population: 0, votes: { orange: 0, lime: 0, purple: 0 },
            hexes: [], minorityPop: 0, isContiguous: false, compactness: 0,
            winner: 'none', isMinorityMajority: false
        };
    }
    state.hexes.forEach(hex => {
        const d = state.districts[hex.district];
        if (d) {
            d.population += hex.population;
            d.votes.orange += hex.votes.orange;
            d.votes.lime += hex.votes.lime;
            d.votes.purple += hex.votes.purple;
            if (hex.minority) d.minorityPop += hex.population;
            d.hexes.push(hex);
        }
    });
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            const { orange, lime, purple } = d.votes;
            const max = Math.max(orange, lime, purple);
            d.winner = max === orange ? 'orange' : max === lime ? 'lime' : 'purple';
            d.isMinorityMajority = (d.minorityPop / d.population) > 0.5;
            d.isContiguous = checkContiguity(d);
            d.compactness = calculateCompactness(d);
        }
    }
}

/**
 * BFS from the first hex in the district; connected if the BFS reaches
 * every hex. O(n) where n = hexes in district.
 */
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

/**
 * Polsby-Popper compactness: 4*pi*A / P^2, where A = hex count * hex area,
 * P = boundary edge count * hexSize. A perfect circle scores 100%.
 * Clamped at 100 to handle floating-point edge cases.
 */
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
    // Flat-top hex area = 3*sqrt(3)/2 * s^2 = 1.5 * sqrt(3) * s^2.
    const area = d.hexes.length * 1.5 * Math.sqrt(3) * s * s;
    const perim = perimeter * s;
    return Math.min(100, Math.round(4 * Math.PI * area / (perim * perim) * 100));
}

/**
 * All-party efficiency gap using plurality wasted votes.
 *   - Winner's wasted votes = votes above (second-place + 1).
 *   - Each loser's wasted votes = all their votes.
 *
 * Returns per-party wasted-vote ratios, or null if < 2 active districts.
 */
export function calculateEfficiencyGap() {
    const wasted = { orange: 0, lime: 0, purple: 0 };
    let totalVotes = 0;
    let numActiveDistricts = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        numActiveDistricts++;

        const { orange, lime, purple } = d.votes;
        const districtTotal = orange + lime + purple;
        if (districtTotal === 0) continue;

        totalVotes += districtTotal;
        const max = Math.max(orange, lime, purple);
        const winner = max === orange ? 'orange' : max === lime ? 'lime' : 'purple';

        for (const party of ['orange', 'lime', 'purple']) {
            if (party === winner) {
                // Plurality threshold = second-place votes + 1.
                const others = [orange, lime, purple].filter((_, j) => ['orange', 'lime', 'purple'][j] !== party);
                const threshold = Math.max(...others) + 1;
                wasted[party] += d.votes[party] - threshold;
            } else {
                wasted[party] += d.votes[party];
            }
        }
    }

    if (totalVotes === 0 || numActiveDistricts < 2) return null;
    return {
        orange: wasted.orange / totalVotes,
        lime: wasted.lime / totalVotes,
        purple: wasted.purple / totalVotes,
    };
}

/**
 * Partisan symmetry: for each pair of parties, swap their vote shares
 * district-by-district and recount seats. In a fair map the seat gap
 * should reverse; deviation from that indicates structural bias.
 *
 * Score = 100% (perfectly symmetric) down to 0%.
 * Normalized by max possible deviation (2 * numActiveDistricts).
 */
export function calculatePartisanSymmetry() {
    const activeDistricts = [];
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) activeDistricts.push(d);
    }
    if (activeDistricts.length < 2) return null;

    const parties = ['orange', 'lime', 'purple'];
    const actualSeats = { orange: 0, lime: 0, purple: 0 };
    for (const d of activeDistricts) {
        if (d.winner !== 'none') actualSeats[d.winner]++;
    }

    let totalDeviation = 0;
    let pairCount = 0;

    for (let a = 0; a < parties.length; a++) {
        for (let b = a + 1; b < parties.length; b++) {
            const pA = parties[a], pB = parties[b];
            const swappedSeats = { orange: 0, lime: 0, purple: 0 };

            for (const d of activeDistricts) {
                const swapped = { ...d.votes };
                const tmp = swapped[pA];
                swapped[pA] = swapped[pB];
                swapped[pB] = tmp;
                const max = Math.max(swapped.orange, swapped.lime, swapped.purple);
                const winner = max === swapped.orange ? 'orange' : max === swapped.lime ? 'lime' : 'purple';
                swappedSeats[winner]++;
            }

            // A symmetric map would have actualGap + swappedGap = 0.
            const actualGap = actualSeats[pA] - actualSeats[pB];
            const swappedGap = swappedSeats[pA] - swappedSeats[pB];
            totalDeviation += Math.abs(actualGap + swappedGap);
            pairCount++;
        }
    }

    const avgDeviation = totalDeviation / pairCount;
    const maxDev = 2 * activeDistricts.length;
    return Math.max(0, Math.round((1 - avgDeviation / maxDev) * 100));
}

/**
 * Counts districts where winner's margin over runner-up is < 10%.
 * Competitive districts indicate responsive representation.
 */
export function calculateCompetitiveDistricts() {
    let competitive = 0;
    let total = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        total++;

        const totalVotes = d.votes.orange + d.votes.lime + d.votes.purple;
        if (totalVotes === 0) continue;

        const sorted = [d.votes.orange, d.votes.lime, d.votes.purple].sort((a, b) => b - a);
        const margin = (sorted[0] - sorted[1]) / totalVotes;
        if (margin < 0.1) competitive++;
    }

    return { competitive, total };
}

/**
 * VRA-inspired requirement: floor(minorityShare * numDistricts), minimum 1
 * if minority share > 15%, else 0.
 */
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

/** Returns vote shares as raw percentages (0-100). Callers round as needed. */
export function votePcts(votes) {
    const total = votes.orange + votes.lime + votes.purple;
    if (total === 0) return { orange: 0, lime: 0, purple: 0 };
    return { orange: votes.orange / total * 100, lime: votes.lime / total * 100, purple: votes.purple / total * 100 };
}
