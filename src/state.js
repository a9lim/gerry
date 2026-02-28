// ─── State Management ───
import { CONFIG } from './config.js';

export const state = {
    hexes: new Map(),
    districts: {},
    districtColors: [],
    currentDistrict: 1,
    isPainting: false,
    hoveredHex: null,
    targetPop: 0,
    viewBox: { x: 0, y: 0, w: 0, h: 0 },
    origViewBox: { x: 0, y: 0, w: 0, h: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    zoomLevel: 1,
    undoStack: [],
    redoStack: [],
    deleteMode: false,
    eraseMode: false,
    panMode: false,
    maxPop: 100
};

// Hex element index (avoids querySelector on every hover/paint)
export const hexElements = new Map();

// Party/accent colors — shared across themes
export const activeColors = _PALETTE;

export function initDistricts() {
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = {
            id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 },
            hexes: [], minorityPop: 0, isContiguous: true, compactness: 0,
            winner: 'none', isMinorityMajority: false
        };
    }
}

// ─── Undo/Redo ───
let _updateUndoRedoUI = null;

export function setUndoRedoUICallback(fn) {
    _updateUndoRedoUI = fn;
}

function getSnapshot() {
    const snap = {};
    state.hexes.forEach((hex, key) => { snap[key] = hex.district; });
    return snap;
}

export function restoreSnapshot(snap, updateHexVisuals, updateMetrics) {
    for (const [key, districtId] of Object.entries(snap)) {
        const hex = state.hexes.get(key);
        if (hex) hex.district = districtId;
    }
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    updateMetrics();
}

export function pushUndoSnapshot() {
    state.undoStack.push(getSnapshot());
    state.redoStack = [];
    if (state.undoStack.length > 50) state.undoStack.shift();
    _updateUndoRedoUI?.();
}

export function undo(updateHexVisuals, updateMetrics) {
    if (state.undoStack.length <= 1) return;
    state.redoStack.push(state.undoStack.pop());
    restoreSnapshot(state.undoStack[state.undoStack.length - 1], updateHexVisuals, updateMetrics);
    _updateUndoRedoUI?.();
}

export function redo(updateHexVisuals, updateMetrics) {
    if (state.redoStack.length === 0) return;
    const snap = state.redoStack.pop();
    state.undoStack.push(snap);
    restoreSnapshot(snap, updateHexVisuals, updateMetrics);
    _updateUndoRedoUI?.();
}

// ─── Mode Management ───
const MODES = {
    delete: { stateKey: 'deleteMode', btn: 'deleteBtn', cssClass: 'delete-mode' },
    erase:  { stateKey: 'eraseMode', btn: 'eraseBtn',  cssClass: 'erase-mode' },
    pan:    { stateKey: 'panMode',   btn: 'moveBtn',   cssClass: 'pan-mode' },
};

export function setMode(name, $) {
    const toggling = MODES[name];
    const wasActive = toggling && state[toggling.stateKey];
    for (const m of Object.values(MODES)) {
        state[m.stateKey] = false;
        $[m.btn]?.classList.remove('active');
        $.mapContainer?.classList.remove(m.cssClass);
    }
    if (toggling && !wasActive) {
        state[toggling.stateKey] = true;
        $[toggling.btn]?.classList.add('active');
        $.mapContainer?.classList.add(toggling.cssClass);
    }
}

export function clearModes($) { setMode(null, $); }
