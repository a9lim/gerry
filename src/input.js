// Mouse/pointer input: painting, erasing, hovering, tooltip, auto-fill, pan.
import { CONFIG, HEX_W, HEX_H, HEX_DIRS, getHexesInRadius } from './config.js';
import { state, hexElements } from './state.js';
import { calculateMetrics, votePcts } from './metrics.js';
import { updateHexVisuals, renderBorders, renderDistrictLabels } from './renderer.js';
import { camera } from './zoom.js';

// ─── Batched Border Updates ───
// Collects changed district IDs during a paint stroke and renders
// borders in a single rAF to avoid per-hex SVG rebuilds.
let _borderUpdatePending = false;
const _changedDistricts = new Set();

function scheduleBorderUpdate($) {
    if (_borderUpdatePending) return;
    _borderUpdatePending = true;
    requestAnimationFrame(() => {
        const changed = _changedDistricts.size > 0 ? new Set(_changedDistricts) : null;
        _changedDistricts.clear();
        renderBorders($, changed);
        renderDistrictLabels($);
        _borderUpdatePending = false;
    });
}

// ─── Hit Testing ───

/** Walks from event target up to the `.hex` group to extract the `data-qr` key. */
export function getHexFromEvent(e) {
    let target = e.target;
    if (target.tagName === 'polygon') {
        target = target.parentNode;
    } else if (target.tagName !== 'g' || !target.classList.contains('hex')) {
        target = target.closest('.hex');
    }
    return target?.classList?.contains('hex') ? target.dataset.qr : null;
}

/**
 * Converts client-space coordinates to axial hex coordinates via
 * cube-rounding. Used by touch input where there's no DOM event target.
 */
export function getHexFromPoint(clientX, clientY, $) {
    const rect = $.svg.getBoundingClientRect();
    const vb = state.viewBox;
    const svgX = vb.x + ((clientX - rect.left) / rect.width) * vb.w;
    const svgY = vb.y + ((clientY - rect.top) / rect.height) * vb.h;

    // Fractional axial coordinates.
    const r_frac = svgY / HEX_H;
    const q_frac = svgX / HEX_W - r_frac / 2;
    const s_frac = -q_frac - r_frac;

    // Cube-rounding: snap to nearest integer cube coord then fix the
    // component with the largest rounding error to satisfy q + r + s = 0.
    let q = Math.round(q_frac);
    let r = Math.round(r_frac);
    let s = Math.round(s_frac);
    const q_diff = Math.abs(q - q_frac);
    const r_diff = Math.abs(r - r_frac);
    const s_diff = Math.abs(s - s_frac);
    if (q_diff > r_diff && q_diff > s_diff) {
        q = -r - s;
    } else if (r_diff > s_diff) {
        r = -q - s;
    }

    const key = `${q},${r}`;
    return state.hexes.has(key) ? key : null;
}

// ─── Painting ───

function paintHexByKey(qr) {
    if (state.paintState.mode === 'none') return;
    const hex = state.hexes.get(qr);
    if (!hex) return;
    const targetDistrict = state.paintState.mode === 'erase' ? 0 : state.paintState.districtId;

    // Enforce population cap to keep districts roughly equal.
    if (targetDistrict > 0 && hex.district !== targetDistrict && state.targetPop > 0) {
        const d = state.districts[targetDistrict];
        if (d && d.population + hex.population > state.targetPop * CONFIG.popCapRatio) return;
    }

    if (hex.district !== targetDistrict) {
        if (hex.district > 0) _changedDistricts.add(hex.district);
        hex.district = targetDistrict;
        if (targetDistrict > 0) _changedDistricts.add(targetDistrict);
        updateHexVisuals(qr);
        // Trigger CSS paint-flash animation by forcing a reflow between
        // class removal and re-addition.
        const g = hexElements.get(qr);
        if (g) {
            g.classList.remove('just-painted');
            void g.offsetWidth;
            g.classList.add('just-painted');
        }
    }
}

/** Paints all hexes within the current brush radius centered on `qr`. */
function paintBrush(qr) {
    if (state.brushSize <= 0) {
        paintHexByKey(qr);
        return;
    }
    const [q, r] = qr.split(',').map(Number);
    const keys = getHexesInRadius(q, r, state.brushSize);
    for (const k of keys) {
        paintHexByKey(k);
    }
}

