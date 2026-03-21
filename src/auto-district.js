// Auto-districting: pack-and-crack gerrymander and fair-draw simulated annealing.
import { CONFIG, HEX_DIRS } from './config.js';
import { state } from './state.js';

// ─── Pack & Crack Gerrymander ───

/**
 * Maximizes seats for `targetParty` using the classic pack-and-crack strategy:
 *   1. **Pack** ~25% of districts with the densest opposition concentrations
 *      (wastes opponent votes by huge margins in few districts).
 *   2. **Crack** remaining districts seeded from strongest target-party areas
 *      (spreads supporters into thin but consistent majorities).
 *   3. Orphan pass assigns any leftover hexes to adjacent districts.
 *
 * BFS growth with a priority queue sorted by opposition/party share keeps
 * districts contiguous and geographically compact.
 *
 * @param {'orange'|'lime'|'purple'} targetParty
 */
export function packAndCrack(targetParty) {
    state.hexes.forEach(hex => { hex.district = 0; });

    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    if (hexList.length === 0) return;
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const targetPopPerDistrict = totalPop / CONFIG.numDistricts;
    const popCap = targetPopPerDistrict * CONFIG.popCapRatio;

    const oppShare = (h) => {
        const total = h.votes.orange + h.votes.lime + h.votes.purple;
        return total > 0 ? 1 - h.votes[targetParty] / total : 0.5;
    };

    // Pack 1-3 districts (floor of 25%) to absorb the most opposition-heavy hexes.
    const packCount = Math.max(1, Math.min(3, Math.floor(CONFIG.numDistricts * 0.25)));

    for (let d = 1; d <= packCount; d++) {
        const unassigned = hexList.filter(h => h.district === 0);
        if (unassigned.length === 0) break;

        // Seed from the hex with highest opposition share.
        unassigned.sort((a, b) => oppShare(b) - oppShare(a));
        const seed = unassigned[0];

        let pop = 0;
        const visited = new Set();
        const queue = [seed];

        while (queue.length > 0 && pop < popCap) {
            // Priority: prefer highest-opposition neighbors to pack efficiently.
            queue.sort((a, b) => oppShare(b) - oppShare(a));
            const hex = queue.shift();
            const key = hex.q + ',' + hex.r;

            if (visited.has(key) || hex.district !== 0) continue;
            if (pop + hex.population > popCap && pop > 0) continue;

            visited.add(key);
            hex.district = d;
            pop += hex.population;

            for (const dir of HEX_DIRS) {
                const nk = (hex.q + dir.dq) + ',' + (hex.r + dir.dr);
                const nh = state.hexes.get(nk);
                if (nh && nh.district === 0 && !visited.has(nk)) {
                    queue.push(nh);
                }
            }
        }
    }

    // Crack: fill remaining districts seeded from strongest target-party areas.
    for (let d = packCount + 1; d <= CONFIG.numDistricts; d++) {
        const remaining = hexList.filter(h => h.district === 0);
        if (remaining.length === 0) break;

        const partyShare = (h) => {
            const total = h.votes.orange + h.votes.lime + h.votes.purple;
            return total > 0 ? h.votes[targetParty] / total : 0;
        };
        remaining.sort((a, b) => partyShare(b) - partyShare(a));
        const seed = remaining[0];

        let pop = 0;
        const visited = new Set();
        const queue = [seed];

        while (queue.length > 0 && pop < popCap) {
            const hex = queue.shift();
            const key = hex.q + ',' + hex.r;

            if (visited.has(key) || hex.district !== 0) continue;
            if (pop + hex.population > popCap && pop > 0) continue;

            visited.add(key);
            hex.district = d;
            pop += hex.population;

            for (const dir of HEX_DIRS) {
                const nk = (hex.q + dir.dq) + ',' + (hex.r + dir.dr);
                const nh = state.hexes.get(nk);
                if (nh && nh.district === 0 && !visited.has(nk)) {
                    queue.push(nh);
                }
            }
        }
    }

    _assignOrphans(hexList);
}

// ─── Fair Draw (Simulated Annealing) ───

