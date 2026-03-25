// District palette bar: numbered buttons for selecting the active district.
import { CONFIG, PALETTE_COLOR_MAP } from './config.js';
import { state, clearModes } from './state.js';
import { renderBorders, renderDistrictLabels } from './renderer.js';

const paletteButtons = [];

/** Creates 10 numbered buttons in the floating palette bar. */
export function renderDistrictPalette($, updateSidebarDetails) {
    if (!$.palette) return;
    // Safe: rebuilds only controlled button elements.
    $.palette.innerHTML = '';
    paletteButtons.length = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const btn = document.createElement('button');
        btn.className = 'palette-btn';
        btn.dataset.district = i;
        btn.textContent = i;
        btn.title = `District ${i}`;
        btn.setAttribute('aria-pressed', i === state.currentDistrict ? 'true' : 'false');
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

/** Syncs button active/color state with current district assignments. */
export function updateDistrictPalette() {
    for (const btn of paletteButtons) {
        const dId = parseInt(btn.dataset.district);
        const d = state.districts[dId];

        btn.classList.toggle('active', dId === state.currentDistrict);
        btn.setAttribute('aria-pressed', dId === state.currentDistrict ? 'true' : 'false');

        // Assigned districts show winner's party color; active button uses accent instead.
        if (d && d.population > 0 && d.winner !== 'none') {
            btn.classList.add('has-district');
            btn.style.color = dId === state.currentDistrict ? '' : (PALETTE_COLOR_MAP[d.winner] || '');
        } else {
            btn.classList.remove('has-district');
            btn.style.color = '';
        }
    }
}
