// ─── Auto-Districting Algorithms ───
import { CONFIG, HEX_DIRS } from './config.js';
import { state } from './state.js';

// ─── Pack & Crack Gerrymander ───
// Maximizes seats for targetParty by packing opponents into few districts
// and spreading supporters thinly across the rest.
export function packAndCrack(targetParty) {
    // Clear all assignments
    state.hexes.forEach(hex => { hex.district = 0; });

    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    if (hexList.length === 0) return;
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const targetPopPerDistrict = totalPop / CONFIG.numDistricts;
    const popCap = targetPopPerDistrict * CONFIG.popCapRatio;

    // Sort hexes by opposition vote share (highest opposition first)
    const oppShare = (h) => {
        const total = h.votes.red + h.votes.blue + h.votes.yellow;
        return total > 0 ? 1 - h.votes[targetParty] / total : 0.5;
    };

    // Pack phase: fill ~2 districts with highest-opposition hexes
    const packCount = Math.max(1, Math.min(3, Math.floor(CONFIG.numDistricts * 0.25)));

    for (let d = 1; d <= packCount; d++) {
        const unassigned = hexList.filter(h => h.district === 0);
        if (unassigned.length === 0) break;

        // Seed from hex with highest opposition
        unassigned.sort((a, b) => oppShare(b) - oppShare(a));
        const seed = unassigned[0];

        let pop = 0;
        const visited = new Set();
        const queue = [seed];

        while (queue.length > 0 && pop < popCap) {
            // Sort queue to prefer high-opposition hexes
            queue.sort((a, b) => oppShare(b) - oppShare(a));
            const hex = queue.shift();
            const key = hex.q + ',' + hex.r;

            if (visited.has(key) || hex.district !== 0) continue;
            if (pop + hex.population > popCap && pop > 0) continue;

            visited.add(key);
            hex.district = d;
            pop += hex.population;

            // Add unassigned neighbors
            for (const dir of HEX_DIRS) {
                const nk = (hex.q + dir.dq) + ',' + (hex.r + dir.dr);
                const nh = state.hexes.get(nk);
                if (nh && nh.district === 0 && !visited.has(nk)) {
                    queue.push(nh);
                }
            }
        }
    }

    // Crack phase: distribute remaining hexes into remaining districts
    // favoring target party supporters in each
    for (let d = packCount + 1; d <= CONFIG.numDistricts; d++) {
        const remaining = hexList.filter(h => h.district === 0);
        if (remaining.length === 0) break;

        // Seed from hex with highest target-party share
        const partyShare = (h) => {
            const total = h.votes.red + h.votes.blue + h.votes.yellow;
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

    // Assign any remaining unassigned hexes to nearest district
    _assignOrphans(hexList);
}

// ─── Fair Draw (Simulated Annealing) ───
// Minimizes |vote_share - seat_share| with compactness and population equality bonuses.
export function fairDraw() {
    // Start with a greedy initial assignment (compact BFS seeds)
    _greedySeed();

    const parties = ['red', 'blue', 'yellow'];
    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const targetPop = totalPop / CONFIG.numDistricts;

    // Precompute total votes
    const totalVotes = { red: 0, blue: 0, yellow: 0 };
    for (const h of hexList) {
        totalVotes.red += h.votes.red;
        totalVotes.blue += h.votes.blue;
        totalVotes.yellow += h.votes.yellow;
    }
    const totalVotesAll = totalVotes.red + totalVotes.blue + totalVotes.yellow;

    // Objective: lower is better
    function objective() {
        // Compute seats and population per district
        const distPop = new Float64Array(CONFIG.numDistricts + 1);
        const distVotes = Array.from({ length: CONFIG.numDistricts + 1 }, () => ({ red: 0, blue: 0, yellow: 0 }));

        for (const h of hexList) {
            if (h.district < 1) continue;
            distPop[h.district] += h.population;
            distVotes[h.district].red += h.votes.red;
            distVotes[h.district].blue += h.votes.blue;
            distVotes[h.district].yellow += h.votes.yellow;
        }

        const seats = { red: 0, blue: 0, yellow: 0 };
        let maxDeviation = 0;
        let compactnessSum = 0;
        let activeDistricts = 0;

        for (let i = 1; i <= CONFIG.numDistricts; i++) {
            if (distPop[i] === 0) continue;
            activeDistricts++;

            // Winner
            const v = distVotes[i];
            const max = Math.max(v.red, v.blue, v.yellow);
            if (max === v.red) seats.red++;
            else if (max === v.blue) seats.blue++;
            else seats.yellow++;

            // Population deviation
            const dev = Math.abs(distPop[i] - targetPop) / targetPop;
            if (dev > maxDeviation) maxDeviation = dev;

            // Simple compactness (count border hexes ratio)
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

        const totalSeats = seats.red + seats.blue + seats.yellow;
        if (totalSeats === 0) return 1e6;

        // Proportionality error
        let propError = 0;
        for (const p of parties) {
            propError += Math.abs(totalVotes[p] / totalVotesAll - seats[p] / totalSeats);
        }

        const compactness = activeDistricts > 0 ? compactnessSum / activeDistricts : 0;
        return propError - 0.3 * compactness - 0.3 * (1 - maxDeviation);
    }

    // Build border hex list (hexes adjacent to different district)
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

    // Simulated annealing
    let currentObj = objective();
    const iterations = 3000;
    const T0 = 1.0, Tf = 0.01;

    for (let i = 0; i < iterations; i++) {
        const T = T0 * Math.pow(Tf / T0, i / iterations);
        const borders = getBorderHexes();
        if (borders.length === 0) break;

        // Pick random border hex
        const hex = borders[Math.floor(Math.random() * borders.length)];
        const oldDistrict = hex.district;

        // Find adjacent district to swap to
        const adjDistricts = new Set();
        for (const dir of HEX_DIRS) {
            const nh = state.hexes.get((hex.q + dir.dq) + ',' + (hex.r + dir.dr));
            if (nh && nh.district > 0 && nh.district !== oldDistrict) {
                adjDistricts.add(nh.district);
            }
        }
        if (adjDistricts.size === 0) continue;
        const newDistrict = [...adjDistricts][Math.floor(Math.random() * adjDistricts.size)];

        // Try swap
        hex.district = newDistrict;

        // Quick contiguity check: would removing this hex disconnect old district?
        if (!_quickContiguityCheck(hex, oldDistrict)) {
            hex.district = oldDistrict;
            continue;
        }

        const newObj = objective();
        const delta = newObj - currentObj;

        if (delta < 0 || Math.random() < Math.exp(-delta / T)) {
            currentObj = newObj;
        } else {
            hex.district = oldDistrict; // revert
        }
    }
}

// ─── Helpers ───

// Quick BFS contiguity check: verify district dId is still connected
// after removing hex `removed` from it
function _quickContiguityCheck(removed, dId) {
    // Find a hex still in dId
    let seed = null;
    let count = 0;
    for (const [, h] of state.hexes) {
        if (h.district === dId && h !== removed) {
            if (!seed) seed = h;
            count++;
        }
    }
    if (count === 0) return true; // empty district is fine
    if (!seed) return true;

    // BFS from seed
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

// Greedy BFS seeding for initial fair assignment
function _greedySeed() {
    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const popCap = (totalPop / CONFIG.numDistricts) * CONFIG.popCapRatio;

    // Clear all
    state.hexes.forEach(hex => { hex.district = 0; });

    // Place seed hexes spread across the map
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

// Pick N seed hexes spread across the map using farthest-point sampling
function _spreadSeeds(hexList, n) {
    if (hexList.length === 0) return [];
    const seeds = [hexList[0]];

    for (let i = 1; i < n && i < hexList.length; i++) {
        let bestHex = null, bestDist = -1;
        for (const h of hexList) {
            if (seeds.includes(h)) continue;
            let minDist = Infinity;
            for (const s of seeds) {
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

// Assign orphan (unassigned) hexes to nearest adjacent district
function _assignOrphans(hexList) {
    let changed = true;
    while (changed) {
        changed = false;
        for (const h of hexList) {
            if (h.district !== 0) continue;
            // Find adjacent assigned district
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
