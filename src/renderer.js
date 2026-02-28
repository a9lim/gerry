// ─── SVG Rendering ───
import { CONFIG, HEX_DIRS, HEX_RENDER_SIZE } from './config.js';
import { hexToPixel, hexCorners, cornersToString } from './hex-math.js';
import { state, hexElements, activeColors } from './state.js';

let _cachedMinOpacity = 0.22;

export function refreshMinOpacity() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--hex-min-opacity');
    _cachedMinOpacity = parseFloat(val) || 0.22;
}

function hexOpacity(population) {
    return Math.max(_cachedMinOpacity, Math.min(1.0, _cachedMinOpacity + (1 - _cachedMinOpacity) * (population / state.maxPop)));
}

export function updateHexVisuals(qr) {
    const hex = state.hexes.get(qr);
    const g = hexElements.get(qr);
    if (g) {
        g.firstChild.style.fill = activeColors[hex.partyWinner];
        g.style.opacity = hexOpacity(hex.population);
    }
}

export function renderMap($) {
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
        poly.style.fill = activeColors[hex.partyWinner];

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

    const padding = CONFIG.hexSize * 2;
    const cW = maxX - minX + padding * 2;
    const cH = maxY - minY + padding * 2;

    const vpH = window.innerHeight;
    const uiClearance = 172;
    const vScale = vpH / Math.max(vpH - uiClearance, 200);
    const h = cH * vScale;

    const vb = { x: minX - padding, y: minY - padding - (h - cH) / 2, w: cW, h };
    state.origViewBox = { ...vb };
    if ($.sidebar?.classList.contains('open') && window.innerWidth > 900) {
        const scale = Math.min(window.innerWidth / vb.w, vpH / vb.h);
        vb.x += 350 / (2 * scale);
    }
    state.viewBox = { ...vb };
    $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    renderBorders($);
}

export function renderBorders($) {
    $.borderGroup.innerHTML = '';
    $.defs.innerHTML = '';

    const districtGroups = {};
    const districtSegments = {};
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        districtGroups[i] = document.createElementNS("http://www.w3.org/2000/svg", "g");
        districtGroups[i].dataset.districtId = i;
        districtSegments[i] = [];
    }

    state.hexes.forEach(hex => {
        if (hex.district === 0) return;
        const center = hexToPixel(hex.q, hex.r);
        const corners = hexCorners(center, CONFIG.hexSize);
        for (let i = 0; i < 6; i++) {
            const dir = HEX_DIRS[i];
            const neighbor = state.hexes.get(`${hex.q + dir.dq},${hex.r + dir.dr}`);
            if (!neighbor || neighbor.district !== hex.district) {
                districtSegments[hex.district].push({
                    c1: corners[i],
                    c2: corners[(i + 1) % 6]
                });
            }
        }
    });

    const fmt = n => n.toFixed(2);
    const ptKey = p => `${(p.x * 100 + 0.5) | 0},${(p.y * 100 + 0.5) | 0}`;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const segments = districtSegments[i];
        if (segments.length === 0) continue;

        const adj = new Map();
        const addEdge = (key, seg, pt) => {
            let list = adj.get(key);
            if (!list) { list = []; adj.set(key, list); }
            list.push({ seg, pt });
        };
        for (const seg of segments) {
            seg._used = false;
            addEdge(ptKey(seg.c1), seg, seg.c2);
            addEdge(ptKey(seg.c2), seg, seg.c1);
        }

        let dAttr = '';
        for (const seg of segments) {
            if (seg._used) continue;
            seg._used = true;
            const chain = [seg.c1, seg.c2];

            let tailKey = ptKey(chain[chain.length - 1]);
            let found = true;
            while (found) {
                found = false;
                const list = adj.get(tailKey);
                if (list) {
                    for (let j = 0; j < list.length; j++) {
                        if (!list[j].seg._used) {
                            list[j].seg._used = true;
                            chain.push(list[j].pt);
                            tailKey = ptKey(list[j].pt);
                            found = true;
                            break;
                        }
                    }
                }
            }

            let headKey = ptKey(chain[0]);
            found = true;
            while (found) {
                found = false;
                const list = adj.get(headKey);
                if (list) {
                    for (let j = 0; j < list.length; j++) {
                        if (!list[j].seg._used) {
                            list[j].seg._used = true;
                            chain.unshift(list[j].pt);
                            headKey = ptKey(list[j].pt);
                            found = true;
                            break;
                        }
                    }
                }
            }

            const isClosed = chain.length > 2
                && Math.abs(chain[0].x - chain[chain.length - 1].x) < 0.1
                && Math.abs(chain[0].y - chain[chain.length - 1].y) < 0.1;
            if (isClosed) chain.pop();

            dAttr += `M ${fmt(chain[0].x)},${fmt(chain[0].y)} `;
            for (let k = 1; k < chain.length; k++) {
                dAttr += `L ${fmt(chain[k].x)},${fmt(chain[k].y)} `;
            }
            if (isClosed) dAttr += 'Z ';
        }

        const dAttrTrimmed = dAttr.trim();

        const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
        clip.id = `clip-d-${i}`;

        let clipD = '';
        state.districts[i].hexes.forEach(hex => {
            const center = hexToPixel(hex.q, hex.r);
            const corners = hexCorners(center, CONFIG.hexSize);
            clipD += `M ${fmt(corners[0].x)},${fmt(corners[0].y)} `;
            for (let c = 1; c < 6; c++) clipD += `L ${fmt(corners[c].x)},${fmt(corners[c].y)} `;
            clipD += 'Z ';
        });

        if (clipD) {
            const clipPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            clipPath.setAttribute("d", clipD.trim());
            clip.appendChild(clipPath);
        }
        $.defs.appendChild(clip);

        const d = state.districts[i];
        const winner = d?.winner !== 'none' ? d.winner : 'none';

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", dAttrTrimmed);
        path.setAttribute("clip-path", `url(#clip-d-${i})`);
        path.style.stroke = _darken(activeColors[winner] || activeColors.none);
        path.classList.add('district-path', 'outline');
        districtGroups[i].appendChild(path);

        if (d?.isMinorityMajority) {
            const mmPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            mmPath.setAttribute("d", dAttrTrimmed);
            mmPath.setAttribute("clip-path", `url(#clip-d-${i})`);
            mmPath.classList.add('district-path', 'mmd-overlay');
            districtGroups[i].appendChild(mmPath);
        }
    }

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        if (i !== state.currentDistrict) {
            $.borderGroup.appendChild(districtGroups[i]);
        }
    }
    if (districtGroups[state.currentDistrict]) {
        districtGroups[state.currentDistrict].classList.add('active-district-group');
        $.borderGroup.appendChild(districtGroups[state.currentDistrict]);
    }
}

export function renderDistrictLabels($) {
    if (!$.labelGroup) return;
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
