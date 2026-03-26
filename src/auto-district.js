// Auto-districting: pack-and-crack gerrymander and fair-draw simulated annealing.
import { CONFIG, HEX_DIRS } from './config.js';
import { state } from './state.js';

// ─── Pack & Crack Gerrymander ───

/**
 * Maximizes seats for `targetParty` using the classic pack-and-crack strategy:
 *   1. **Pack** ~25% of districts with the densest opposition concentrations
 *      (wastes opponent votes by huge margins in few districts).
 *   2. **Crack** remaining districts via simultaneous round-robin BFS seeded
 *      from strongest target-party areas (spreads supporters into thin but
 *      consistent majorities across many districts).
 *   3. Orphan pass assigns any leftover hexes to adjacent districts.
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

    // Pack 1-2 districts (floor of 25%) to absorb the most opposition-heavy hexes.
    const packCount = Math.max(1, Math.min(3, Math.floor(CONFIG.numDistricts * 0.25)));

    for (let d = 1; d <= packCount; d++) {
        const unassigned = hexList.filter(h => h.district === 0);
        if (unassigned.length === 0) break;

        unassigned.sort((a, b) => oppShare(b) - oppShare(a));
        const seed = unassigned[0];

        let pop = 0;
        const visited = new Set();
        const queue = [seed];

        while (queue.length > 0 && pop < popCap) {
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

    // Crack: simultaneous round-robin BFS from strongest target-party seeds.
    const crackStart = packCount + 1;
    const crackCount = CONFIG.numDistricts - packCount;
    const partyShare = (h) => {
        const total = h.votes.orange + h.votes.lime + h.votes.purple;
        return total > 0 ? h.votes[targetParty] / total : 0;
    };

    // Seed crack districts via farthest-point sampling among unassigned hexes,
    // biased toward high target-party share.
    const remaining = hexList.filter(h => h.district === 0);
    remaining.sort((a, b) => partyShare(b) - partyShare(a));
    const crackSeeds = _spreadSeeds(remaining, crackCount);

    const queues = [];
    const pops = [];
    for (let i = 0; i < crackCount; i++) {
        const d = crackStart + i;
        const seed = crackSeeds[i];
        if (seed && seed.district === 0) {
            seed.district = d;
            pops.push(seed.population);
            queues.push(_getNeighbors(seed));
        } else {
            pops.push(0);
            queues.push([]);
        }
    }

    // Round-robin: each district grows one hex per round until all are at cap.
    let active = true;
    while (active) {
        active = false;
        for (let i = 0; i < crackCount; i++) {
            if (pops[i] >= popCap || queues[i].length === 0) continue;
            const d = crackStart + i;

            // Find the best unassigned neighbor.
            let added = false;
            while (queues[i].length > 0) {
                const hex = queues[i].shift();
                if (hex.district !== 0) continue;
                if (pops[i] + hex.population > popCap && pops[i] > 0) continue;

                hex.district = d;
                pops[i] += hex.population;
                added = true;

                for (const nh of _getNeighbors(hex)) {
                    if (nh.district === 0) queues[i].push(nh);
                }
                break;
            }
            if (added) active = true;
        }
    }

    _assignOrphans(hexList);
    _mergeSmallDistricts(hexList, targetPopPerDistrict);
}

// ─── Fair Draw (Lloyd's Voronoi Relaxation + Annealing) ───

/**
 * Draws compact, population-balanced districts via Lloyd's Voronoi relaxation:
 *   1. Place seeds via farthest-point sampling.
 *   2. Assign hexes to nearest seed using distance-priority BFS. Distance is
 *      softly weighted by the district's current population so over-populated
 *      districts appear farther away, naturally balancing sizes without a hard
 *      cap that creates orphan-assignment artifacts.
 *   3. Move seeds to population-weighted centroids.
 *   4. Repeat 2-3 for 15 iterations (convergence to compact shapes).
 *
 * No annealing phase -- compactness and balance are the goals of a fair draw.
 */