/**
 * Begins a paint or erase stroke at `qr`.
 * In delete mode, removes the entire district instead of painting.
 * Returns true if a paint stroke started (used by touch.js).
 */
export function startPaintingAt(qr, isErase, deleteDistrict, updateSidebarDetails, updateDistrictPalette) {
    const hex = state.hexes.get(qr);
    if (!hex) return false;

    if (state.deleteMode) {
        if (hex.district > 0) deleteDistrict(hex.district);
        return false;
    }

    if (isErase) {
        state.paintState.mode = 'erase';
        state.paintState.districtId = null;
    } else if (hex.district > 0) {
        // Clicking an assigned hex picks up that district's ID.
        state.paintState.mode = 'paint';
        state.paintState.districtId = hex.district;
    } else {
        state.paintState.mode = 'paint';
        state.paintState.districtId = state.currentDistrict;
    }
    state.currentDistrict = state.paintState.mode === 'paint' ? state.paintState.districtId : state.currentDistrict;
    paintBrush(qr);
    updateSidebarDetails(state.currentDistrict);
    updateDistrictPalette();
    return true;
}

/** Ends the current paint stroke: recalculates metrics and saves undo snapshot. */
export function stopPainting(updateMetrics, pushUndoSnapshot) {
    if (state.paintState.mode !== 'none') {
        state.paintState.mode = 'none';
        state.paintState.districtId = null;
        updateMetrics();
        pushUndoSnapshot();
    }
}

// ─── Hover ───

function updateHoverTarget(qr) {
    if (state.hoveredHex === qr) return;
    if (state.hoveredHex) {
        const oldEl = hexElements.get(state.hoveredHex);
        if (oldEl) oldEl.classList.remove('hovered');
    }
    state.hoveredHex = qr;
    const el = hexElements.get(qr);
    if (el) el.classList.add('hovered');
}

function paintIfActive(qr, $, updateSidebarDetails) {
    if (state.paintState.mode === 'none') return;
    paintBrush(qr);
    calculateMetrics();
    updateSidebarDetails(state.currentDistrict);
    scheduleBorderUpdate($);
}

// ─── Tooltip ───

const hexTip = (typeof createSimTooltip === 'function') ? createSimTooltip() : null;

export function clearHover($) {
    if (state.hoveredHex) {
        const el = hexElements.get(state.hoveredHex);
        if (el) el.classList.remove('hovered');
        state.hoveredHex = null;
    }
    if (hexTip) hexTip.hide();
}

function showHexTooltip(e, qr) {
    if (!hexTip) return;
    if (!qr) { hexTip.hide(); return; }
    const hex = state.hexes.get(qr);
    if (!hex) { hexTip.hide(); return; }

    const pct = votePcts(hex.votes);
    const pR = Math.round(pct.red), pB = Math.round(pct.blue), pY = Math.round(pct.yellow);

    // Safe: all values are numeric or from controlled state, not user input.
    // Build tooltip content via DOM methods for safety, though values are all controlled.
    const frag = document.createDocumentFragment();
    const popSpan = document.createElement('span');
    popSpan.className = 'tt-pop';
    popSpan.textContent = `Pop: ${hex.population.toLocaleString()}`;
    frag.appendChild(popSpan);

    const votesDiv = document.createElement('div');
    votesDiv.className = 'tt-votes';
    for (const [cls, label, val] of [['tt-r', 'R', pR], ['tt-b', 'B', pB], ['tt-y', 'Y', pY]]) {
        const s = document.createElement('span');
        s.className = cls;
        s.textContent = `${label} ${val}%`;
        votesDiv.appendChild(s);
    }
    frag.appendChild(votesDiv);

    if (hex.minority) {
        const mSpan = document.createElement('span');
        mSpan.className = 'tt-m';
        mSpan.textContent = 'Minority area';
        frag.appendChild(mSpan);
    }
    if (hex.district > 0) {
        const dSpan = document.createElement('span');
        dSpan.textContent = `District ${hex.district}`;
        frag.appendChild(dSpan);
    }

    hexTip.el.textContent = '';
    hexTip.el.appendChild(frag);
    hexTip.show(e.clientX, e.clientY);
}

export function handleHover(e, qr, $, updateSidebarDetails) {
    updateHoverTarget(qr);
    paintIfActive(qr, $, updateSidebarDetails);
    showHexTooltip(e, qr);
}