/**
 * Draws districts that minimize vote-seat disproportionality.
 *
 * **Objective function** (lower is better):
 *   propError - 0.3 * compactness - 0.3 * (1 - maxDeviation)
 *   where propError = sum |voteShare_p - seatShare_p| over all parties,
 *   compactness = avg(interior / total) per district,
 *   maxDeviation = worst single district's |pop - target| / target.
 *
 * **Temperature schedule**: geometric cooling T = T0 * (Tf/T0)^(i/N),
 *   T0 = 1.0, Tf = 0.01, N = 3000 iterations.
 *
 * **Neighbor generation**: pick a random border hex, swap it to a random
 *   adjacent district. Reject if it breaks contiguity (fast BFS check).
 *
 * **Convergence**: Metropolis criterion -- accept improving moves always,
 *   accept worsening moves with probability exp(-delta/T).
 *
 * Uses Math.random() intentionally -- non-deterministic by design.
 */
export function fairDraw() {
    _greedySeed();

    const parties = ['orange', 'lime', 'purple'];
    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const targetPop = totalPop / CONFIG.numDistricts;

    const totalVotes = { orange: 0, lime: 0, purple: 0 };
    for (const h of hexList) {
        totalVotes.orange += h.votes.orange;
        totalVotes.lime += h.votes.lime;
        totalVotes.purple += h.votes.purple;
    }
    const totalVotesAll = totalVotes.orange + totalVotes.lime + totalVotes.purple;

    function objective() {
        const distPop = new Float64Array(CONFIG.numDistricts + 1);
        const distVotes = Array.from({ length: CONFIG.numDistricts + 1 }, () => ({ orange: 0, lime: 0, purple: 0 }));

        for (const h of hexList) {
            if (h.district < 1) continue;
            distPop[h.district] += h.population;
            distVotes[h.district].orange += h.votes.orange;
            distVotes[h.district].lime += h.votes.lime;
            distVotes[h.district].purple += h.votes.purple;
        }

        const seats = { orange: 0, lime: 0, purple: 0 };
        let maxDeviation = 0;
        let compactnessSum = 0;
        let activeDistricts = 0;

        for (let i = 1; i <= CONFIG.numDistricts; i++) {
            if (distPop[i] === 0) continue;
            activeDistricts++;

            const v = distVotes[i];
            const max = Math.max(v.orange, v.lime, v.purple);
            if (max === v.orange) seats.orange++;
            else if (max === v.lime) seats.lime++;
            else seats.purple++;

            const dev = Math.abs(distPop[i] - targetPop) / targetPop;
            if (dev > maxDeviation) maxDeviation = dev;

            // Rough compactness: interior-to-total hex ratio (avoids costly Polsby-Popper).
            let border = 0, interior = 0;
            for (const h of hexList) {
                if (h.district !== i) continue;
                let isBorder = false;
                for (const dir of HEX_DIRS) {
                    const nh = state.hexes.get((h.q + dir.dq) + ',' + (h.r + dir.dr));
                    if (!nh || nh.district !== i) { isBorder = true; break; }
                }
                if (isBorder) border++; else interior++;
            }
            compactnessSum += interior / (border + interior + 1);
        }

        const totalSeats = seats.orange + seats.lime + seats.purple;
        if (totalSeats === 0) return 1e6;

        // Sum of |voteShare - seatShare| per party.
        let propError = 0;
        for (const p of parties) {
            propError += Math.abs(totalVotes[p] / totalVotesAll - seats[p] / totalSeats);
        }

        const compactness = activeDistricts > 0 ? compactnessSum / activeDistricts : 0;
        return propError - 0.3 * compactness - 0.3 * (1 - maxDeviation);
    }

    /** Returns hexes that border a different district -- the only candidates for swaps. */
    function getBorderHexes() {
        const borders = [];
        for (const h of hexList) {
            if (h.district < 1) continue;
            for (const dir of HEX_DIRS) {
                const nh = state.hexes.get((h.q + dir.dq) + ',' + (h.r + dir.dr));
                if (nh && nh.district > 0 && nh.district !== h.district) {
                    borders.push(h);
                    break;
                }
            }
        }
        return borders;
    }

    // Simulated annealing loop.
    let currentObj = objective();
    const iterations = 3000;
    const T0 = 1.0, Tf = 0.01;

    for (let i = 0; i < iterations; i++) {
        // Geometric cooling schedule.
        const T = T0 * Math.pow(Tf / T0, i / iterations);
        const borders = getBorderHexes();
        if (borders.length === 0) break;

        const hex = borders[Math.floor(Math.random() * borders.length)];
        const oldDistrict = hex.district;

        // Collect neighboring districts as swap targets.
        const adjDistricts = new Set();
        for (const dir of HEX_DIRS) {
            const nh = state.hexes.get((hex.q + dir.dq) + ',' + (hex.r + dir.dr));
            if (nh && nh.district > 0 && nh.district !== oldDistrict) {
                adjDistricts.add(nh.district);
            }
        }
        if (adjDistricts.size === 0) continue;
        const newDistrict = [...adjDistricts][Math.floor(Math.random() * adjDistricts.size)];

        hex.district = newDistrict;

        // Reject if swap disconnects the old district.
        if (!_quickContiguityCheck(hex, oldDistrict)) {
            hex.district = oldDistrict;
            continue;
        }

        const newObj = objective();
        const delta = newObj - currentObj;

        // Metropolis acceptance criterion.
        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
            currentObj = newObj;
        } else {
            hex.district = oldDistrict;
        }
    }
}

