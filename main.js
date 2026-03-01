// ─── Entry Point ───
import { CONFIG } from './src/config.js';
import { state, hexElements, initDistricts, setUndoRedoUICallback, pushUndoSnapshot, undo, redo, setMode, clearModes } from './src/state.js';
import { generateHexes } from './src/hex-generator.js';
import { refreshMinOpacity, updateHexVisuals, renderMap, renderBorders, renderDistrictLabels } from './src/renderer.js';
import { setupMouseHandlers, clearHover, handleHover, startPaintingAt, stopPainting } from './src/input.js';
import { initCamera, resetCamera, shiftForSidebar } from './src/zoom.js';
import { initTouchHandlers } from './src/touch.js';
import { updateMetrics, updateSidebarDetails } from './src/sidebar.js';
import { renderDistrictPalette, updateDistrictPalette } from './src/palette.js';
import { initTheme, toggleTheme } from './src/theme.js';

// ─── DOM Cache ───
const $ = {};

function cacheDOMElements() {
    $.svg = document.getElementById('hex-map');
    $.hexGroup = document.getElementById('hex-group');
    $.borderGroup = document.getElementById('border-group');
    $.minorityGroup = document.getElementById('minority-group');
    $.labelGroup = document.getElementById('label-group');
    $.mapContainer = document.getElementById('map-container');
    $.tooltip = document.getElementById('hex-tooltip');
    $.sidebar = document.getElementById('sidebar');
    $.palette = document.getElementById('district-palette');
    $.undoBtn = document.getElementById('undo-btn');
    $.redoBtn = document.getElementById('redo-btn');
    $.deleteBtn = document.getElementById('delete-btn');
    $.eraseBtn = document.getElementById('erase-btn');
    $.moveBtn = document.getElementById('move-btn');
    $.themeBtn = document.getElementById('theme-btn');
    $.statsToggle = document.getElementById('stats-toggle');
    $.closeStats = document.getElementById('close-stats');
    $.zoomLevel = document.getElementById('zoom-level');
    $.introScreen = document.getElementById('intro-screen');
    $.introStart = document.getElementById('intro-start');
    $.resetBtn = document.getElementById('reset-btn');
    $.randomizeBtn = document.getElementById('randomize-btn');
    $.zoomInBtn = document.getElementById('zoom-in-btn');
    $.zoomOutBtn = document.getElementById('zoom-out-btn');
    $.zoomFitBtn = document.getElementById('zoom-fit-btn');

    // Stats elements
    $.redSeats = document.getElementById('red-seats');
    $.blueSeats = document.getElementById('blue-seats');
    $.yellowSeats = document.getElementById('yellow-seats');
    $.mmdCount = document.getElementById('mmd-count');
    $.districtCount = document.getElementById('district-count');
    $.efficiencyGap = document.getElementById('efficiency-gap');
    $.egNote = document.getElementById('eg-note');

    // District detail elements
    $.selectedInfo = document.getElementById('selected-district-info');
    $.noSelectionMsg = document.getElementById('no-selection-msg');
    $.detailTitle = document.getElementById('detail-title');
    $.detailWinner = document.getElementById('detail-winner');
    $.detailMargin = document.getElementById('detail-margin');
    $.detailPop = document.getElementById('detail-pop');
    $.targetPop = document.getElementById('target-pop');
    $.detailDeviation = document.getElementById('detail-deviation');
    $.detailCompactness = document.getElementById('detail-compactness');
    $.detailContiguous = document.getElementById('detail-contiguous');
    $.detailMm = document.getElementById('detail-mm');

    // Vote bars
    $.voteBarRed = document.getElementById('vote-bar-red');
    $.voteBarBlue = document.getElementById('vote-bar-blue');
    $.voteBarYellow = document.getElementById('vote-bar-yellow');
    $.votePctRed = document.getElementById('vote-pct-red');
    $.votePctBlue = document.getElementById('vote-pct-blue');
    $.votePctYellow = document.getElementById('vote-pct-yellow');

    // Proportionality elements
    $.prop = {};
    for (const party of ['red', 'blue', 'yellow']) {
        $.prop[party] = {
            votes: document.getElementById(`prop-${party}-votes`),
            seats: document.getElementById(`prop-${party}-seats`),
            votePct: document.getElementById(`prop-${party}-vote-pct`),
            seatPct: document.getElementById(`prop-${party}-seat-pct`)
        };
    }

    // SVG defs
    $.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    $.defs.id = 'map-defs';
    $.svg.insertBefore($.defs, $.svg.firstChild);
}

