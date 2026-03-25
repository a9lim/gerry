// Entry point: wires DOM, input, toolbar, sidebar, plans, and election UI.
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
// Single object holding all getElementById refs; built once at boot.
const $ = {};

function cacheDOMElements() {
    $.svg = document.getElementById('hex-map');
    $.hexGroup = document.getElementById('hex-group');
    $.borderGroup = document.getElementById('border-group');
    $.minorityGroup = document.getElementById('minority-group');
    $.labelGroup = document.getElementById('label-group');
    $.mapContainer = document.getElementById('map-container');
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

    $.orangeSeats = document.getElementById('orange-seats');
    $.limeSeats = document.getElementById('lime-seats');
    $.purpleSeats = document.getElementById('purple-seats');
    $.mmdCount = document.getElementById('mmd-count');
    $.districtCount = document.getElementById('district-count');
    $.efficiencyGap = document.getElementById('efficiency-gap');
    $.egNote = document.getElementById('eg-note');
    $.partisanSymmetry = document.getElementById('partisan-symmetry');
    $.competitiveDistricts = document.getElementById('competitive-districts');

    $.brushToggles = document.getElementById('brush-toggles');
    $.autofillBtn = document.getElementById('autofill-btn');
    $.gerrymanderBtn = document.getElementById('gerrymander-btn');
    $.gerrymanderParty = document.getElementById('gerrymander-party');
    $.fairDrawBtn = document.getElementById('fair-draw-btn');

    $.plansBtn = document.getElementById('plans-btn');
    $.plansDialog = document.getElementById('plans-dialog');
    $.plansClose = document.getElementById('plans-close');
    $.planNameInput = document.getElementById('plan-name-input');
    $.planSaveBtn = document.getElementById('plan-save-btn');
    $.plansList = document.getElementById('plans-list');
    $.planExportBtn = document.getElementById('plan-export-btn');
    $.planImportInput = document.getElementById('plan-import-input');

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

    $.voteBarOrange = document.getElementById('vote-bar-orange');
    $.voteBarLime = document.getElementById('vote-bar-lime');
    $.voteBarPurple = document.getElementById('vote-bar-purple');
    $.votePctOrange = document.getElementById('vote-pct-orange');
    $.votePctLime = document.getElementById('vote-pct-lime');
    $.votePctPurple = document.getElementById('vote-pct-purple');

    $.prop = {};
    for (const party of ['orange', 'lime', 'purple']) {
        $.prop[party] = {
            votes: document.getElementById(`prop-${party}-votes`),
            seats: document.getElementById(`prop-${party}-seats`),
            votePct: document.getElementById(`prop-${party}-vote-pct`),
            seatPct: document.getElementById(`prop-${party}-seat-pct`)
        };
    }

    $.simulateBtn = document.getElementById('simulate-btn');
    $.electionOverlay = document.getElementById('election-overlay');
    $.electionClose = document.getElementById('election-close');
    $.swingSigma = document.getElementById('swing-sigma');
    $.swingValue = document.getElementById('swing-value');
    $.electionCount = document.getElementById('election-count');
    $.runElections = document.getElementById('run-elections');
    $.electionHistogram = document.getElementById('election-histogram');

    // Clip-path defs container for district borders; must precede hex-group in SVG.
    $.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    $.defs.id = 'map-defs';
    $.svg.insertBefore($.defs, $.svg.firstChild);
}

// ─── Bound Helpers ───
// Closures over $ so module functions can access the DOM cache.
const doUpdateMetrics = () => updateMetrics($, updateDistrictPalette);
const doUpdateSidebarDetails = (dId) => updateSidebarDetails(dId, $);
const doUndo = () => { if (state.undoStack.length <= 1) return; undo(updateHexVisuals, doUpdateMetrics); showToast('Undo'); _haptics.trigger('light'); };
const doRedo = () => { if (state.redoStack.length === 0) return; redo(updateHexVisuals, doUpdateMetrics); showToast('Redo'); _haptics.trigger('light'); };
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
    _haptics.trigger('medium');
}

function resetMap() {
    clearModes($);
    state.hexes.forEach(hex => { hex.district = 0; });
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    doUpdateMetrics();
    pushUndoSnapshot();
    showToast('Districts cleared');
    _haptics.trigger('warning');
}

