const CONFIG = {
    numDistricts: 10,
    rows: 18,
    cols: 25,
    hexSize: 18,
    colors: {
        red: { base: '#ff3b30', dark: '#8b0000', light: '#ff9999', muted: '#ffb3b0', district: '#ff3b30' },
        blue: { base: '#007aff', dark: '#002266', light: '#99ccff', muted: '#b3d7ff', district: '#007aff' },
        yellow: { base: '#ffcc00', dark: '#806600', light: '#ffe680', muted: '#fff0b3', district: '#ffcc00' },
        none: { base: '#d1d5db', dark: '#374151', light: '#e5e7eb', muted: '#f3f4f6', district: '#9ca3af' },
        minority: '#1b8a3a'
    }
};

const state = {
    hexes: new Map(),
    districts: {},
    districtColors: [],
    currentDistrict: 1,
    isPainting: false,
    hoveredHex: null,
    targetPop: 0,
    isDarkMode: false,
    // Zoom/Pan
    viewBox: { x: 0, y: 0, w: 0, h: 0 },
    origViewBox: { x: 0, y: 0, w: 0, h: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    zoomLevel: 1,
    // Undo/Redo
    undoStack: [],
    redoStack: []
};

// ─── Hex Math ───
function hexToPixel(q, r) {
    const w = Math.sqrt(3) * CONFIG.hexSize;
    const h = 2 * CONFIG.hexSize;
    return { x: w * (q + r / 2), y: h * (3 / 4) * r };
}

function hexCorners(center, size) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle_rad = Math.PI / 180 * (60 * i - 30);
        corners.push({ x: center.x + size * Math.cos(angle_rad), y: center.y + size * Math.sin(angle_rad) });
    }
    return corners;
}

function cornersToString(corners) {
    return corners.map(c => `${c.x},${c.y}`).join(' ');
}

// ─── Init ───
function init() {
    generateHexes();
    setupUI();
    state.targetPop = Math.round(Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts);
    renderMap();
    updateMetrics();
    pushUndoSnapshot();
}

function generateHexes() {
    let idCounter = 0;
    const centerX = CONFIG.cols / 2;
    const centerY = CONFIG.rows / 2;
    const maxRadius = Math.min(CONFIG.cols, CONFIG.rows) / 2 + 1;

    for (let r = 0; r < CONFIG.rows; r++) {
        let r_offset = Math.floor(r / 2);
        for (let q = -r_offset; q < CONFIG.cols - r_offset; q++) {
            let y = r, x = q + r_offset;
            let dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            let angle = Math.atan2(y - centerY, x - centerX);
            let noise = Math.sin(angle * 3) * 2 + Math.cos(angle * 5) * 1.5;
            if (dist > maxRadius + noise) continue;

            let pop = Math.floor(Math.random() * 80) + 20;
            let pR = 0, pB = 0, pY = 0;
            let bias = Math.random();
            if (bias < 0.45) { pR = pop * (0.6 + Math.random() * 0.4); pB = pop - pR; }
            else if (bias < 0.9) { pB = pop * (0.6 + Math.random() * 0.4); pR = pop - pB; }
            else { pY = pop * (0.5 + Math.random() * 0.5); pR = (pop - pY) / 2; pB = pR; }

            let hex = {
                id: ++idCounter, q, r, s: -q - r,
                population: pop,
                votes: { red: pR, blue: pB, yellow: pY },
                minority: Math.random() < 0.25,
                district: 0
            };
            hex.partyWinner = getHexWinner(hex);
            state.hexes.set(`${q},${r}`, hex);
        }
    }
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = { id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 }, hexes: [], minorityPop: 0, isContiguous: true, compactness: 0, winner: 'none' };
    }
    calculateMetrics();
}

function getHexWinner(hex) {
    let max = Math.max(hex.votes.red, hex.votes.blue, hex.votes.yellow);
    if (max === hex.votes.red) return 'red';
    if (max === hex.votes.blue) return 'blue';
    return 'yellow';
}

