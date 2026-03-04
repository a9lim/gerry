// SVG rendering: hex polygons, minority markers, district borders (with caching),
// and numbered district labels.
import { CONFIG, HEX_DIRS, HEX_RENDER_SIZE } from './config.js';
import { hexToPixel, hexCorners, cornersToString } from './hex-math.js';
import { state, hexElements } from './state.js';

// ─── Hex Opacity ───
// Cached from CSS var to avoid getComputedStyle per hex.
let _cachedMinOpacity = 0.22;

export function refreshMinOpacity() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--hex-min-opacity');
    _cachedMinOpacity = parseFloat(val) || 0.22;
}

/** Maps population to opacity: low-pop hexes are semi-transparent for visual density cues. */
function hexOpacity(population) {
    return clamp(_cachedMinOpacity + (1 - _cachedMinOpacity) * (population / state.maxPop), _cachedMinOpacity, 1.0);
}

/** Updates a single hex's fill color and opacity from current state. */
export function updateHexVisuals(qr) {
    const hex = state.hexes.get(qr);
    const g = hexElements.get(qr);
    if (g) {
        g.firstChild.style.fill = _PALETTE[hex.partyWinner];
        g.style.opacity = hexOpacity(hex.population);
    }
}

// ─── Full Map Render ───

/**
 * Rebuilds the entire SVG hex grid. Uses DocumentFragment to batch DOM
 * insertions. Computes the viewBox from map bounds with padding and
 * vertical offset to clear toolbar/palette UI.
 */
export function renderMap($) {
    // Safe: clears SVG groups that contain only internally-generated elements.
    $.hexGroup.innerHTML = '';
    $.minorityGroup.innerHTML = '';
    hexElements.clear();

    const hexFrag = document.createDocumentFragment();
    const minFrag = document.createDocumentFragment();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const mapCenterX = CONFIG.cols / 2;
    const mapCenterY = CONFIG.rows / 2;

    state.hexes.forEach(hex => {
        const center = hexToPixel(hex.q, hex.r);
        if (center.x < minX) minX = center.x;
        if (center.x > maxX) maxX = center.x;
        if (center.y < minY) minY = center.y;
        if (center.y > maxY) maxY = center.y;

        const qr = `${hex.q},${hex.r}`;
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add('hex');
        g.dataset.qr = qr;
        g.style.opacity = hexOpacity(hex.population);

        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", cornersToString(hexCorners(center, HEX_RENDER_SIZE)));
        poly.style.fill = _PALETTE[hex.partyWinner];

        // Stagger pop-in animation by distance from map center for a radial reveal.
        const dist = Math.sqrt((hex.q + hex.r / 2 - mapCenterX) ** 2 + (hex.r - mapCenterY) ** 2);
        poly.style.animationDelay = `${dist * 0.04 + Math.random() * 0.03}s`;

        g.appendChild(poly);
        hexFrag.appendChild(g);
        hexElements.set(qr, g);

        if (hex.minority) {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", center.x);
            circle.setAttribute("cy", center.y);
            circle.setAttribute("r", CONFIG.hexSize * 0.25);
            circle.classList.add('minority-marker');
            circle.style.animationDelay = `${dist * 0.04 + Math.random() * 0.03 + 0.15}s`;
            minFrag.appendChild(circle);
        }
    });

    $.hexGroup.appendChild(hexFrag);
    $.minorityGroup.appendChild(minFrag);

    // ViewBox: pad around map bounds, then scale vertically to account for
    // toolbar + palette (172px of UI clearance) so the map doesn't hide behind UI.
    const padding = CONFIG.hexSize * 2;
    const cW = maxX - minX + padding * 2;
    const cH = maxY - minY + padding * 2;

    const vpH = window.innerHeight;
    const uiClearance = 172;
    const vScale = vpH / Math.max(vpH - uiClearance, 200);
    const h = cH * vScale;

    const vb = { x: minX - padding, y: minY - padding - (h - cH) / 2, w: cW, h };
    state.origViewBox = { ...vb };
    // If sidebar is open on desktop, offset center to account for panel width.
    if ($.sidebar?.classList.contains('open') && window.innerWidth > 900) {
        const scale = Math.min(window.innerWidth / vb.w, vpH / vb.h);
        vb.x += 350 / (2 * scale);
    }
    state.viewBox = { ...vb };
    $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    renderBorders($);
}