// ─── Helpers ───

/**
 * Fast BFS check: is district `dId` still contiguous after `removed` left it?
 * Counts all hexes in dId (excluding removed), BFS from any seed, compare.
 */
function _quickContiguityCheck(removed, dId) {
    let seed = null;
    let count = 0;
    for (const [, h] of state.hexes) {
        if (h.district === dId && h !== removed) {
            if (!seed) seed = h;
            count++;
        }
    }
    if (count === 0) return true;
    if (!seed) return true;

    const visited = new Set([seed.q + ',' + seed.r]);
    const queue = [seed];
    let head = 0;
    while (head < queue.length) {
        const curr = queue[head++];
        for (const dir of HEX_DIRS) {
            const nk = (curr.q + dir.dq) + ',' + (curr.r + dir.dr);
            if (visited.has(nk)) continue;
            const nh = state.hexes.get(nk);
            if (nh && nh.district === dId && nh !== removed) {
                visited.add(nk);
                queue.push(nh);
            }
        }
    }
    return visited.size === count;
}

/** BFS-based initial assignment for fair draw. Seeds spread via farthest-point sampling. */
function _greedySeed() {
    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const popCap = (totalPop / CONFIG.numDistricts) * CONFIG.popCapRatio;

    state.hexes.forEach(hex => { hex.district = 0; });

    const seeds = _spreadSeeds(hexList, CONFIG.numDistricts);

    for (let d = 1; d <= CONFIG.numDistricts; d++) {
        const seed = seeds[d - 1];
        if (!seed || seed.district !== 0) continue;

        let pop = 0;
        const visited = new Set();
        const queue = [seed];

        while (queue.length > 0 && pop < popCap) {
            const hex = queue.shift();
            const key = hex.q + ',' + hex.r;
            if (visited.has(key) || hex.district !== 0) continue;
            if (pop + hex.population > popCap && pop > 0) continue;

            visited.add(key);
            hex.district = d;
            pop += hex.population;

            for (const dir of HEX_DIRS) {
                const nk = (hex.q + dir.dq) + ',' + (hex.r + dir.dr);
                const nh = state.hexes.get(nk);
                if (nh && nh.district === 0 && !visited.has(nk)) {
                    queue.push(nh);
                }
            }
        }
    }

    _assignOrphans(hexList);
}

/**
 * Farthest-point sampling: pick N seed hexes maximizing minimum inter-seed
 * distance (cube/axial Manhattan). Produces well-spread initial centers.
 */
function _spreadSeeds(hexList, n) {
    if (hexList.length === 0) return [];
    const seeds = [hexList[0]];

    for (let i = 1; i < n && i < hexList.length; i++) {
        let bestHex = null, bestDist = -1;
        for (const h of hexList) {
            if (seeds.includes(h)) continue;
            let minDist = Infinity;
            for (const s of seeds) {
                // Cube-coordinate Manhattan distance.
                const d = Math.abs(h.q - s.q) + Math.abs(h.r - s.r) + Math.abs(h.q + h.r - s.q - s.r);
                if (d < minDist) minDist = d;
            }
            if (minDist > bestDist) {
                bestDist = minDist;
                bestHex = h;
            }
        }
        if (bestHex) seeds.push(bestHex);
    }
    return seeds;
}

/** Iteratively assigns orphan hexes (district 0) to any adjacent assigned district. */
function _assignOrphans(hexList) {
    let changed = true;
    while (changed) {
        changed = false;
        for (const h of hexList) {
            if (h.district !== 0) continue;
            for (const dir of HEX_DIRS) {
                const nh = state.hexes.get((h.q + dir.dq) + ',' + (h.r + dir.dr));
                if (nh && nh.district > 0) {
                    h.district = nh.district;
                    changed = true;
                    break;
                }
            }
        }
    }
}