// ─── Undo/Redo ───
function getSnapshot() {
    const snap = {};
    state.hexes.forEach((hex, key) => { snap[key] = hex.district; });
    return snap;
}

function restoreSnapshot(snap) {
    for (const [key, districtId] of Object.entries(snap)) {
        const hex = state.hexes.get(key);
        if (hex) hex.district = districtId;
    }
    calculateMetrics();
    state.hexes.forEach((hex, qr) => updateHexVisuals(qr));
    renderBorders();
    updateMetrics();
}

function pushUndoSnapshot() {
    state.undoStack.push(getSnapshot());
    state.redoStack = [];
    if (state.undoStack.length > 50) state.undoStack.shift();
}

function undo() {
    if (state.undoStack.length <= 1) return;
    state.redoStack.push(state.undoStack.pop());
    restoreSnapshot(state.undoStack[state.undoStack.length - 1]);
}

function redo() {
    if (state.redoStack.length === 0) return;
    const snap = state.redoStack.pop();
    state.undoStack.push(snap);
    restoreSnapshot(snap);
}

// ─── UI Setup ───
function setupUI() {
    const selector = document.getElementById('district-selector');
    if (selector) selector.innerHTML = '';

    const svg = document.getElementById('hex-map');
    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('mouseleave', onMouseUp);
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', e => e.preventDefault());

    // Header buttons
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetMap);

    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undo);

    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });
}

function toggleTheme() {
    state.isDarkMode = !state.isDarkMode;
    document.body.classList.toggle('dark', state.isDarkMode);
    document.getElementById('theme-toggle').textContent = state.isDarkMode ? '☀️ Light Mode' : '🌙 Dark Mode';
    renderBorders();
}

function resetMap() {
    state.hexes.forEach(hex => { hex.district = 0; });
    calculateMetrics();
    state.hexes.forEach((hex, qr) => updateHexVisuals(qr));
    renderBorders();
    updateMetrics();
    pushUndoSnapshot();
}

// ─── Zoom & Pan ───
function onWheel(e) {
    e.preventDefault();
    const svg = document.getElementById('hex-map');
    const vb = state.viewBox;

    // Get cursor position in SVG coordinates
    const rect = svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const svgX = vb.x + mx * vb.w;
    const svgY = vb.y + my * vb.h;

    const zoomFactor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const newW = vb.w * zoomFactor;
    const newH = vb.h * zoomFactor;

    // Clamp zoom
    const minW = state.origViewBox.w * 0.3;
    const maxW = state.origViewBox.w * 3;
    if (newW < minW || newW > maxW) return;

    vb.x = svgX - mx * newW;
    vb.y = svgY - my * newH;
    vb.w = newW;
    vb.h = newH;
    state.zoomLevel = state.origViewBox.w / vb.w;

    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
}

function onMouseDown(e) {
    if (e.button === 1) {
        // Middle click: pan
        e.preventDefault();
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        document.getElementById('map-container').classList.add('panning');
        return;
    }
    startPainting(e);
}

function onMouseUp(e) {
    if (state.isPanning) {
        state.isPanning = false;
        document.getElementById('map-container').classList.remove('panning');
        return;
    }
    stopPainting();
}

function onMouseMove(e) {
    if (state.isPanning) {
        const svg = document.getElementById('hex-map');
        const rect = svg.getBoundingClientRect();
        const dx = (e.clientX - state.panStart.x) / rect.width * state.viewBox.w;
        const dy = (e.clientY - state.panStart.y) / rect.height * state.viewBox.h;
        state.viewBox.x -= dx;
        state.viewBox.y -= dy;
        state.panStart = { x: e.clientX, y: e.clientY };
        svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
        return;
    }
    // Normal hex hover
    const qr = getHexFromEvent(e);
    if (qr) handleHover(e, qr);
}