// ─── District Border Cache ───
// Stores built SVG groups and clip paths per district.
// Incremental updates only rebuild changed districts.
const _borderCache = {};

const _fmt = n => n.toFixed(2);
/** Quantized point key for segment adjacency matching (avoids floating-point mismatches). */
const _ptKey = p => `${(p.x * 100 + 0.5) | 0},${(p.y * 100 + 0.5) | 0}`;

/**
 * Builds the SVG group for one district's border:
 *   1. Finds boundary segments (hex edges between this district and another).
 *   2. Chains segments into continuous paths via an adjacency map.
 *   3. Creates a clip-path from the district's hex polygons so the border
 *      stroke stays inside the district region.
 *   4. Adds an MMD overlay path for majority-minority districts.
 */
function buildDistrictBorder(districtId) {
    const d = state.districts[districtId];
    if (!d || d.hexes.length === 0) return { group: null, clip: null };

    const segments = [];
    for (const hex of d.hexes) {
        const center = hexToPixel(hex.q, hex.r);
        const corners = hexCorners(center, CONFIG.hexSize);
        for (let i = 0; i < 6; i++) {
            const dir = HEX_DIRS[i];
            const neighbor = state.hexes.get(`${hex.q + dir.dq},${hex.r + dir.dr}`);
            if (!neighbor || neighbor.district !== hex.district) {
                segments.push({ c1: corners[i], c2: corners[(i + 1) % 6] });
            }
        }
    }

    if (segments.length === 0) return { group: null, clip: null };

    // Build adjacency map: point key -> list of {segment, far endpoint}.
    const adj = new Map();
    const addEdge = (key, seg, pt) => {
        let list = adj.get(key);
        if (!list) { list = []; adj.set(key, list); }
        list.push({ seg, pt });
    };
    for (const seg of segments) {
        seg._used = false;
        addEdge(_ptKey(seg.c1), seg, seg.c2);
        addEdge(_ptKey(seg.c2), seg, seg.c1);
    }

    // Chain unused segments into continuous SVG path data.
    let dAttr = '';
    for (const seg of segments) {
        if (seg._used) continue;
        seg._used = true;
        const chain = [seg.c1, seg.c2];

        // Extend chain forward (tail).
        let tailKey = _ptKey(chain[chain.length - 1]);
        let found = true;
        while (found) {
            found = false;
            const list = adj.get(tailKey);
            if (list) {
                for (let j = 0; j < list.length; j++) {
                    if (!list[j].seg._used) {
                        list[j].seg._used = true;
                        chain.push(list[j].pt);
                        tailKey = _ptKey(list[j].pt);
                        found = true;
                        break;
                    }
                }
            }
        }

        // Extend chain backward (head).
        let headKey = _ptKey(chain[0]);
        found = true;
        while (found) {
            found = false;
            const list = adj.get(headKey);
            if (list) {
                for (let j = 0; j < list.length; j++) {
                    if (!list[j].seg._used) {
                        list[j].seg._used = true;
                        chain.unshift(list[j].pt);
                        headKey = _ptKey(list[j].pt);
                        found = true;
                        break;
                    }
                }
            }
        }

        // Close path if endpoints coincide (within tolerance).
        const isClosed = chain.length > 2
            && Math.abs(chain[0].x - chain[chain.length - 1].x) < 0.1
            && Math.abs(chain[0].y - chain[chain.length - 1].y) < 0.1;
        if (isClosed) chain.pop();

        dAttr += `M ${_fmt(chain[0].x)},${_fmt(chain[0].y)} `;
        for (let k = 1; k < chain.length; k++) {
            dAttr += `L ${_fmt(chain[k].x)},${_fmt(chain[k].y)} `;
        }
        if (isClosed) dAttr += 'Z ';
    }

    const dAttrTrimmed = dAttr.trim();

    // Clip path: union of all hex polygons in the district.
    const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clip.id = `clip-d-${districtId}`;
    let clipD = '';
    for (const hex of d.hexes) {
        const center = hexToPixel(hex.q, hex.r);
        const corners = hexCorners(center, CONFIG.hexSize);
        clipD += `M ${_fmt(corners[0].x)},${_fmt(corners[0].y)} `;
        for (let c = 1; c < 6; c++) clipD += `L ${_fmt(corners[c].x)},${_fmt(corners[c].y)} `;
        clipD += 'Z ';
    }
    if (clipD) {
        const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        clipPath.setAttribute("d", clipD.trim());
        clip.appendChild(clipPath);
    }

    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
    group.dataset.districtId = districtId;

    const winner = d?.winner !== 'none' ? d.winner : 'none';
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", dAttrTrimmed);
    path.setAttribute("clip-path", `url(#clip-d-${districtId})`);
    path.style.stroke = _darken(_PALETTE[winner] || _PALETTE.none);
    path.classList.add('district-path', 'outline');
    group.appendChild(path);

    if (d?.isMinorityMajority) {
        const mmPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        mmPath.setAttribute("d", dAttrTrimmed);
        mmPath.setAttribute("clip-path", `url(#clip-d-${districtId})`);
        mmPath.classList.add('district-path', 'mmd-overlay');
        group.appendChild(mmPath);
    }

    return { group, clip };
}

