// Light/dark theme: persists to localStorage, respects prefers-color-scheme.
import { state } from './state.js';
import { refreshMinOpacity, updateHexVisuals, renderBorders } from './renderer.js';

export function initTheme() {
    _toolbar.initTheme('gerry-theme', syncTheme);
    syncTheme();
}

/** Re-reads theme-dependent CSS vars (e.g. --hex-min-opacity). */
function syncTheme() {
    refreshMinOpacity();
}

export function toggleTheme($) {
    _toolbar.toggleTheme('gerry-theme');
    syncTheme();
    // Hex fill colors and border strokes read from themed CSS vars, so re-render all.
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    renderBorders($);
}