// ─── Painting ───
function startPainting(e) {
    e.preventDefault();
    const qr = getHexFromEvent(e);
    if (!qr) return;
    const hex = state.hexes.get(qr);

    if (e.button === 2) {
        state.isPainting = 'erase';
    } else if (e.button === 0) {
        if (hex.district > 0) {
            state.isPainting = hex.district;
        } else {
            let usedDistricts = new Set();
            state.hexes.forEach(h => { if (h.district > 0) usedDistricts.add(h.district); });
            let nextId = 0;
            for (let i = 1; i <= CONFIG.numDistricts; i++) {
                if (!usedDistricts.has(i)) { nextId = i; break; }
            }
            if (nextId > 0) state.isPainting = nextId;
            else return;
        }
    }
    state.currentDistrict = typeof state.isPainting === 'number' ? state.isPainting : state.currentDistrict;
    paintHex(e);
    updateSidebarDetails(state.currentDistrict);
}

function stopPainting() {
    if (state.isPainting !== false) {
        state.isPainting = false;
        calculateMetrics();
        renderBorders();
        updateMetrics();
        pushUndoSnapshot();
    }
}

function getHexFromEvent(e) {
    let target = e.target;
    if (target.tagName !== 'polygon' && target.tagName !== 'g') {
        const parent = target.closest('.hex');
        if (parent) target = parent;
    } else if (target.tagName === 'polygon') {
        target = target.parentNode;
    }
    if (target && target.classList && target.classList.contains('hex')) return target.dataset.qr;
    return null;
}

function paintHex(e) {
    if (state.isPainting === false) return;
    const qr = getHexFromEvent(e);
    if (!qr) return;
    const hex = state.hexes.get(qr);
    let targetDistrict = state.isPainting === 'erase' ? 0 : state.isPainting;

    // Population cap (allow up to 10% over target)
    if (targetDistrict > 0 && hex.district !== targetDistrict && state.targetPop > 0) {
        let currentPop = 0;
        state.hexes.forEach(h => { if (h.district === targetDistrict) currentPop += h.population; });
        if (currentPop + hex.population > state.targetPop * 1.1) return;
    }

    if (hex.district !== targetDistrict) {
        hex.district = targetDistrict;
        updateHexVisuals(qr);
    }
}

function handleHover(e, qr) {
    if (state.hoveredHex !== qr) {
        if (state.hoveredHex) {
            const oldEl = document.querySelector(`.hex[data-qr="${state.hoveredHex}"]`);
            if (oldEl) oldEl.classList.remove('hovered');
        }
        state.hoveredHex = qr;
        if (qr) {
            const el = document.querySelector(`.hex[data-qr="${qr}"]`);
            if (el) el.classList.add('hovered');
        }
    }
    if (state.isPainting) {
        paintHex(e);
        updateMetrics();
    }
}

// ─── Rendering ───
function getPartyColor(party, isMuted) {
    return CONFIG.colors[party][isMuted ? 'muted' : 'base'];
}

function updateHexVisuals(qr) {
    const hex = state.hexes.get(qr);
    const g = document.querySelector(`.hex[data-qr="${qr}"]`);
    if (g) {
        g.querySelector('polygon').style.fill = getPartyColor(hex.partyWinner, false);
        g.style.opacity = Math.max(0.3, Math.min(1.0, hex.population / 100));
    }
}

function renderMap() {
    const hexGroup = document.getElementById('hex-group');
    const minorityGroup = document.getElementById('minority-group');
    hexGroup.innerHTML = '';
    minorityGroup.innerHTML = '';

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    state.hexes.forEach(hex => {
        const center = hexToPixel(hex.q, hex.r);
        minX = Math.min(minX, center.x); maxX = Math.max(maxX, center.x);
        minY = Math.min(minY, center.y); maxY = Math.max(maxY, center.y);

        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.classList.add('hex');
        g.dataset.qr = `${hex.q},${hex.r}`;
        g.style.opacity = Math.max(0.3, Math.min(1.0, hex.population / 100));

        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", cornersToString(hexCorners(center, CONFIG.hexSize)));
        poly.style.fill = getPartyColor(hex.partyWinner, false);
        g.appendChild(poly);

        g.addEventListener('mousemove', (e) => handleHover(e, `${hex.q},${hex.r}`));
        g.addEventListener('mousedown', (e) => handleHover(e, `${hex.q},${hex.r}`));
        hexGroup.appendChild(g);

        if (hex.minority) {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", center.x);
            circle.setAttribute("cy", center.y);
            circle.setAttribute("r", CONFIG.hexSize * 0.25);
            circle.classList.add('minority-marker');
            minorityGroup.appendChild(circle);
        }
    });

    const svg = document.getElementById('hex-map');
    const padding = CONFIG.hexSize * 2;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const vb = { x: minX - padding, y: minY - padding, w, h };
    state.viewBox = { ...vb };
    state.origViewBox = { ...vb };
    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    renderBorders();
}

