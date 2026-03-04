// Light/dark theme: persists to localStorage, respects prefers-color-scheme.
import { state } from './state.js';
import { refreshMinOpacity, updateHexVisuals, renderBorders } from './renderer.js';

export function initTheme() {
    const saved = localStorage.getItem('gerry-theme');
    document.documentElement.dataset.theme = saved || 'light';
    syncTheme();

    // Follow system preference when user hasn't made an explicit choice.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('gerry-theme')) {
            document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
            syncTheme();
        }
    });
}

/** Re-reads theme-dependent CSS vars (e.g. --hex-min-opacity). */
function syncTheme() {
    refreshMinOpacity();
}

export function toggleTheme($) {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('gerry-theme', next);
    syncTheme();
    // Hex fill colors and border strokes read from themed CSS vars, so re-render all.
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    renderBorders($);
}
