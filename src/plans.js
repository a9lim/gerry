// Plan persistence: save/load/delete/export/import district assignments via localStorage + JSON.
import { state, hexElements, initDistricts } from './state.js';
import { generateHexes } from './hex-generator.js';

const STORAGE_KEY = 'gerry-plans';

function _readPlans() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    } catch { return []; }
}

function _writePlans(plans) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

/** Snapshots only non-zero district assignments (sparse representation). */
function _getAssignments() {
    const assignments = {};
    state.hexes.forEach((hex, key) => {
        if (hex.district > 0) assignments[key] = hex.district;
    });
    return assignments;
}

export function listPlans() {
    return _readPlans().map(p => ({ name: p.name, timestamp: p.timestamp }));
}

/** Saves or overwrites a named plan. Stores seed for reproducible map generation. */
export function savePlan(name) {
    const plans = _readPlans();
    const existing = plans.findIndex(p => p.name === name);
    const plan = {
        name,
        seed: state.seed,
        hexAssignments: _getAssignments(),
        timestamp: Date.now(),
    };
    if (existing >= 0) {
        plans[existing] = plan;
    } else {
        plans.push(plan);
    }
    _writePlans(plans);
}

/**
 * Loads a named plan. If the plan stores a seed, regenerates the hex map
 * first so the coordinate keys align, then restores district assignments.
 */
export function loadPlan(name, updateHexVisuals, updateMetrics, renderMapFn) {
    const plans = _readPlans();
    const plan = plans.find(p => p.name === name);
    if (!plan) return false;

    if (plan.seed !== undefined) {
        state.seed = plan.seed;
        state.hexes.clear();
        hexElements.clear();
        initDistricts();
        generateHexes(plan.seed);
        if (renderMapFn) renderMapFn();
    }

    state.hexes.forEach(hex => { hex.district = 0; });

    for (const [key, districtId] of Object.entries(plan.hexAssignments)) {
        const hex = state.hexes.get(key);
        if (hex) hex.district = districtId;
    }

    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    updateMetrics();

    if (plan.seed !== undefined) {
        history.replaceState(null, '', '#seed=' + plan.seed);
    }
    return true;
}

export function deletePlan(name) {
    const plans = _readPlans();
    _writePlans(plans.filter(p => p.name !== name));
}

/** Triggers a JSON file download for a named plan from localStorage. */
export function exportPlan(name) {
    const plans = _readPlans();
    const plan = plans.find(p => p.name === name);
    if (!plan) return;

    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9_-]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Exports the live state (not from localStorage) as a JSON download. */
export function exportCurrentPlan(name) {
    const plan = {
        name: name || 'Untitled',
        seed: state.seed,
        hexAssignments: _getAssignments(),
        timestamp: Date.now(),
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(name || 'plan').replace(/[^a-z0-9_-]/gi, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

/** Reads a JSON file, validates it has hexAssignments, and saves to localStorage. */
export function importPlan(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const plan = JSON.parse(reader.result);
                if (!plan.hexAssignments || typeof plan.hexAssignments !== 'object') {
                    reject(new Error('Invalid plan format'));
                    return;
                }
                if (!plan.name) plan.name = file.name.replace(/\.json$/i, '');
                if (!plan.timestamp) plan.timestamp = Date.now();

                const plans = _readPlans();
                const existing = plans.findIndex(p => p.name === plan.name);
                if (existing >= 0) {
                    plans[existing] = plan;
                } else {
                    plans.push(plan);
                }
                _writePlans(plans);
                resolve(plan.name);
            } catch (e) {
                reject(new Error('Invalid JSON'));
            }
        };
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsText(file);
    });
}