function renderBorders() {
    const borderGroup = document.getElementById('border-group');
    borderGroup.innerHTML = '';

    const directions = [
        { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 },
        { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }
    ];

    const districtGroups = {};
    const districtPaths = {};
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
        g.dataset.districtId = i;
        districtGroups[i] = g;
        districtPaths[i] = [];
    }

    state.hexes.forEach(hex => {
        if (hex.district === 0) return;
        const center = hexToPixel(hex.q, hex.r);
        const corners = hexCorners(center, CONFIG.hexSize);
        for (let i = 0; i < 6; i++) {
            const nQ = hex.q + directions[i].dq;
            const nR = hex.r + directions[i].dr;
            const neighbor = state.hexes.get(`${nQ},${nR}`);
            if (!neighbor || neighbor.district !== hex.district) {
                const inset = 0.15;
                const c1 = { x: corners[i].x + (center.x - corners[i].x) * inset, y: corners[i].y + (center.y - corners[i].y) * inset };
                const c2 = { x: corners[(i + 1) % 6].x + (center.x - corners[(i + 1) % 6].x) * inset, y: corners[(i + 1) % 6].y + (center.y - corners[(i + 1) % 6].y) * inset };
                districtPaths[hex.district].push({ c1, c2 });
            }
        }
    });

    const fmt = n => n.toFixed(2);

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const segments = districtPaths[i];
        if (segments.length === 0) continue;

        let dAttr = '';
        segments.forEach(seg => {
            dAttr += `M ${fmt(seg.c1.x)},${fmt(seg.c1.y)} L ${fmt(seg.c2.x)},${fmt(seg.c2.y)} `;
        });

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", dAttr.trim());

        const d = state.districts[i];
        let winner = d && d.winner !== 'none' ? d.winner : 'none';

        // Adaptive outline colors
        const colorKey = state.isDarkMode ? 'light' : 'dark';
        if (winner === 'red') path.style.stroke = CONFIG.colors.red[colorKey];
        else if (winner === 'blue') path.style.stroke = CONFIG.colors.blue[colorKey];
        else if (winner === 'yellow') path.style.stroke = CONFIG.colors.yellow[colorKey];
        else path.style.stroke = CONFIG.colors.none[colorKey];

        const isMM = d && d.isMinorityMajority;

        path.classList.add('district-path', 'outline');
        // Minority-majority: dotted border but keep party color
        if (isMM) path.classList.add('minority-majority');

        districtGroups[i].appendChild(path);
    }

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        if (i !== state.currentDistrict && districtGroups[i]) {
            borderGroup.appendChild(districtGroups[i]);
        }
    }
    if (districtGroups[state.currentDistrict]) {
        districtGroups[state.currentDistrict].classList.add('active-district-group');
        borderGroup.appendChild(districtGroups[state.currentDistrict]);
    }
}

