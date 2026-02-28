// ─── Sidebar UI ───
import { CONFIG } from './config.js';
import { state, activeColors } from './state.js';
import { calculateMetrics, calculateEfficiencyGap, votePcts } from './metrics.js';
import { renderBorders, renderDistrictLabels } from './renderer.js';

const animatedCounters = {};

function animateValue(el, end, duration, formatFn = Math.round, id) {
    if (!el) return;
    const start = el._currentVal || 0;
    if (start === end) {
        el.textContent = formatFn(end);
        el._currentVal = end;
        return;
    }

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = progress < 1 ? start + (end - start) * ease : end;

        el.textContent = formatFn(current);
        el._currentVal = current;

        if (progress < 1) {
            animatedCounters[id] = requestAnimationFrame(step);
        }
    };
    if (animatedCounters[id]) cancelAnimationFrame(animatedCounters[id]);
    animatedCounters[id] = requestAnimationFrame(step);
}

function updateProportionality(seats, $) {
    const totalVotes = { red: 0, blue: 0, yellow: 0 };
    const totalSeats = (seats.red || 0) + (seats.blue || 0) + (seats.yellow || 0);

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            totalVotes.red += d.votes.red;
            totalVotes.blue += d.votes.blue;
            totalVotes.yellow += d.votes.yellow;
        }
    }

    const grandTotal = totalVotes.red + totalVotes.blue + totalVotes.yellow;

    for (const party of ['red', 'blue', 'yellow']) {
        const p = $.prop[party];
        if (!p) continue;
        const votePct = grandTotal > 0 ? (totalVotes[party] / grandTotal) * 100 : 0;
        const seatPct = totalSeats > 0 ? ((seats[party] || 0) / totalSeats) * 100 : 0;

        if (p.votes) p.votes.style.width = `${votePct}%`;
        if (p.seats) p.seats.style.width = `${seatPct}%`;
        if (p.votePct) p.votePct.textContent = grandTotal > 0 ? `${Math.round(votePct)}% votes` : '—';
        if (p.seatPct) p.seatPct.textContent = totalSeats > 0 ? `${Math.round(seatPct)}% seats` : '—';
    }
}

export function updateSidebarDetails(dId, $) {
    const d = state.districts[dId];
    if (!d || d.population === 0) {
        $.selectedInfo?.classList.add('hidden');
        $.noSelectionMsg?.classList.remove('hidden');
        return;
    }

    $.selectedInfo?.classList.remove('hidden');
    $.noSelectionMsg?.classList.add('hidden');

    if ($.detailTitle) {
        $.detailTitle.textContent = `District ${d.id}`;
        if (state.targetPop > 0) {
            const dev = Math.abs((d.population - state.targetPop) / state.targetPop);
            $.detailTitle.style.color = (dev > 0.1 || !d.isContiguous) ? 'var(--party-red)' : 'inherit';
        }
    }

    if ($.detailWinner) {
        $.detailWinner.textContent = d.winner.charAt(0).toUpperCase() + d.winner.slice(1);
        $.detailWinner.style.color = d.winner !== 'none' ? activeColors[d.winner] : 'var(--text-secondary)';
    }

    const totalVotes = d.votes.red + d.votes.blue + d.votes.yellow;
    if (totalVotes > 0) {
        const sorted = [d.votes.red, d.votes.blue, d.votes.yellow].sort((a, b) => b - a);
        const margin = (sorted[0] - sorted[1]) / totalVotes * 100;
        animateValue($.detailMargin, margin, 600, v => `+${v.toFixed(1)}%`, 'detail-margin');
    } else if ($.detailMargin) {
        $.detailMargin.textContent = '-';
    }

    animateValue($.detailPop, d.population, 600, v => Math.round(v).toLocaleString(), 'detail-pop');
    if ($.targetPop) $.targetPop.textContent = state.targetPop.toLocaleString();

    if (state.targetPop > 0 && $.detailDeviation) {
        const dev = ((d.population - state.targetPop) / state.targetPop) * 100;
        animateValue($.detailDeviation, dev, 600, v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, 'detail-dev');
        $.detailDeviation.style.color = Math.abs(dev) > 10 ? 'var(--party-red)' : 'var(--text-secondary)';
    }

    animateValue($.detailCompactness, d.compactness, 600, v => `${Math.round(v)}%`, 'detail-comp');

    if ($.detailContiguous) {
        $.detailContiguous.textContent = d.isContiguous ? 'Yes' : 'No';
        $.detailContiguous.style.color = d.isContiguous ? 'var(--party-green)' : 'var(--party-red)';
    }

    if ($.detailMm) {
        $.detailMm.textContent = d.isMinorityMajority ? 'Yes' : 'No';
        $.detailMm.style.color = d.isMinorityMajority ? 'var(--party-green)' : 'var(--text-secondary)';
    }

    if (totalVotes > 0) {
        const pct = votePcts(d.votes);
        if ($.voteBarRed) $.voteBarRed.style.width = `${pct.red}%`;
        if ($.voteBarBlue) $.voteBarBlue.style.width = `${pct.blue}%`;
        if ($.voteBarYellow) $.voteBarYellow.style.width = `${pct.yellow}%`;
        if ($.votePctRed) $.votePctRed.textContent = `${Math.round(pct.red)}% Red`;
        if ($.votePctBlue) $.votePctBlue.textContent = `${Math.round(pct.blue)}% Blue`;
        if ($.votePctYellow) $.votePctYellow.textContent = `${Math.round(pct.yellow)}% Yell`;
    }
}

export function updateMetrics($, updateDistrictPalette) {
    calculateMetrics();
    renderBorders($);

    let seats = { red: 0, blue: 0, yellow: 0 };
    let mmdCount = 0;
    let activeDistrictCount = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            activeDistrictCount++;
            if (d.winner !== 'none') seats[d.winner]++;
            if (d.isMinorityMajority) mmdCount++;
        }
    }

    animateValue($.redSeats, seats.red, 600, v => Math.round(v), 'seats-red');
    animateValue($.blueSeats, seats.blue, 600, v => Math.round(v), 'seats-blue');
    animateValue($.yellowSeats, seats.yellow, 600, v => Math.round(v), 'seats-yellow');
    if ($.mmdCount) $.mmdCount.textContent = `${mmdCount} / 2 min`;
    if ($.districtCount) $.districtCount.textContent = `${activeDistrictCount} / ${CONFIG.numDistricts}`;

    const eg = calculateEfficiencyGap();
    if ($.efficiencyGap) {
        if (eg !== null) {
            const pct = (eg * 100).toFixed(1);
            $.efficiencyGap.textContent = `${Math.abs(pct)}% ${eg > 0 ? '→ Blue' : '→ Red'}`;
            $.efficiencyGap.style.color = Math.abs(eg) > 0.07 ? 'var(--party-red)' : 'var(--text)';
        } else {
            $.efficiencyGap.textContent = '—';
            $.efficiencyGap.style.color = 'var(--text-secondary)';
        }
    }

    updateSidebarDetails(state.currentDistrict, $);
    updateProportionality(seats, $);
    renderDistrictLabels($);
    updateDistrictPalette();
}
