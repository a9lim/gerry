import { CONFIG } from './config.js';
import { state } from './state.js';

// Box-Muller transform for normal distribution
function gaussRandom(mean, stddev) {
    const u1 = Math.random(), u2 = Math.random();
    return mean + stddev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function simulateElections(numElections, swingSigma) {
    const parties = ['red', 'blue', 'yellow'];
    const results = { red: [], blue: [], yellow: [] };

    for (let e = 0; e < numElections; e++) {
        // Correlated national swing per party
        const nationalSwing = {};
        for (const p of parties) nationalSwing[p] = gaussRandom(0, swingSigma);

        const seats = { red: 0, blue: 0, yellow: 0 };

        for (let d = 1; d <= CONFIG.numDistricts; d++) {
            const dist = state.districts[d];
            if (!dist || dist.hexes.length === 0) continue;

            // Apply swing to vote shares
            const totalVotes = dist.votes.red + dist.votes.blue + dist.votes.yellow;
            if (totalVotes === 0) continue;

            const swungShares = {};
            let shareSum = 0;
            for (const p of parties) {
                const baseShare = dist.votes[p] / totalVotes;
                const localNoise = gaussRandom(0, swingSigma * 0.3);
                swungShares[p] = Math.max(0.01, baseShare + nationalSwing[p] + localNoise);
                shareSum += swungShares[p];
            }
            // Normalize
            for (const p of parties) swungShares[p] /= shareSum;

            // Determine winner
            let winner = 'red', maxShare = 0;
            for (const p of parties) {
                if (swungShares[p] > maxShare) { maxShare = swungShares[p]; winner = p; }
            }
            seats[winner]++;
        }

        for (const p of parties) results[p].push(seats[p]);
    }

    return results;
}

export function renderHistogram(canvas, results, numDistricts) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const parties = ['red', 'blue', 'yellow'];
    const colors = {
        red: getComputedStyle(document.documentElement).getPropertyValue('--party-red').trim(),
        blue: getComputedStyle(document.documentElement).getPropertyValue('--party-blue').trim(),
        yellow: getComputedStyle(document.documentElement).getPropertyValue('--party-yellow').trim(),
    };

    const n = results.red.length;
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

    // X-axis labels
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim();
    ctx.font = '9px Noto Sans Mono';
    ctx.textAlign = 'center';
    for (let s = 0; s <= numDistricts; s++) {
        ctx.fillText(s, s * barGroupW + barGroupW / 2, h - 4);
    }
    ctx.fillText('Seats \u2192', w / 2, h - 4);

    // Stats text
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