// ─── Metrics ───
function calculateMetrics() {
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = { id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 }, hexes: [], minorityPop: 0, isContiguous: false, compactness: 0, winner: 'none', isMinorityMajority: false };
    }
    state.hexes.forEach(hex => {
        const d = state.districts[hex.district];
        if (d) {
            d.population += hex.population;
            d.votes.red += hex.votes.red;
            d.votes.blue += hex.votes.blue;
            d.votes.yellow += hex.votes.yellow;
            if (hex.minority) d.minorityPop += hex.population;
            d.hexes.push(hex);
        }
    });
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            let max = Math.max(d.votes.red, d.votes.blue, d.votes.yellow);
            if (max === d.votes.red) d.winner = 'red';
            else if (max === d.votes.blue) d.winner = 'blue';
            else d.winner = 'yellow';
            d.isMinorityMajority = (d.minorityPop / d.population) > 0.5;
            d.isContiguous = checkContiguity(d);
            d.compactness = calculateCompactness(d);
        }
    }
}

function checkContiguity(d) {
    if (d.hexes.length === 0) return true;
    let visited = new Set();
    let queue = [d.hexes[0]];
    visited.add(d.hexes[0].id);
    const dirs = [{ dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }];
    let count = 0;
    while (queue.length > 0) {
        let curr = queue.shift();
        count++;
        for (let i = 0; i < 6; i++) {
            let neighbor = state.hexes.get(`${curr.q + dirs[i].dq},${curr.r + dirs[i].dr}`);
            if (neighbor && neighbor.district === d.id && !visited.has(neighbor.id)) {
                visited.add(neighbor.id);
                queue.push(neighbor);
            }
        }
    }
    return count === d.hexes.length;
}

function calculateCompactness(d) {
    if (d.hexes.length === 0) return 0;
    let perimeter = 0;
    const dirs = [{ dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 }, { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }];
    d.hexes.forEach(hex => {
        for (let i = 0; i < 6; i++) {
            let neighbor = state.hexes.get(`${hex.q + dirs[i].dq},${hex.r + dirs[i].dr}`);
            if (!neighbor || neighbor.district !== d.id) perimeter++;
        }
    });
    if (perimeter === 0) return 100;
    return Math.min(100, Math.round((32.648 * d.hexes.length) / (perimeter * perimeter) * 100));
}

// ─── Efficiency Gap ───
function calculateEfficiencyGap() {
    // Calculate for Red vs Blue (the two major parties)
    let wastedRed = 0, wastedBlue = 0, totalVotes = 0;
    let numActiveDistricts = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        numActiveDistricts++;

        const redV = d.votes.red;
        const blueV = d.votes.blue;
        const districtTotal = redV + blueV; // Only count 2-party votes
        if (districtTotal === 0) continue;

        totalVotes += districtTotal;
        const threshold = Math.floor(districtTotal / 2) + 1;

        if (redV > blueV) {
            // Red wins
            wastedRed += redV - threshold; // surplus
            wastedBlue += blueV; // all blue votes wasted
        } else {
            // Blue wins
            wastedBlue += blueV - threshold;
            wastedRed += redV;
        }
    }

    if (totalVotes === 0 || numActiveDistricts < 2) return null;
    return (wastedRed - wastedBlue) / totalVotes; // positive = favors Blue, negative = favors Red
}

// ─── Update UI ───
function updateMetrics() {
    calculateMetrics();
    renderBorders();

    let seats = { red: 0, blue: 0, yellow: 0 };
    let mmdCount = 0;
    let activeDistrictCount = 0;
    let unassignedCount = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            activeDistrictCount++;
            if (d.winner !== 'none') seats[d.winner]++;
            if (d.isMinorityMajority) mmdCount++;
        }
    }

    state.hexes.forEach(hex => { if (hex.district === 0) unassignedCount++; });

    document.getElementById('red-seats').innerText = seats.red + (seats.red === 1 ? ' Seat' : ' Seats');
    document.getElementById('blue-seats').innerText = seats.blue + (seats.blue === 1 ? ' Seat' : ' Seats');
    document.getElementById('mmd-count').innerText = `${mmdCount} / 2 min`;
    document.getElementById('district-count').innerText = `${activeDistrictCount} / ${CONFIG.numDistricts}`;
    document.getElementById('unassigned-count').innerText = unassignedCount.toLocaleString();

    // Efficiency Gap
    const eg = calculateEfficiencyGap();
    const egEl = document.getElementById('efficiency-gap');
    if (eg !== null) {
        const pct = (eg * 100).toFixed(1);
        const direction = eg > 0 ? '→ Blue' : '→ Red';
        egEl.innerText = `${Math.abs(pct)}% ${direction}`;
        egEl.style.color = Math.abs(eg) > 0.07 ? 'var(--party-red)' : 'var(--text-bright)';
    } else {
        egEl.innerText = '—';
        egEl.style.color = 'var(--text-muted)';
    }

    updateSidebarDetails(state.currentDistrict);
}

