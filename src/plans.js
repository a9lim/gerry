// ─── Plan Save/Load ───
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

export function loadPlan(name, updateHexVisuals, updateMetrics, renderMapFn) {
    const plans = _readPlans();
    const plan = plans.find(p => p.name === name);
    if (!plan) return false;

    // If plan has a seed, regenerate the map from that seed
    if (plan.seed !== undefined) {
        state.seed = plan.seed;
        state.hexes.clear();
        hexElements.clear();
        initDistricts();
        generateHexes(plan.seed);
        if (renderMapFn) renderMapFn();
    }

    // Clear all assignments
    state.hexes.forEach(hex => { hex.district = 0; });

    // Restore assignments
    for (const [key, districtId] of Object.entries(plan.hexAssignments)) {
        const hex = state.hexes.get(key);
        if (hex) hex.district = districtId;
    }

    // Update visuals
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    updateMetrics();

    // Update URL hash
    if (plan.seed !== undefined) {
        history.replaceState(null, '', '#seed=' + plan.seed);
    }
    return true;
}

export function deletePlan(name) {
    const plans = _readPlans();
    _writePlans(plans.filter(p => p.name !== name));
}

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
