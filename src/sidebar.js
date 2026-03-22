// Sidebar UI: statewide metrics, per-district details, proportionality bars.
import { CONFIG } from './config.js';
import { state } from './state.js';
import { calculateMetrics, calculateEfficiencyGap, calculatePartisanSymmetry, calculateCompetitiveDistricts, calculateRequiredMMD, votePcts } from './metrics.js';
import { renderBorders, renderDistrictLabels } from './renderer.js';

// animateValue() is provided by shared-utils.js (window.animateValue)

// ─── Proportionality Panel ───

/** Updates vote% vs seat% comparison bars for the three parties. */
function updateProportionality(seats, $) {
    const totalVotes = { orange: 0, lime: 0, purple: 0 };
    const totalSeats = (seats.orange || 0) + (seats.lime || 0) + (seats.purple || 0);

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            totalVotes.orange += d.votes.orange;
            totalVotes.lime += d.votes.lime;
            totalVotes.purple += d.votes.purple;
        }
    }

    const grandTotal = totalVotes.orange + totalVotes.lime + totalVotes.purple;

    for (const party of ['orange', 'lime', 'purple']) {
        const p = $.prop[party];
        if (!p) continue;
        const votePct = grandTotal > 0 ? (totalVotes[party] / grandTotal) * 100 : 0;
        const seatPct = totalSeats > 0 ? ((seats[party] || 0) / totalSeats) * 100 : 0;

        if (p.votes) p.votes.style.width = `${votePct}%`;
        if (p.seats) p.seats.style.width = `${seatPct}%`;
        if (p.votePct) p.votePct.textContent = grandTotal > 0 ? `${Math.round(votePct)}% votes` : '\u2014';
        if (p.seatPct) p.seatPct.textContent = totalSeats > 0 ? `${Math.round(seatPct)}% seats` : '\u2014';
    }
}

// ─── District Detail Panel ───

/** Populates the per-district detail panel (District tab). */
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
        // Red title when population deviates >10% or district is non-contiguous.
        if (state.targetPop > 0) {
            const dev = Math.abs((d.population - state.targetPop) / state.targetPop);
            $.detailTitle.style.color = (dev > 0.1 || !d.isContiguous) ? 'var(--party-orange)' : 'inherit';
        }
    }

    if ($.detailWinner) {
        $.detailWinner.textContent = d.winner.charAt(0).toUpperCase() + d.winner.slice(1);
        $.detailWinner.style.color = d.winner !== 'none' ? _PALETTE[d.winner] : 'var(--text-secondary)';
    }

    const totalVotes = d.votes.orange + d.votes.lime + d.votes.purple;
    if (totalVotes > 0) {
        const sorted = [d.votes.orange, d.votes.lime, d.votes.purple].sort((a, b) => b - a);
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
        $.detailDeviation.style.color = Math.abs(dev) > 10 ? 'var(--party-orange)' : 'var(--text-secondary)';
    }

    animateValue($.detailCompactness, d.compactness, 600, v => `${Math.round(v)}%`, 'detail-comp');

    if ($.detailContiguous) {
        $.detailContiguous.textContent = d.isContiguous ? 'Yes' : 'No';
        $.detailContiguous.style.color = d.isContiguous ? 'var(--party-blue)' : 'var(--party-orange)';
    }

    if ($.detailMm) {
        $.detailMm.textContent = d.isMinorityMajority ? 'Yes' : 'No';
        $.detailMm.style.color = d.isMinorityMajority ? 'var(--party-blue)' : 'var(--text-secondary)';
    }

    if (totalVotes > 0) {
        const pct = votePcts(d.votes);
        if ($.voteBarOrange) $.voteBarOrange.style.width = `${pct.orange}%`;
        if ($.voteBarLime) $.voteBarLime.style.width = `${pct.lime}%`;
        if ($.voteBarPurple) $.voteBarPurple.style.width = `${pct.purple}%`;
        if ($.votePctOrange) $.votePctOrange.textContent = `${Math.round(pct.orange)}% Oran`;
        if ($.votePctLime) $.votePctLime.textContent = `${Math.round(pct.lime)}% Lime`;
        if ($.votePctPurple) $.votePctPurple.textContent = `${Math.round(pct.purple)}% Purp`;
    }
}

// ─── Statewide Metrics Update ───

/** Full statewide metrics refresh: recalculates everything and updates all sidebar UI. */
export function updateMetrics($, updateDistrictPalette) {
    calculateMetrics();
    renderBorders($);

    let seats = { orange: 0, lime: 0, purple: 0 };
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

    animateValue($.orangeSeats, seats.orange, 600, v => Math.round(v), 'seats-orange');
    animateValue($.limeSeats, seats.lime, 600, v => Math.round(v), 'seats-lime');
    animateValue($.purpleSeats, seats.purple, 600, v => Math.round(v), 'seats-purple');

    const requiredMMD = calculateRequiredMMD();
    if ($.mmdCount) $.mmdCount.textContent = `${mmdCount} / ${requiredMMD} min`;
    if ($.districtCount) $.districtCount.textContent = `${activeDistrictCount} / ${CONFIG.numDistricts}`;

    // Efficiency gap: display gap between least-wasted and second-least-wasted party.
    const eg = calculateEfficiencyGap();
    if ($.efficiencyGap) {
        if (eg !== null) {
            const entries = [['Orange', eg.orange], ['Lime', eg.lime], ['Purple', eg.purple]];
            entries.sort((a, b) => a[1] - b[1]);
            const advantaged = entries[0][0];
            const gap = entries[1][1] - entries[0][1];
            const pct = (gap * 100).toFixed(1);
            $.efficiencyGap.textContent = `${pct}% \u2192 ${advantaged}`;
            $.efficiencyGap.style.color = gap > 0.07 ? 'var(--party-orange)' : 'var(--text)';
        } else {
            $.efficiencyGap.textContent = '\u2014';
            $.efficiencyGap.style.color = 'var(--text-secondary)';
        }
    }

    const symmetry = calculatePartisanSymmetry();
    if ($.partisanSymmetry) {
        if (symmetry !== null) {
            $.partisanSymmetry.textContent = `${symmetry}%`;
            $.partisanSymmetry.style.color = symmetry < 80 ? 'var(--party-orange)' : 'var(--text)';
        } else {
            $.partisanSymmetry.textContent = '\u2014';
            $.partisanSymmetry.style.color = 'var(--text-secondary)';
        }
    }

    const comp = calculateCompetitiveDistricts();
    if ($.competitiveDistricts) {
        $.competitiveDistricts.textContent = `${comp.competitive} / ${comp.total}`;
    }

    updateSidebarDetails(state.currentDistrict, $);
    updateProportionality(seats, $);
    renderDistrictLabels($);
    updateDistrictPalette();
}
