// ─── District Palette ───
import { CONFIG, PALETTE_COLOR_MAP } from './config.js';
import { state, clearModes } from './state.js';
import { renderBorders, renderDistrictLabels } from './renderer.js';

const paletteButtons = [];

export function renderDistrictPalette($, updateSidebarDetails) {
    if (!$.palette) return;
    $.palette.innerHTML = '';
    paletteButtons.length = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const btn = document.createElement('button');
        btn.className = 'palette-btn';
        btn.dataset.district = i;
        btn.textContent = i;
        btn.title = `District ${i}`;
        if (i === state.currentDistrict) btn.classList.add('active');

        btn.addEventListener('click', () => {
            state.currentDistrict = i;
            clearModes($);
            updateDistrictPalette();
            updateSidebarDetails(i);
            renderBorders($);
            renderDistrictLabels($);
        });

        $.palette.appendChild(btn);
        paletteButtons.push(btn);
    }

    updateDistrictPalette();
}

export function updateDistrictPalette() {
    for (const btn of paletteButtons) {
        const dId = parseInt(btn.dataset.district);
        const d = state.districts[dId];

        btn.classList.toggle('active', dId === state.currentDistrict);

        if (d && d.population > 0 && d.winner !== 'none') {
            btn.classList.add('has-district');
            btn.style.color = dId === state.currentDistrict ? '' : (PALETTE_COLOR_MAP[d.winner] || '');
        } else {
            btn.classList.remove('has-district');
            btn.style.color = '';
        }
    }
}
