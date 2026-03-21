// Monte Carlo election simulation with Gaussian partisan swing.
import { CONFIG } from './config.js';
import { state } from './state.js';

/** Box-Muller transform: converts uniform [0,1) pairs to normal distribution. */
function gaussRandom(mean, stddev) {
    const u1 = Math.random(), u2 = Math.random();
    return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/**
 * Runs `numElections` simulated elections on the current district map.
 *
 * Each election applies a correlated national swing per party (N(0, sigma))
 * plus per-district local noise (N(0, sigma*0.3)). The two-tier model
 * captures both national mood shifts and local variation. Shares are
 * clamped to 1% minimum and re-normalized to prevent negative/zero values.
 *
 * Uses Math.random() intentionally -- non-deterministic by design.
 *
 * @param {number} numElections
 * @param {number} swingSigma  Standard deviation of national swing (0-1 scale)
 * @returns {{ orange: number[], lime: number[], purple: number[] }} Seat counts per election
 */
export function simulateElections(numElections, swingSigma) {
    const parties = ['orange', 'lime', 'purple'];
    const results = { orange: [], lime: [], purple: [] };

    for (let e = 0; e < numElections; e++) {
        const nationalSwing = {};
        for (const p of parties) nationalSwing[p] = gaussRandom(0, swingSigma);

        const seats = { orange: 0, lime: 0, purple: 0 };

        for (let d = 1; d <= CONFIG.numDistricts; d++) {
            const dist = state.districts[d];
            if (!dist || dist.hexes.length === 0) continue;

            const totalVotes = dist.votes.orange + dist.votes.lime + dist.votes.purple;
            if (totalVotes === 0) continue;

            const swungShares = {};
            let shareSum = 0;
            for (const p of parties) {
                const baseShare = dist.votes[p] / totalVotes;
                const localNoise = gaussRandom(0, swingSigma * 0.3);
                swungShares[p] = Math.max(0.01, baseShare + nationalSwing[p] + localNoise);
                shareSum += swungShares[p];
            }
            for (const p of parties) swungShares[p] /= shareSum;

            let winner = 'orange', maxShare = 0;
            for (const p of parties) {
                if (swungShares[p] > maxShare) { maxShare = swungShares[p]; winner = p; }
            }
            seats[winner]++;
        }

        for (const p of parties) results[p].push(seats[p]);
    }

    return results;
}

/**
 * Renders a grouped bar histogram of election simulation results.
 * X-axis = seat count (0..numDistricts), Y-axis = frequency.
 * One bar group per seat count, one bar per party within each group.
 */
export function renderHistogram(canvas, results, numDistricts) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const parties = ['orange', 'lime', 'purple'];
    const colors = {
        orange: getComputedStyle(document.documentElement).getPropertyValue('--party-orange').trim(),
        lime: getComputedStyle(document.documentElement).getPropertyValue('--party-lime').trim(),
        purple: getComputedStyle(document.documentElement).getPropertyValue('--party-purple').trim(),
    };

    const n = results.orange.length;
    const barGroupW = w / (numDistricts + 1);

    for (const p of parties) {
        const counts = new Array(numDistricts + 1).fill(0);
        for (const s of results[p]) counts[s]++;
        const maxCount = Math.max(...counts, 1);

        const barW = barGroupW / 4;
        const offset = parties.indexOf(p) * barW;

        ctx.fillStyle = colors[p] + 'AA';
        for (let s = 0; s <= numDistricts; s++) {
            const barH = (counts[s] / maxCount) * (h - 30);
            const x = s * barGroupW + offset + 2;
            ctx.fillRect(x, h - 20 - barH, barW - 1, barH);
        }
    }

    // X-axis seat labels.
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    ctx.font = '9px Noto Sans Mono';
    ctx.textAlign = 'center';
    for (let s = 0; s <= numDistricts; s++) {
        ctx.fillText(s, s * barGroupW + barGroupW / 2, h - 4);
    }
    ctx.fillText('Seats \u2192', w / 2, h - 4);

    // Mean seat annotation per party.
    const meanSeats = {};
    for (const p of parties) {
        const sum = results[p].reduce((a, b) => a + b, 0);
        meanSeats[p] = (sum / n).toFixed(1);
    }
    ctx.textAlign = 'left';
    ctx.font = '11px Noto Sans';
    let y = 14;
    for (const p of parties) {
        ctx.fillStyle = colors[p];
        ctx.fillText(`${p[0].toUpperCase() + p.slice(1)}: \u03BC=${meanSeats[p]} seats`, 8, y);
        y += 16;
    }
}