// ─── Bound helpers (close over $) ───
const doUpdateMetrics = () => updateMetrics($, updateDistrictPalette);
const doUpdateSidebarDetails = (dId) => updateSidebarDetails(dId, $);
const doUndo = () => { if (state.undoStack.length <= 1) return; undo(updateHexVisuals, doUpdateMetrics); showToast('Undo'); };
const doRedo = () => { if (state.redoStack.length === 0) return; redo(updateHexVisuals, doUpdateMetrics); showToast('Redo'); };
const doDeleteDistrict = (dId) => {
    if (dId === 0) return;
    let changed = false;
    state.hexes.forEach(hex => {
        if (hex.district === dId) {
            hex.district = 0;
            changed = true;
        }
    });
    if (changed) {
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        doUpdateMetrics();
        pushUndoSnapshot();
    }
};

// ─── Map Operations ───
function randomizeMap() {
    clearModes($);
    state.hexes.clear();
    hexElements.clear();
    initDistricts();
    state.undoStack = [];
    state.redoStack = [];
    generateHexes();
    state.targetPop = Math.round(
        Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts
    );
    renderMap($);
    resetCamera();
    doUpdateMetrics();
    renderDistrictPalette($, doUpdateSidebarDetails);
    pushUndoSnapshot();
    showToast('Map randomized');
}

function resetMap() {
    clearModes($);
    state.hexes.forEach(hex => { hex.district = 0; });
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    doUpdateMetrics();
    pushUndoSnapshot();
    showToast('Districts cleared');
}

// ─── UI Setup ───
function setupUI() {
    // Mouse handlers
    setupMouseHandlers($, {
        onStartPainting: (qr, isErase) => startPaintingAt(qr, isErase, doDeleteDistrict, doUpdateSidebarDetails, updateDistrictPalette),
        onStopPainting: () => stopPainting(doUpdateMetrics, pushUndoSnapshot),
        onClearHover: () => clearHover($),
        onHandleHover: (e, qr) => handleHover(e, qr, $, doUpdateSidebarDetails),
    });

    // Toolbar buttons
    $.resetBtn?.addEventListener('click', resetMap);
    $.randomizeBtn?.addEventListener('click', randomizeMap);
    $.deleteBtn?.addEventListener('click', () => setMode('delete', $));
    $.eraseBtn?.addEventListener('click', () => setMode('erase', $));
    $.moveBtn?.addEventListener('click', () => setMode('pan', $));

    if ($.undoBtn) $.undoBtn.addEventListener('click', doUndo);
    if ($.redoBtn) $.redoBtn.addEventListener('click', doRedo);
    if ($.themeBtn) $.themeBtn.addEventListener('click', () => toggleTheme($));

    // Zoom buttons bound via camera.bindZoomButtons() in initCamera()

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); doUndo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); doRedo(); }
    });

    // Stats panel toggle
    if ($.statsToggle && $.sidebar) {
        $.statsToggle.addEventListener('click', () => {
            const opening = !$.sidebar.classList.contains('open');
            $.sidebar.classList.toggle('open');
            $.statsToggle.classList.toggle('active');
            shiftForSidebar(opening);
        });
        if (window.innerWidth > 900) {
            $.sidebar.classList.add('open');
            $.statsToggle.classList.add('active');
        }
    }
    if ($.closeStats && $.sidebar) {
        $.closeStats.addEventListener('click', () => {
            $.sidebar.classList.remove('open');
            $.statsToggle?.classList.remove('active');
            shiftForSidebar(false);
        });
    }

    // Swipe-to-dismiss for mobile bottom sheet
    if (typeof initSwipeDismiss === 'function' && $.sidebar) {
        initSwipeDismiss($.sidebar, {
            onDismiss() {
                $.statsToggle?.classList.remove('active');
                shiftForSidebar(false);
            }
        });
    }

    renderDistrictPalette($, doUpdateSidebarDetails);

    // Intro screen
    if ($.introStart && $.introScreen) {
        $.introStart.addEventListener('click', () => {
            $.introScreen.classList.add('hidden');
            document.body.classList.add('app-ready');
            if ($.mapContainer) $.mapContainer.classList.remove('paused');
            setTimeout(() => { $.introScreen.style.display = 'none'; }, 850);
        });
    }
}

// ─── Init ───
function init() {
    refreshMinOpacity();
    if ($.mapContainer) $.mapContainer.classList.add('paused');
    generateHexes();
    setupUI();
    state.targetPop = Math.round(
        Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts
    );
    renderMap($);
    initCamera($);
    doUpdateMetrics();
    pushUndoSnapshot();
}

// ─── Undo/Redo UI callback ───
setUndoRedoUICallback(() => {
    if ($.undoBtn) $.undoBtn.disabled = state.undoStack.length <= 1;
    if ($.redoBtn) $.redoBtn.disabled = state.redoStack.length === 0;
});

// ─── Touch handlers ───
function initTouch() {
    initTouchHandlers($, {
        deleteDistrict: doDeleteDistrict,
        updateSidebarDetails: doUpdateSidebarDetails,
        updateDistrictPalette,
        updateMetrics: doUpdateMetrics,
        pushUndoSnapshot,
    });
}

// ─── Bootstrap ───
cacheDOMElements();
initTheme();
init();
initTouch();