/** Same as handleHover but without tooltip (used by touch where there's no pointer position). */
export function handleHoverAt(qr, $, updateSidebarDetails) {
    updateHoverTarget(qr);
    paintIfActive(qr, $, updateSidebarDetails);
}

// ─── Auto-Fill ───

/**
 * Greedy nearest-neighbor expansion: repeatedly adds the closest unassigned
 * adjacent hex (by Manhattan distance to district centroid) until the
 * population cap is reached or no candidates remain. Produces compact shapes.
 *
 * @returns {number} Count of hexes added.
 */
export function autoFillDistrict(districtId, updateHexVisFn, updateMetricsFn, pushUndoFn) {
    const d = state.districts[districtId];
    if (!d) return 0;

    const inDistrict = new Set();
    state.hexes.forEach((hex, key) => {
        if (hex.district === districtId) inDistrict.add(key);
    });

    let cx = 0, cy = 0;
    for (const key of inDistrict) {
        const [q, r] = key.split(',').map(Number);
        cx += q; cy += r;
    }
    if (inDistrict.size > 0) { cx /= inDistrict.size; cy /= inDistrict.size; }

    let added = 0;
    const popCap = state.targetPop * CONFIG.popCapRatio;
    let currentPop = d.population;

    while (currentPop < popCap) {
        const candidates = [];
        for (const key of inDistrict) {
            const [q, r] = key.split(',').map(Number);
            for (const dir of HEX_DIRS) {
                const nk = `${q + dir.dq},${r + dir.dr}`;
                if (inDistrict.has(nk)) continue;
                const nh = state.hexes.get(nk);
                if (!nh || nh.district !== 0) continue;
                const dist = Math.abs(q + dir.dq - cx) + Math.abs(r + dir.dr - cy);
                candidates.push({ key: nk, hex: nh, dist });
            }
        }
        if (candidates.length === 0) break;

        // Deduplicate: a hex can appear multiple times from different boundary neighbors.
        const seen = new Set();
        const unique = [];
        for (const c of candidates) {
            if (!seen.has(c.key)) { seen.add(c.key); unique.push(c); }
        }
        unique.sort((a, b) => a.dist - b.dist);

        const best = unique[0];
        if (currentPop + best.hex.population > popCap) break;

        best.hex.district = districtId;
        inDistrict.add(best.key);
        currentPop += best.hex.population;
        added++;
    }

    if (added > 0) {
        state.hexes.forEach((_, qr) => updateHexVisFn(qr));
        updateMetricsFn();
        pushUndoFn();
    }
    return added;
}

// ─── Mouse Handler Setup ───

/** Binds mousedown/up/move/leave/contextmenu on the SVG element. */
export function setupMouseHandlers($, { onStartPainting, onStopPainting, onClearHover, onHandleHover }) {
    $.svg.addEventListener('mousedown', (e) => {
        // Middle-click or left-click in pan mode starts panning.
        if (e.button === 1 || (e.button === 0 && state.panMode)) {
            e.preventDefault();
            state.isPanning = true;
            state.panStart = { x: e.clientX, y: e.clientY };
            $.mapContainer.classList.add('panning');
            return;
        }
        e.preventDefault();
        const qr = getHexFromEvent(e);
        if (!qr) return;
        const isErase = e.button === 2 || (e.button === 0 && state.eraseMode);
        onStartPainting(qr, isErase);
    });

    $.svg.addEventListener('mouseup', () => {
        if (state.isPanning) {
            state.isPanning = false;
            $.mapContainer.classList.remove('panning');
            return;
        }
        onStopPainting();
    });

    $.svg.addEventListener('mouseleave', (e) => {
        if (state.isPanning) {
            state.isPanning = false;
            $.mapContainer.classList.remove('panning');
        } else {
            onStopPainting();
        }
        onClearHover();
    });

    $.svg.addEventListener('mousemove', (e) => {
        if (state.isPanning) {
            camera.panBy(e.clientX - state.panStart.x, e.clientY - state.panStart.y);
            state.panStart = { x: e.clientX, y: e.clientY };
            return;
        }
        const qr = getHexFromEvent(e);
        if (qr) {
            onHandleHover(e, qr);
        } else {
            onClearHover();
        }
    });

    $.svg.addEventListener('contextmenu', e => e.preventDefault());
}