export function fairDraw() {
    const hexList = [...state.hexes.values()].filter(h => h.population > 0);
    if (hexList.length === 0) return;
    const totalPop = hexList.reduce((s, h) => s + h.population, 0);
    const targetPop = totalPop / CONFIG.numDistricts;

    let seeds = _spreadSeeds(hexList, CONFIG.numDistricts);

    for (let iter = 0; iter < 15; iter++) {
        _voronoiAssign(seeds, hexList, targetPop);

        // Move seeds to population-weighted centroids.
        const newSeeds = [];
        for (let d = 1; d <= CONFIG.numDistricts; d++) {
            let wq = 0, wr = 0, totalW = 0;
            for (const h of hexList) {
                if (h.district !== d) continue;
                wq += h.q * h.population;
                wr += h.r * h.population;
                totalW += h.population;
            }
            if (totalW === 0) { newSeeds.push(seeds[d - 1]); continue; }
            const cq = wq / totalW, cr = wr / totalW;
            let best = null, bestD = Infinity;
            for (const h of hexList) {
                if (h.district !== d) continue;
                const dd = (h.q - cq) ** 2 + (h.r - cr) ** 2;
                if (dd < bestD) { bestD = dd; best = h; }
            }
            newSeeds.push(best || seeds[d - 1]);
        }
        seeds = newSeeds;
    }
    // Final assignment with converged seeds.
    _voronoiAssign(seeds, hexList, targetPop);
}

// ─── Helpers ───

/**
 * Post-processing: any district below 30% of target population is dissolved
 * and its hexes redistributed, then the empty district ID is re-grown by
 * splitting the most over-populated district.
 */
function _mergeSmallDistricts(hexList, targetPop) {
    const minPop = targetPop * 0.3;
    const popCap = targetPop * CONFIG.popCapRatio;

    for (let pass = 0; pass < CONFIG.numDistricts; pass++) {
        // Compute district populations.
        const distPop = new Float64Array(CONFIG.numDistricts + 1);
        for (const h of hexList) {
            if (h.district > 0) distPop[h.district] += h.population;
        }

        // Find the smallest district that's below threshold.
        let smallId = 0, smallPop = Infinity;
        for (let d = 1; d <= CONFIG.numDistricts; d++) {
            if (distPop[d] > 0 && distPop[d] < minPop && distPop[d] < smallPop) {
                smallPop = distPop[d];
                smallId = d;
            }
        }
        if (smallId === 0) break; // All districts are large enough.

        // Dissolve the small district.
        for (const h of hexList) {
            if (h.district === smallId) h.district = 0;
        }

        // Redistribute dissolved hexes to neighbors.
        _assignOrphans(hexList);

        // Find the largest district and split it to fill the empty ID.
        const distPop2 = new Float64Array(CONFIG.numDistricts + 1);
        for (const h of hexList) {
            if (h.district > 0) distPop2[h.district] += h.population;
        }
        let largestId = 0, largestPop = 0;
        for (let d = 1; d <= CONFIG.numDistricts; d++) {
            if (distPop2[d] > largestPop) { largestPop = distPop2[d]; largestId = d; }
        }
        if (largestId === 0) break;

        // Seed the empty district from the border hex of the largest district
        // that is farthest from its centroid.
        let cq = 0, cr = 0, cnt = 0;
        for (const h of hexList) {
            if (h.district === largestId) { cq += h.q; cr += h.r; cnt++; }
        }
        if (cnt === 0) break;
        cq /= cnt; cr /= cnt;

        let bestHex = null, bestDist = -1;
        for (const h of hexList) {
            if (h.district !== largestId) continue;
            // Must be on the border of this district.
            let onBorder = false;
            for (const dir of HEX_DIRS) {
                const nh = state.hexes.get((h.q + dir.dq) + ',' + (h.r + dir.dr));
                if (!nh || nh.district !== largestId) { onBorder = true; break; }
            }
            if (!onBorder) continue;
            const d = (h.q - cq) ** 2 + (h.r - cr) ** 2;
            if (d > bestDist) { bestDist = d; bestHex = h; }
        }
        if (!bestHex) break;

        // BFS-grow the new district from that border hex, taking from the largest.
        bestHex.district = smallId;
        let newPop = bestHex.population;
        const splitTarget = largestPop / 2;
        const queue = _getNeighbors(bestHex).filter(h => h.district === largestId);

        while (queue.length > 0 && newPop < splitTarget && newPop < popCap) {
            const hex = queue.shift();
            if (hex.district !== largestId) continue;

            // Don't break contiguity of the source district.
            hex.district = smallId;
            if (!_quickContiguityCheck(hex, largestId)) {
                hex.district = largestId;
                continue;
            }

            newPop += hex.population;
            for (const nh of _getNeighbors(hex)) {
                if (nh.district === largestId) queue.push(nh);
            }
        }
    }
}