/**
 * Renders district borders. Supports incremental updates: if `changedDistricts`
 * is provided, only those districts are rebuilt; otherwise full re-render.
 * Re-appends all groups in order so the current district renders on top.
 *
 * @param {Object} $ DOM cache
 * @param {Set<number>} [changedDistricts] Districts to rebuild (omit for full re-render)
 */
export function renderBorders($, changedDistricts) {
    const ids = changedDistricts
        ? [...changedDistricts]
        : Array.from({ length: CONFIG.numDistricts }, (_, i) => i + 1);

    if (!changedDistricts) {
        // Safe: only contains internally-generated SVG border elements.
        $.borderGroup.innerHTML = '';
        $.defs.innerHTML = '';
        for (let i = 1; i <= CONFIG.numDistricts; i++) _borderCache[i] = null;
    }

    for (const i of ids) {
        const old = _borderCache[i];
        if (old?.group?.parentNode) old.group.remove();
        if (old?.clip?.parentNode) old.clip.remove();

        _borderCache[i] = buildDistrictBorder(i);
        if (_borderCache[i].clip) $.defs.appendChild(_borderCache[i].clip);
    }

    // Append in district order; current district last for visual priority.
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const g = _borderCache[i]?.group;
        if (!g) continue;
        g.classList.toggle('active-district-group', i === state.currentDistrict);
        if (g.parentNode) g.remove();
        $.borderGroup.appendChild(g);
    }
}

/** Places numbered text labels at each non-empty district's centroid. */
export function renderDistrictLabels($) {
    if (!$.labelGroup) return;
    // Safe: only contains internally-generated SVG text elements.
    $.labelGroup.innerHTML = '';

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (!d || d.hexes.length === 0) continue;

        let cx = 0, cy = 0;
        for (const hex of d.hexes) {
            const p = hexToPixel(hex.q, hex.r);
            cx += p.x;
            cy += p.y;
        }
        cx /= d.hexes.length;
        cy /= d.hexes.length;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", cx);
        text.setAttribute("y", cy);
        text.classList.add('district-label');
        text.textContent = i;
        $.labelGroup.appendChild(text);
    }
}
