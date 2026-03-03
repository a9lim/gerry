// ─── Entry Point ───
import { CONFIG } from './src/config.js';
import { state, hexElements, initDistricts, setUndoRedoUICallback, pushUndoSnapshot, undo, redo, setMode, clearModes } from './src/state.js';
import { generateHexes } from './src/hex-generator.js';
import { randomSeed } from './src/prng.js';
import { refreshMinOpacity, updateHexVisuals, renderMap, renderBorders, renderDistrictLabels } from './src/renderer.js';
import { setupMouseHandlers, clearHover, handleHover, startPaintingAt, stopPainting, autoFillDistrict } from './src/input.js';
import { initCamera, resetCamera, shiftForSidebar } from './src/zoom.js';
import { initTouchHandlers } from './src/touch.js';
import { updateMetrics, updateSidebarDetails } from './src/sidebar.js';
import { renderDistrictPalette, updateDistrictPalette } from './src/palette.js';
import { initTheme, toggleTheme } from './src/theme.js';
import { listPlans, savePlan, loadPlan, deletePlan, exportPlan, exportCurrentPlan, importPlan } from './src/plans.js';
import { simulateElections, renderHistogram } from './src/election-sim.js';
import { packAndCrack, fairDraw } from './src/auto-district.js';

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
    $.partisanSymmetry = document.getElementById('partisan-symmetry');
    $.competitiveDistricts = document.getElementById('competitive-districts');

    // Brush & auto-fill
    $.brushToggles = document.getElementById('brush-toggles');
    $.autofillBtn = document.getElementById('autofill-btn');
    $.gerrymanderBtn = document.getElementById('gerrymander-btn');
    $.gerrymanderParty = document.getElementById('gerrymander-party');
    $.fairDrawBtn = document.getElementById('fair-draw-btn');

    // Plans dialog
    $.plansBtn = document.getElementById('plans-btn');
    $.plansDialog = document.getElementById('plans-dialog');
    $.plansClose = document.getElementById('plans-close');
    $.planNameInput = document.getElementById('plan-name-input');
    $.planSaveBtn = document.getElementById('plan-save-btn');
    $.plansList = document.getElementById('plans-list');
    $.planExportBtn = document.getElementById('plan-export-btn');
    $.planImportInput = document.getElementById('plan-import-input');

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

    // Election simulation
    $.simulateBtn = document.getElementById('simulate-btn');
    $.electionOverlay = document.getElementById('election-overlay');
    $.electionClose = document.getElementById('election-close');
    $.swingSigma = document.getElementById('swing-sigma');
    $.swingValue = document.getElementById('swing-value');
    $.electionCount = document.getElementById('election-count');
    $.runElections = document.getElementById('run-elections');
    $.electionHistogram = document.getElementById('election-histogram');

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
function randomizeMap(seed) {
    if (seed === undefined) seed = randomSeed();
    state.seed = seed;
    clearModes($);
    state.hexes.clear();
    hexElements.clear();
    initDistricts();
    state.undoStack = [];
    state.redoStack = [];
    generateHexes(seed);
    state.targetPop = Math.round(
        Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts
    );
    renderMap($);
    resetCamera();
    doUpdateMetrics();
    renderDistrictPalette($, doUpdateSidebarDetails);
    pushUndoSnapshot();
    history.replaceState(null, '', '#seed=' + seed);
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

    // Brush size toggles
    if ($.brushToggles) {
        $.brushToggles.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-brush]');
            if (!btn) return;
            $.brushToggles.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.brushSize = parseInt(btn.dataset.brush, 10);
        });
    }

    // Auto-fill
    if ($.autofillBtn) {
        $.autofillBtn.addEventListener('click', () => {
            const count = autoFillDistrict(state.currentDistrict, updateHexVisuals, doUpdateMetrics, pushUndoSnapshot);
            if (count > 0) {
                showToast(`Auto-filled ${count} hexes`);
            } else {
                showToast('Nothing to fill');
            }
        });
    }

    // Auto-gerrymander & fair draw
    $.gerrymanderBtn?.addEventListener('click', () => {
        const party = $.gerrymanderParty.value;
        pushUndoSnapshot();
        packAndCrack(party);
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        doUpdateMetrics();
        pushUndoSnapshot();
        showToast(`Auto-gerrymandered for ${party}`);
    });
    $.fairDrawBtn?.addEventListener('click', () => {
        pushUndoSnapshot();
        fairDraw();
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        doUpdateMetrics();
        pushUndoSnapshot();
        showToast('Fair districts drawn');
    });

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

    // Plans dialog
    function renderPlansList() {
        if (!$.plansList) return;
        const plans = listPlans();
        if (plans.length === 0) {
            $.plansList.innerHTML = '<p class="plans-empty">No saved plans yet.</p>';
            return;
        }
        $.plansList.innerHTML = '';
        for (const p of plans) {
            const item = document.createElement('div');
            item.className = 'plan-item';
            const date = new Date(p.timestamp);
            const dateStr = `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;
            item.innerHTML = `
                <span class="plan-item-name">${escapeHtml(p.name)}</span>
                <span class="plan-item-date">${dateStr}</span>
                <div class="plan-item-actions">
                    <button class="plan-item-btn load" title="Load">Load</button>
                    <button class="plan-item-btn export" title="Export">Export</button>
                    <button class="plan-item-btn delete" title="Delete">&times;</button>
                </div>`;
            item.querySelector('.load').addEventListener('click', (e) => {
                e.stopPropagation();
                loadPlan(p.name, updateHexVisuals, doUpdateMetrics, () => renderMap($));
                pushUndoSnapshot();
                $.plansDialog?.classList.add('hidden');
                showToast(`Loaded "${p.name}"`);
            });
            item.querySelector('.export').addEventListener('click', (e) => {
                e.stopPropagation();
                exportPlan(p.name);
            });
            item.querySelector('.delete').addEventListener('click', (e) => {
                e.stopPropagation();
                deletePlan(p.name);
                renderPlansList();
                showToast(`Deleted "${p.name}"`);
            });
            $.plansList.appendChild(item);
        }
    }

    if ($.plansBtn && $.plansDialog) {
        $.plansBtn.addEventListener('click', () => {
            $.plansDialog.classList.remove('hidden');
            renderPlansList();
        });
    }
    if ($.plansClose) {
        $.plansClose.addEventListener('click', () => $.plansDialog?.classList.add('hidden'));
    }
    if ($.plansDialog) {
        $.plansDialog.addEventListener('click', (e) => {
            if (e.target === $.plansDialog) $.plansDialog.classList.add('hidden');
        });
    }
    if ($.planSaveBtn && $.planNameInput) {
        $.planSaveBtn.addEventListener('click', () => {
            const name = $.planNameInput.value.trim();
            if (!name) { showToast('Enter a plan name'); return; }
            savePlan(name);
            $.planNameInput.value = '';
            renderPlansList();
            showToast(`Saved "${name}"`);
        });
    }
    if ($.planExportBtn) {
        $.planExportBtn.addEventListener('click', () => {
            const name = $.planNameInput?.value.trim() || 'plan';
            exportCurrentPlan(name);
        });
    }
    if ($.planImportInput) {
        $.planImportInput.addEventListener('change', async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const name = await importPlan(file);
                renderPlansList();
                showToast(`Imported "${name}"`);
            } catch (err) {
                showToast(err.message);
            }
            e.target.value = '';
        });
    }

    // Election simulation
    $.simulateBtn?.addEventListener('click', () => {
        $.electionOverlay.hidden = false;
    });
    $.electionClose?.addEventListener('click', () => {
        $.electionOverlay.hidden = true;
    });
    $.runElections?.addEventListener('click', () => {
        const sigma = parseFloat($.swingSigma.value) / 100;
        const count = parseInt($.electionCount.value);
        const results = simulateElections(count, sigma);
        renderHistogram($.electionHistogram, results, CONFIG.numDistricts);
    });
    $.swingSigma?.addEventListener('input', e => {
        $.swingValue.textContent = e.target.value + '%';
    });
    if ($.electionOverlay) {
        $.electionOverlay.addEventListener('click', (e) => {
            if (e.target === $.electionOverlay) $.electionOverlay.hidden = true;
        });
    }

    // Info tips
    const infoData = {
        eg: { title: 'Efficiency Gap', body: 'Measures wasted votes across all three parties. In a fair election, all parties waste similar numbers of votes. Values above 7% suggest gerrymandering (Gill v. Whitford, 2018).' },
        symmetry: { title: 'Partisan Symmetry', body: 'If the parties\u2019 vote shares were swapped, would the seat outcome be symmetric? 100% = perfectly fair. Measures structural bias in the district map.' },
        competitive: { title: 'Competitive Districts', body: 'Districts where the winning margin is under 10%. More competitive districts generally indicate a healthier democracy with more meaningful elections.' },
        compactness: { title: 'Compactness', body: 'Polsby-Popper score: how close the district shape is to a circle. 100% = perfect circle. Low scores indicate irregular, potentially gerrymandered shapes.' },
        contiguity: { title: 'Contiguity', body: 'All parts of a district must be connected. Non-contiguous districts (split into separate pieces) are illegal in most states.' },
        mmd: { title: 'Majority-Minority Districts', body: 'Districts where over 50% of the population is a minority group. The Voting Rights Act may require a minimum number to ensure minority representation.' },
        popbalance: { title: 'Population Balance', body: 'Districts should have roughly equal populations (within 10%). Large deviations violate the Equal Protection Clause (Reynolds v. Sims, 1964).' },
    };

    if (typeof createInfoTip === 'function') {
        document.querySelectorAll('.info-trigger[data-info]').forEach(trigger => {
            const key = trigger.dataset.info;
            if (infoData[key]) createInfoTip(trigger, infoData[key]);
        });
    }

    // Keyboard shortcuts
    const shortcuts = [
        { key: 'E', label: 'Toggle erase mode', group: 'Tools', action: () => setMode('erase', $) },
        { key: 'D', label: 'Toggle delete mode', group: 'Tools', action: () => setMode('delete', $) },
        { key: 'A', label: 'Auto-fill district', group: 'Tools', action: () => {
            const count = autoFillDistrict(state.currentDistrict, updateHexVisuals, doUpdateMetrics, pushUndoSnapshot);
            showToast(count > 0 ? `Auto-filled ${count} hexes` : 'Nothing to fill');
        }},
        { key: 'N', label: 'Randomize map', group: 'Map', action: randomizeMap },
        { key: '1', label: 'Select district 1', group: 'Districts', action: () => { state.currentDistrict = 1; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '2', label: 'Select district 2', group: 'Districts', action: () => { state.currentDistrict = 2; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '3', label: 'Select district 3', group: 'Districts', action: () => { state.currentDistrict = 3; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '4', label: 'Select district 4', group: 'Districts', action: () => { state.currentDistrict = 4; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '5', label: 'Select district 5', group: 'Districts', action: () => { state.currentDistrict = 5; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '6', label: 'Select district 6', group: 'Districts', action: () => { state.currentDistrict = 6; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '7', label: 'Select district 7', group: 'Districts', action: () => { state.currentDistrict = 7; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '8', label: 'Select district 8', group: 'Districts', action: () => { state.currentDistrict = 8; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '9', label: 'Select district 9', group: 'Districts', action: () => { state.currentDistrict = 9; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '0', label: 'Select district 10', group: 'Districts', action: () => { state.currentDistrict = 10; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: 'T', label: 'Toggle theme', group: 'View', action: () => toggleTheme($) },
        { key: 'S', label: 'Toggle sidebar', group: 'View', action: () => {
            if ($.sidebar) {
                const opening = !$.sidebar.classList.contains('open');
                $.sidebar.classList.toggle('open');
                $.statsToggle?.classList.toggle('active');
                shiftForSidebar(opening);
            }
        }},
    ];

    if (typeof initShortcuts === 'function') {
        initShortcuts(shortcuts, { helpTitle: 'Keyboard Shortcuts' });
    }

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
    const hashSeed = parseInt(location.hash.replace('#seed=', ''), 10);
    const initialSeed = Number.isFinite(hashSeed) ? hashSeed : randomSeed();
    state.seed = initialSeed;
    generateHexes(initialSeed);
    setupUI();
    state.targetPop = Math.round(
        Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts
    );
    renderMap($);
    initCamera($);
    doUpdateMetrics();
    pushUndoSnapshot();
    history.replaceState(null, '', '#seed=' + initialSeed);
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