function updateSidebarDetails(dId) {
    const d = state.districts[dId];
    if (!d || d.population === 0) {
        document.getElementById('selected-district-info').classList.add('hidden');
        document.getElementById('no-selection-msg').classList.remove('hidden');
        return;
    }

    document.getElementById('selected-district-info').classList.remove('hidden');
    document.getElementById('no-selection-msg').classList.add('hidden');

    document.getElementById('detail-title').innerText = `District ${d.id}`;

    if (state.targetPop > 0 && d.population > 0) {
        const dev = Math.abs((d.population - state.targetPop) / state.targetPop);
        if (dev > 0.1 || !d.isContiguous) {
            document.getElementById('detail-title').innerText += ' ⚠️';
            document.getElementById('detail-title').style.color = 'var(--party-red)';
        } else {
            document.getElementById('detail-title').style.color = 'inherit';
        }
    }

    const wSpan = document.getElementById('detail-winner');
    wSpan.innerText = d.winner.charAt(0).toUpperCase() + d.winner.slice(1);
    wSpan.style.color = d.winner !== 'none' ? CONFIG.colors[d.winner].base : 'var(--text-muted)';

    const totalVotes = d.votes.red + d.votes.blue + d.votes.yellow;
    if (totalVotes > 0) {
        let votesArr = [d.votes.red, d.votes.blue, d.votes.yellow].sort((a, b) => b - a);
        document.getElementById('detail-margin').innerText = `+${((votesArr[0] - votesArr[1]) / totalVotes * 100).toFixed(1)}%`;
    } else {
        document.getElementById('detail-margin').innerText = '-';
    }

    document.getElementById('detail-pop').innerText = Math.round(d.population).toLocaleString();
    document.getElementById('target-pop').innerText = state.targetPop.toLocaleString();

    if (state.targetPop > 0) {
        let dev = ((d.population - state.targetPop) / state.targetPop) * 100;
        let devEl = document.getElementById('detail-deviation');
        devEl.innerText = `${dev > 0 ? '+' : ''}${dev.toFixed(1)}%`;
        devEl.style.color = Math.abs(dev) > 10 ? 'var(--party-red)' : 'var(--text-muted)';
    }

    document.getElementById('detail-compactness').innerText = `${d.compactness}%`;

    const cont = document.getElementById('detail-contiguous');
    cont.innerText = d.isContiguous ? 'Yes' : 'No';
    cont.style.color = d.isContiguous ? 'var(--minority-color)' : 'var(--party-red)';

    const mmEl = document.getElementById('detail-mm');
    if (mmEl) {
        mmEl.innerText = d.isMinorityMajority ? 'Yes' : 'No';
        mmEl.style.color = d.isMinorityMajority ? 'var(--minority-color)' : 'var(--text-muted)';
    }

    if (totalVotes > 0) {
        const pR = (d.votes.red / totalVotes) * 100;
        const pB = (d.votes.blue / totalVotes) * 100;
        const pY = (d.votes.yellow / totalVotes) * 100;
        document.getElementById('vote-bar-red').style.width = `${pR}%`;
        document.getElementById('vote-bar-blue').style.width = `${pB}%`;
        document.getElementById('vote-bar-yellow').style.width = `${pY}%`;
        document.getElementById('vote-pct-red').innerText = `${Math.round(pR)}% Red`;
        document.getElementById('vote-pct-blue').innerText = `${Math.round(pB)}% Blue`;
        document.getElementById('vote-pct-yellow').innerText = `${Math.round(pY)}% Yell`;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', init);
