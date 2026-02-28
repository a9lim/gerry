// ─── Mouse Input Handlers ───
import { HEX_W, HEX_H } from './config.js';
import { state, hexElements } from './state.js';
import { calculateMetrics, votePcts } from './metrics.js';
import { updateHexVisuals, renderBorders, renderDistrictLabels } from './renderer.js';
import { clampViewBox } from './zoom.js';

let _borderUpdatePending = false;

function scheduleBorderUpdate($) {
    if (_borderUpdatePending) return;
    _borderUpdatePending = true;
    requestAnimationFrame(() => {
        renderBorders($);
        renderDistrictLabels($);
        _borderUpdatePending = false;
    });
}

export function getHexFromEvent(e) {
    let target = e.target;
    if (target.tagName === 'polygon') {
        target = target.parentNode;
    } else if (target.tagName !== 'g' || !target.classList.contains('hex')) {
        target = target.closest('.hex');
    }
    return target?.classList?.contains('hex') ? target.dataset.qr : null;
}

export function getHexFromPoint(clientX, clientY, $) {
    const rect = $.svg.getBoundingClientRect();
    const vb = state.viewBox;
    const svgX = vb.x + ((clientX - rect.left) / rect.width) * vb.w;
    const svgY = vb.y + ((clientY - rect.top) / rect.height) * vb.h;

    const r_frac = svgY / HEX_H;
    const q_frac = svgX / HEX_W - r_frac / 2;
    const s_frac = -q_frac - r_frac;

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

function paintHexByKey(qr) {
    if (state.isPainting === false) return;
    const hex = state.hexes.get(qr);
    if (!hex) return;
    const targetDistrict = state.isPainting === 'erase' ? 0 : state.isPainting;

    if (targetDistrict > 0 && hex.district !== targetDistrict && state.targetPop > 0) {
        const d = state.districts[targetDistrict];
        if (d && d.population + hex.population > state.targetPop * 1.1) return;
    }

    if (hex.district !== targetDistrict) {
        hex.district = targetDistrict;
        updateHexVisuals(qr);
        const g = hexElements.get(qr);
        if (g) {
            g.classList.remove('just-painted');
            void g.offsetWidth;
            g.classList.add('just-painted');
        }
    }
}

// Exported for touch.js
export function startPaintingAt(qr, isErase, deleteDistrict, updateSidebarDetails, updateDistrictPalette) {
    const hex = state.hexes.get(qr);
    if (!hex) return false;

    if (state.deleteMode) {
        if (hex.district > 0) deleteDistrict(hex.district);
        return false;
    }

    if (isErase) {
        state.isPainting = 'erase';
    } else if (hex.district > 0) {
        state.isPainting = hex.district;
    } else {
        state.isPainting = state.currentDistrict;
    }
    state.currentDistrict = typeof state.isPainting === 'number' ? state.isPainting : state.currentDistrict;
    paintHexByKey(qr);
    updateSidebarDetails(state.currentDistrict);
    updateDistrictPalette();
    return true;
}

export function stopPainting(updateMetrics, pushUndoSnapshot) {
    if (state.isPainting !== false) {
        state.isPainting = false;
        updateMetrics();
        pushUndoSnapshot();
    }
}

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
    if (!state.isPainting) return;
    paintHexByKey(qr);
    calculateMetrics();
    updateSidebarDetails(state.currentDistrict);
    scheduleBorderUpdate($);
}

export function clearHover($) {
    if (state.hoveredHex) {
        const el = hexElements.get(state.hoveredHex);
        if (el) el.classList.remove('hovered');
        state.hoveredHex = null;
    }
    if ($.tooltip) $.tooltip.classList.remove('visible');
}

function showHexTooltip(e, qr, $) {
    if (!$.tooltip) return;
    if (!qr) { $.tooltip.classList.remove('visible'); return; }
    const hex = state.hexes.get(qr);
    if (!hex) { $.tooltip.classList.remove('visible'); return; }

    const pct = votePcts(hex.votes);
    const pR = Math.round(pct.red), pB = Math.round(pct.blue), pY = Math.round(pct.yellow);

    $.tooltip.innerHTML = `<span class="tt-pop">Pop: ${hex.population.toLocaleString()}</span>`
        + `<div class="tt-votes"><span class="tt-r">R ${pR}%</span> <span class="tt-b">B ${pB}%</span> <span class="tt-y">Y ${pY}%</span></div>`
        + (hex.minority ? `<span class="tt-m">Minority area</span>` : '')
        + (hex.district > 0 ? `<span>District ${hex.district}</span>` : '');

    const rect = $.mapContainer.getBoundingClientRect();
    $.tooltip.style.left = `${e.clientX - rect.left + 12}px`;
    $.tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    $.tooltip.classList.add('visible');
}

export function handleHover(e, qr, $, updateSidebarDetails) {
    updateHoverTarget(qr);
    paintIfActive(qr, $, updateSidebarDetails);
    showHexTooltip(e, qr, $);
}

export function handleHoverAt(qr, $, updateSidebarDetails) {
    updateHoverTarget(qr);
    paintIfActive(qr, $, updateSidebarDetails);
}

export function setupMouseHandlers($, { onStartPainting, onStopPainting, onClearHover, onHandleHover }) {
    $.svg.addEventListener('mousedown', (e) => {
        if (e.button === 1 || (e.button === 0 && state.panMode)) {
            e.preventDefault();
            state.isPanning = true;
            state.panStart = { x: e.clientX, y: e.clientY };
            $.mapContainer.classList.add('panning');
            return;
        }
        // startPainting
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
            const rect = $.svg.getBoundingClientRect();
            const dx = (e.clientX - state.panStart.x) / rect.width * state.viewBox.w;
            const dy = (e.clientY - state.panStart.y) / rect.height * state.viewBox.h;
            state.viewBox.x -= dx;
            state.viewBox.y -= dy;
            clampViewBox(state.viewBox);
            state.panStart = { x: e.clientX, y: e.clientY };
            $.svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
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