/** Returns hex neighbors that exist on the map. */
function _getNeighbors(hex) {
    const neighbors = [];
    for (const dir of HEX_DIRS) {
        const nh = state.hexes.get((hex.q + dir.dq) + ',' + (hex.r + dir.dr));
        if (nh) neighbors.push(nh);
    }
    return neighbors;
}

/**
 * Fast BFS check: is district `dId` still contiguous after `removed` left it?
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

/**
 * Distance-priority BFS Voronoi assignment with soft population weighting.
 * Each hex goes to the nearest seed by axial distance, but the effective
 * distance is inflated for districts that are already over target population.
 * This steers hexes toward under-populated districts without the hard cutoff
 * that creates orphan-assignment artifacts.
 *
 * effective_dist = axial_dist_sq + popWeight * max(0, distPop/targetPop - 0.8)^2
 */
function _voronoiAssign(seeds, hexList, targetPop) {
    for (const h of hexList) h.district = 0;

    const pops = new Float64Array(CONFIG.numDistricts + 1);
    const popWeight = 40; // Strength of population-balancing pressure.

    // Global priority queue: [effectiveDist, hex, districtId].
    const queue = [];
    for (let d = 1; d <= CONFIG.numDistricts; d++) {
        const s = seeds[d - 1];
        if (s) queue.push([0, s, d]);
    }
    queue.sort((a, b) => a[0] - b[0]);

    while (queue.length > 0) {
        queue.sort((a, b) => a[0] - b[0]);
        const [, hex, d] = queue.shift();
        if (hex.district !== 0) continue;

        hex.district = d;
        pops[d] += hex.population;

        const seed = seeds[d - 1];
        const popRatio = Math.max(0, pops[d] / targetPop - 0.8);
        const popPenalty = popWeight * popRatio * popRatio;

        for (const nh of _getNeighbors(hex)) {
            if (nh.district === 0) {
                const dq = nh.q - seed.q, dr = nh.r - seed.r;
                const geoDist = dq * dq + dr * dr + dq * dr;
                queue.push([geoDist + popPenalty, nh, d]);
            }
        }
    }

    // Handle any remaining unassigned hexes (rare with soft weighting).
    _assignOrphans(hexList);
}

/**
 * Farthest-point sampling: pick N seed hexes maximizing minimum inter-seed
 * distance (cube/axial Manhattan). Produces well-spread initial centers.
 */
function _spreadSeeds(hexList, n) {
    if (hexList.length === 0) return [];
    // Start from a hex near the centroid for better spread.
    let cx = 0, cy = 0;
    for (const h of hexList) { cx += h.q; cy += h.r; }
    cx /= hexList.length; cy /= hexList.length;
    let bestStart = hexList[0], bestD = Infinity;
    for (const h of hexList) {
        const d = Math.abs(h.q - cx) + Math.abs(h.r - cy);
        if (d < bestD) { bestD = d; bestStart = h; }
    }
    const seeds = [bestStart];

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

/** Iteratively assigns orphan hexes (district 0) to the adjacent district with the lowest population. */
function _assignOrphans(hexList) {
    const distPop = new Float64Array(CONFIG.numDistricts + 1);
    for (const h of hexList) {
        if (h.district > 0) distPop[h.district] += h.population;
    }

    let changed = true;
    while (changed) {
        changed = false;
        for (const h of hexList) {
            if (h.district !== 0) continue;
            let bestDist = 0, bestPop = Infinity;
            for (const dir of HEX_DIRS) {
                const nh = state.hexes.get((h.q + dir.dq) + ',' + (h.r + dir.dr));
                if (nh && nh.district > 0 && distPop[nh.district] < bestPop) {
                    bestPop = distPop[nh.district];
                    bestDist = nh.district;
                }
            }
            if (bestDist > 0) {
                h.district = bestDist;
                distPop[bestDist] += h.population;
                changed = true;
            }
        }
    }
}
