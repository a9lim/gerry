// ─── Theme Management ───
import { state } from './state.js';
import { refreshMinOpacity, updateHexVisuals, renderBorders } from './renderer.js';

export function initTheme() {
    const saved = localStorage.getItem('gerry-theme');
    document.documentElement.dataset.theme = saved || 'light';
    syncTheme();

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('gerry-theme')) {
            document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
            syncTheme();
        }
    });
}

function syncTheme() {
    refreshMinOpacity();
}

export function toggleTheme($) {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('gerry-theme', next);
    syncTheme();
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    renderBorders($);
}