// ─── UI Setup ───
function setupUI() {
    setupMouseHandlers($, {
        onStartPainting: (qr, isErase) => startPaintingAt(qr, isErase, doDeleteDistrict, doUpdateSidebarDetails, updateDistrictPalette),
        onStopPainting: () => stopPainting(doUpdateMetrics, pushUndoSnapshot),
        onClearHover: () => clearHover($),
        onHandleHover: (e, qr) => handleHover(e, qr, $, doUpdateSidebarDetails),
    });

    $.resetBtn?.addEventListener('click', resetMap);
    $.randomizeBtn?.addEventListener('click', randomizeMap);
    $.deleteBtn?.addEventListener('click', () => { setMode('delete', $); _haptics.trigger('light'); });
    $.eraseBtn?.addEventListener('click', () => { setMode('erase', $); _haptics.trigger('light'); });
    $.moveBtn?.addEventListener('click', () => { setMode('pan', $); _haptics.trigger('light'); });

    if ($.undoBtn) $.undoBtn.addEventListener('click', doUndo);
    if ($.redoBtn) $.redoBtn.addEventListener('click', doRedo);
    if ($.themeBtn) $.themeBtn.addEventListener('click', () => { toggleTheme($); _haptics.trigger('light'); });

    if ($.brushToggles) {
        // Set initial aria-pressed on brush buttons
        $.brushToggles.querySelectorAll('.mode-btn').forEach(function(b) {
            b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
        });
        _forms.bindModeGroup($.brushToggles, 'brush', v => {
            state.brushSize = parseInt(v, 10);
            // Sync aria-pressed with active class
            $.brushToggles.querySelectorAll('.mode-btn').forEach(function(b) {
                b.setAttribute('aria-pressed', b.classList.contains('active') ? 'true' : 'false');
            });
        });
    }

    if ($.autofillBtn) {
        $.autofillBtn.addEventListener('click', () => {
            const count = autoFillDistrict(state.currentDistrict, updateHexVisuals, doUpdateMetrics, pushUndoSnapshot);
            if (count > 0) {
                showToast(`Auto-filled ${count} hexes`);
                _haptics.trigger('success');
            } else {
                showToast('Nothing to fill');
                _haptics.trigger('nudge');
            }
        });
    }

    // Snapshot before and after so the entire auto-draw is a single undo step.
    $.gerrymanderBtn?.addEventListener('click', () => {
        const party = $.gerrymanderParty.value;
        pushUndoSnapshot();
        packAndCrack(party);
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        doUpdateMetrics();
        pushUndoSnapshot();
        showToast(`Auto-gerrymandered for ${party}`);
        _haptics.trigger('medium');
    });
    $.fairDrawBtn?.addEventListener('click', () => {
        pushUndoSnapshot();
        fairDraw();
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        doUpdateMetrics();
        pushUndoSnapshot();
        showToast('Fair districts drawn');
        _haptics.trigger('medium');
    });

    if ($.statsToggle && $.sidebar) {
        _toolbar.initSidebar($.statsToggle, $.sidebar, $.closeStats, {
            onToggle: shiftForSidebar,
        });
    }

    renderDistrictPalette($, doUpdateSidebarDetails);

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
                _haptics.trigger('success');
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
                _haptics.trigger('warning');
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
    initOverlayDismiss($.plansDialog, $.plansClose, () => $.plansDialog.classList.add('hidden'));
    if ($.planSaveBtn && $.planNameInput) {
        $.planSaveBtn.addEventListener('click', () => {
            const name = $.planNameInput.value.trim();
            if (!name) { showToast('Enter a plan name'); return; }
            savePlan(name);
            $.planNameInput.value = '';
            renderPlansList();
            showToast(`Saved "${name}"`);
            _haptics.trigger('success');
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
                _haptics.trigger('success');
            } catch (err) {
                showToast(err.message);
            }
            e.target.value = '';
        });
    }

    $.simulateBtn?.addEventListener('click', () => {
        $.electionOverlay.hidden = false;
    });
    initOverlayDismiss($.electionOverlay, $.electionClose);
    $.runElections?.addEventListener('click', () => {
        const sigma = parseFloat($.swingSigma.value) / 100;
        const count = parseInt($.electionCount.value);
        const results = simulateElections(count, sigma);
        renderHistogram($.electionHistogram, results, CONFIG.numDistricts);
    });
    if ($.swingSigma) _forms.updateSliderFill($.swingSigma);
    $.swingSigma?.addEventListener('input', e => {
        $.swingValue.textContent = e.target.value + '%';
        _forms.updateSliderFill(e.target);
        _haptics.trigger('selection');
    });

    // Info tip popover content (tooltip data already rewritten by prior task).
    const infoData = {
        eg: { title: 'Efficiency Gap', body: 'Counts votes that don\'t help elect anyone — a losing party\'s entire tally, plus a winner\'s surplus above the runner-up. When one party wastes far more votes than the others, the map likely favors someone. Gaps above 7\u2009% turn red as a warning.' },
        symmetry: { title: 'Partisan Symmetry', body: 'Swaps each pair of parties\' vote shares and re-counts seats. A fair map gives the same advantage to whichever side earns it, so swapping should flip the seat gap. 100\u2009% means perfectly symmetric; lower scores reveal structural bias baked into district lines.' },
        competitive: { title: 'Competitive Districts', body: 'Counts districts where the winner leads by less than 10\u2009% of the vote. Competitive seats mean small shifts in public opinion can change outcomes, keeping representatives accountable to voters.' },
        compactness: { title: 'Compactness', body: 'Uses the Polsby-Popper ratio $\\frac{4\\pi A}{P^2}$, which compares each district\'s area to its perimeter. A perfect circle scores 100\u2009%. Sprawling or oddly shaped districts score lower and may signal that boundaries were drawn to include or exclude specific communities.' },
        contiguity: { title: 'Contiguity', body: 'Checks that every hex in a district can be reached from every other hex without leaving the district. Split districts are almost always illegal because voters in disconnected pieces share no geographic community.' },
        mmd: { title: 'Majority-Minority Districts', body: 'Districts where a minority group makes up more than half the population. When a state\'s minority population is large enough, the Voting Rights Act may require at least one such district so that minority voters have a meaningful opportunity to elect a representative of their choice.' },
        popbalance: { title: 'Population Balance', body: 'Measures how close each district is to the ideal population (total population \u00F7 number of districts). Districts deviating by more than 10\u2009% turn red. The principle of "one person, one vote" requires roughly equal district sizes so that every voter\'s ballot carries the same weight.' },
    };

    registerInfoTips(infoData);

    function cycleTab(dir) {
        var btns = document.querySelectorAll('.tab-btn');
        var idx = 0;
        btns.forEach(function(b, i) { if (b.classList.contains('active')) idx = i; });
        var next = (idx + dir + btns.length) % btns.length;
        btns[next].click();
    }

    function cycleBrush() {
        const sizes = [0, 1, 2];
        const idx = sizes.indexOf(state.brushSize);
        state.brushSize = sizes[(idx + 1) % sizes.length];
        if ($.brushToggles) {
            const btn = $.brushToggles.querySelector(`[data-brush="${state.brushSize}"]`);
            if (btn) btn.click();
        }
    }

    const shortcuts = [
        { key: 'E', label: 'Toggle erase mode', group: 'Tools', action: () => setMode('erase', $) },
        { key: 'D', label: 'Toggle delete mode', group: 'Tools', action: () => setMode('delete', $) },
        { key: 'P', label: 'Toggle pan mode', group: 'Tools', action: () => { setMode('pan', $); _haptics.trigger('light'); } },
        { key: 'A', label: 'Auto-fill district', group: 'Tools', action: () => {
            const count = autoFillDistrict(state.currentDistrict, updateHexVisuals, doUpdateMetrics, pushUndoSnapshot);
            showToast(count > 0 ? `Auto-filled ${count} hexes` : 'Nothing to fill');
        }},
        { key: 'B', label: 'Cycle brush size', group: 'Tools', action: cycleBrush },
        { key: 'R', label: 'Reset districts', group: 'Map', action: resetMap },
        { key: 'N', label: 'Randomize map', group: 'Map', action: randomizeMap },
        { key: 'G', label: 'Auto-gerrymander', group: 'Map', action: () => {
            const party = $.gerrymanderParty.value;
            pushUndoSnapshot();
            packAndCrack(party);
            state.hexes.forEach((_, qr) => updateHexVisuals(qr));
            doUpdateMetrics();
            pushUndoSnapshot();
            showToast(`Auto-gerrymandered for ${party}`);
            _haptics.trigger('medium');
        }},
        { key: 'F', label: 'Fair draw', group: 'Map', action: () => {
            pushUndoSnapshot();
            fairDraw();
            state.hexes.forEach((_, qr) => updateHexVisuals(qr));
            doUpdateMetrics();
            pushUndoSnapshot();
            showToast('Fair districts drawn');
            _haptics.trigger('medium');
        }},
        { key: 'M', label: 'Monte Carlo simulate', group: 'Map', action: () => { $.electionOverlay.hidden = false; } },
        { key: '1', label: 'Select district 1', group: 'Districts', action: () => { state.currentDistrict = 1; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '2', label: 'Select district 2', group: 'Districts', action: () => { state.currentDistrict = 2; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '3', label: 'Select district 3', group: 'Districts', action: () => { state.currentDistrict = 3; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '4', label: 'Select district 4', group: 'Districts', action: () => { state.currentDistrict = 4; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '5', label: 'Select district 5', group: 'Districts', action: () => { state.currentDistrict = 5; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '6', label: 'Select district 6', group: 'Districts', action: () => { state.currentDistrict = 6; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '7', label: 'Select district 7', group: 'Districts', action: () => { state.currentDistrict = 7; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '8', label: 'Select district 8', group: 'Districts', action: () => { state.currentDistrict = 8; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: '9', label: 'Select district 9', group: 'Districts', action: () => { state.currentDistrict = 9; renderDistrictPalette($, doUpdateSidebarDetails); } },
        { key: 'T', label: 'Toggle theme', group: 'View', action: () => toggleTheme($) },
        { key: 'S', label: 'Toggle sidebar', group: 'View', action: () => {
            if ($.sidebar) {
                const opening = !$.sidebar.classList.contains('open');
                $.sidebar.classList.toggle('open');
                $.statsToggle?.classList.toggle('active');
                shiftForSidebar(opening);
            }
        }},
        { key: 'Escape', label: 'Close sidebar', group: 'View', action: () => {
            if ($.sidebar?.classList.contains('open')) {
                $.sidebar.classList.remove('open');
                $.statsToggle?.classList.remove('active');
                shiftForSidebar(false);
            }
        }},
        { key: '[', label: 'Previous tab', group: 'View', action: () => cycleTab(-1) },
        { key: ']', label: 'Next tab', group: 'View', action: () => cycleTab(1) },
        { key: '=', label: 'Zoom in', group: 'View', action: () => $.zoomInBtn?.click() },
        { key: '-', label: 'Zoom out', group: 'View', action: () => $.zoomOutBtn?.click() },
        { key: '0', label: 'Reset zoom', group: 'View', action: () => $.zoomFitBtn?.click() },
        { key: 'Ctrl+Z', label: 'Undo', group: 'Tools', action: () => doUndo() },
        { key: 'Ctrl+Y', label: 'Redo', group: 'Tools', action: () => doRedo() },
        { key: 'Ctrl+Shift+Z', label: 'Redo', group: 'Tools', action: () => doRedo() },
    ];

    if (typeof initShortcuts === 'function') {
        initShortcuts(shortcuts, { helpTitle: 'Keyboard Shortcuts' });
    }

    if (typeof initAboutPanel === 'function') {
        var isTouch = window.matchMedia('(pointer: coarse)').matches;
        initAboutPanel({
            title: 'Gerry',
            description: 'Draw congressional districts on a procedural hex-tile map with three political parties. Paint hexes into 10 districts, track six fairness metrics in real time, then run automated gerrymanders or fair-draw algorithms to compare outcomes.',
            controls: [
                { label: 'Paint hex', value: isTouch ? 'Tap hex' : 'Click or drag on hex' },
                { label: 'Erase hex', value: isTouch ? 'Toggle erase (E)' : 'Right-click, or E then click' },
                { label: 'Select district', value: 'Bottom palette or keys 1\u20139' },
                { label: 'Pan', value: isTouch ? 'Two-finger drag' : 'Middle-click + drag, or P to toggle' },
                { label: 'Zoom', value: isTouch ? 'Pinch' : 'Scroll wheel / pinch / = / - / 0' },
                { label: 'Undo / Redo', value: 'Ctrl+Z / Ctrl+Y or Ctrl+Shift+Z' },
                { label: 'Change brush', value: 'Tools tab or B to cycle' },
            ],
            shortcuts: shortcuts,
            repo: 'https://github.com/a9lim/gerry',
        });
    }

    _intro.init($.introScreen, $.introStart, () => {
        if ($.mapContainer) $.mapContainer.classList.remove('paused');
    });

    if (window.matchMedia('(pointer: coarse)').matches) {
        var hint = document.getElementById('hint-bar') || document.querySelector('.hint-bar');
        if (hint) hint.textContent = 'Tap to Paint \u00b7 Pinch to Zoom \u00b7 E to Toggle Erase';
    }
}

// ─── Init ───
function init() {
    refreshMinOpacity();
    // Pause hex pop-in animations until intro screen is dismissed.
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

// ─── Undo/Redo UI Callback ───
setUndoRedoUICallback(() => {
    if ($.undoBtn) $.undoBtn.disabled = state.undoStack.length <= 1;
    if ($.redoBtn) $.redoBtn.disabled = state.redoStack.length === 0;
});

// ─── Touch Handlers ───
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
