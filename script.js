// ─── Configuration ───
const CONFIG = {
    numDistricts: 10,
    rows: 18,
    cols: 25,
    hexSize: 18,
};

// ─── Precomputed Constants ───
const SQRT3 = Math.sqrt(3);
const HEX_W = SQRT3 * CONFIG.hexSize;
const HEX_H = 1.5 * CONFIG.hexSize;

const HEX_DIRS = [
    { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 },
    { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }
];

const HEX_CORNER_OFFSETS = Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 180 * (60 * i - 30);
    return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

const HEX_RENDER_SIZE = CONFIG.hexSize + 0.5; // slight overlap to eliminate AA seams

const PALETTE_COLOR_MAP = {
    red: 'var(--party-red)',
    blue: 'var(--party-blue)',
    yellow: 'var(--party-yellow)'
};

// ─── Cubic Bezier Easing (matches CSS cubic-bezier) ───
function cubicBezier(x1, y1, x2, y2) {
    return function(t) {
        if (t <= 0) return 0;
        if (t >= 1) return 1;
        let u = t;
        for (let i = 0; i < 8; i++) {
            const a = 1 - u;
            const xu = 3 * a * a * u * x1 + 3 * a * u * u * x2 + u * u * u - t;
            const dxu = 3 * a * a * x1 + 6 * a * u * (x2 - x1) + 3 * u * u * (1 - x2);
            if (Math.abs(dxu) < 1e-6) break;
            u -= xu / dxu;
        }
        u = Math.max(0, Math.min(1, u));
        const a = 1 - u;
        return 3 * a * a * u * y1 + 3 * a * u * u * y2 + u * u * u;
    };
}
const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);

// ─── DOM Cache ───
const $ = {};

function cacheDOMElements() {
    $.svg = document.getElementById('hex-map');
    $.hexGroup = document.getElementById('hex-group');
    $.borderGroup = document.getElementById('border-group');
    $.minorityGroup = document.getElementById('minority-group');
    $.labelGroup = document.getElementById('label-group');
    $.mapContainer = document.getElementById('map-container');
    $.tooltip = document.getElementById('hex-tooltip');
    $.sidebar = document.getElementById('sidebar');
    $.palette = document.getElementById('district-palette');
    $.undoBtn = document.getElementById('undo-btn');
    $.redoBtn = document.getElementById('redo-btn');
    $.deleteBtn = document.getElementById('delete-btn');
    $.eraseBtn = document.getElementById('erase-btn');
    $.moveBtn = document.getElementById('move-btn');
    $.themeBtn = document.getElementById('theme-btn');
    $.statsToggle = document.getElementById('stats-toggle');
    $.closeStats = document.getElementById('close-stats');
    $.zoomLevel = document.getElementById('zoom-level');
    $.introScreen = document.getElementById('intro-screen');
    $.introStart = document.getElementById('intro-start');
    $.resetBtn = document.getElementById('reset-btn');
    $.randomizeBtn = document.getElementById('randomize-btn');
    $.zoomInBtn = document.getElementById('zoom-in-btn');
    $.zoomOutBtn = document.getElementById('zoom-out-btn');
    $.zoomFitBtn = document.getElementById('zoom-fit-btn');

    // Stats elements
    $.redSeats = document.getElementById('red-seats');
    $.blueSeats = document.getElementById('blue-seats');
    $.yellowSeats = document.getElementById('yellow-seats');
    $.mmdCount = document.getElementById('mmd-count');
    $.districtCount = document.getElementById('district-count');
    $.efficiencyGap = document.getElementById('efficiency-gap');
    $.egNote = document.getElementById('eg-note');

    // District detail elements
    $.selectedInfo = document.getElementById('selected-district-info');
    $.noSelectionMsg = document.getElementById('no-selection-msg');
    $.detailTitle = document.getElementById('detail-title');
    $.detailWinner = document.getElementById('detail-winner');
    $.detailMargin = document.getElementById('detail-margin');
    $.detailPop = document.getElementById('detail-pop');
    $.targetPop = document.getElementById('target-pop');
    $.detailDeviation = document.getElementById('detail-deviation');
    $.detailCompactness = document.getElementById('detail-compactness');
    $.detailContiguous = document.getElementById('detail-contiguous');
    $.detailMm = document.getElementById('detail-mm');

    // Vote bars
    $.voteBarRed = document.getElementById('vote-bar-red');
    $.voteBarBlue = document.getElementById('vote-bar-blue');
    $.voteBarYellow = document.getElementById('vote-bar-yellow');
    $.votePctRed = document.getElementById('vote-pct-red');
    $.votePctBlue = document.getElementById('vote-pct-blue');
    $.votePctYellow = document.getElementById('vote-pct-yellow');

    // Proportionality elements (keyed by party)
    $.prop = {};
    for (const party of ['red', 'blue', 'yellow']) {
        $.prop[party] = {
            votes: document.getElementById(`prop-${party}-votes`),
            seats: document.getElementById(`prop-${party}-seats`),
            votePct: document.getElementById(`prop-${party}-vote-pct`),
            seatPct: document.getElementById(`prop-${party}-seat-pct`)
        };
    }

    // Create SVG defs element once
    $.defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    $.defs.id = 'map-defs';
    $.svg.insertBefore($.defs, $.svg.firstChild);
}

// ─── Hex Element Index (avoids querySelector on every hover/paint) ───
const hexElements = new Map();

// Party/accent colors — shared across themes, no longer swapped
const activeColors = _PALETTE;

const state = {
    hexes: new Map(),
    districts: {},
    districtColors: [],
    currentDistrict: 1,
    isPainting: false,
    hoveredHex: null,
    targetPop: 0,
    viewBox: { x: 0, y: 0, w: 0, h: 0 },
    origViewBox: { x: 0, y: 0, w: 0, h: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    zoomLevel: 1,
    undoStack: [],
    redoStack: [],
    deleteMode: false,
    eraseMode: false,
    panMode: false,
    maxPop: 100
};

// ─── Hex Math ───
function hexToPixel(q, r) {
    return { x: HEX_W * (q + r / 2), y: HEX_H * r };
}

function hexCorners(center, size) {
    return HEX_CORNER_OFFSETS.map(o => ({
        x: center.x + size * o.dx,
        y: center.y + size * o.dy
    }));
}

function cornersToString(corners) {
    return corners.map(c => `${c.x},${c.y}`).join(' ');
}

function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

// ─── Animation Utilities ───
const animatedCounters = {};

function animateValue(el, end, duration, formatFn = Math.round, id) {
    if (!el) return;
    const start = el._currentVal || 0;
    if (start === end) {
        el.textContent = formatFn(end);
        el._currentVal = end;
        return;
    }

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4);
        const current = progress < 1 ? start + (end - start) * ease : end;

        el.textContent = formatFn(current);
        el._currentVal = current;

        if (progress < 1) {
            animatedCounters[id] = requestAnimationFrame(step);
        }
    };
    if (animatedCounters[id]) cancelAnimationFrame(animatedCounters[id]);
    animatedCounters[id] = requestAnimationFrame(step);
}

// ─── Init ───
function init() {
    refreshMinOpacity();
    if ($.mapContainer) $.mapContainer.classList.add('paused');
    generateHexes();
    setupUI();
    state.targetPop = Math.round(
        Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts
    );
    renderMap();
    updateMetrics();
    pushUndoSnapshot();
}

// ─── Noise Functions ───
function hashNoise(x, y, seed) {
    let n = Math.sin(x * 127.1 + y * 311.7 + seed * 53.3) * 43758.5453;
    return n - Math.floor(n);
}

function smoothNoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const n00 = hashNoise(ix, iy, seed);
    const n10 = hashNoise(ix + 1, iy, seed);
    const n01 = hashNoise(ix, iy + 1, seed);
    const n11 = hashNoise(ix + 1, iy + 1, seed);
    return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

function fbmNoise(x, y, seed, octaves = 4) {
    let value = 0, amplitude = 1, frequency = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        value += smoothNoise(x * frequency, y * frequency, seed + i * 100) * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return value / total;
}

// ─── Hex Generation ───
function generateHexes() {
    let idCounter = 0;
    const centerX = CONFIG.cols / 2;
    const centerY = CONFIG.rows / 2;
    const maxRadius = Math.min(CONFIG.cols, CONFIG.rows) / 2 + 1;

    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const freq1 = 2 + Math.random() * 4;
    const freq2 = 3 + Math.random() * 5;
    const amp1 = 1 + Math.random() * 2;
    const amp2 = 0.5 + Math.random() * 2;
    const baseRadius = maxRadius * (0.75 + Math.random() * 0.15);

    const validCoords = [];
    for (let r = 0; r < CONFIG.rows; r++) {
        const r_offset = Math.floor(r / 2);
        for (let q = -r_offset; q < CONFIG.cols - r_offset; q++) {
            const y = r, x = q + r_offset;
            const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
            const angle = Math.atan2(y - centerY, x - centerX);
            const noise = Math.sin(angle * freq1 + phase1) * amp1 + Math.cos(angle * freq2 + phase2) * amp2;
            if (dist <= baseRadius + noise) {
                validCoords.push({ q, r, x, y, dist });
            }
        }
    }

    const noiseSeed = Math.random() * 10000;
    const partySeed = Math.random() * 10000;
    const minoritySeed = Math.random() * 10000;

    // Population centers
    const numLargeCities = Math.floor(Math.random() * 2) + 2;
    const numSmallTowns = Math.floor(Math.random() * 6) + 5;
    const numSuburbs = Math.floor(Math.random() * 4) + 3;
    const centers = [];

    for (let i = 0; i < numLargeCities; i++) {
        const c = validCoords[Math.floor(Math.random() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: Math.random() * 600 + 350, decay: Math.random() * 1.8 + 1.2, type: 'city' });
    }
    for (let i = 0; i < numSuburbs; i++) {
        const city = centers[Math.floor(Math.random() * Math.min(centers.length, numLargeCities))];
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.5 + Math.random() * 4;
        centers.push({
            q: city.q + Math.round(Math.cos(angle) * dist),
            r: city.r + Math.round(Math.sin(angle) * dist),
            strength: Math.random() * 250 + 100, decay: Math.random() * 1.2 + 0.6, type: 'suburb'
        });
    }
    for (let i = 0; i < numSmallTowns; i++) {
        const c = validCoords[Math.floor(Math.random() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: Math.random() * 200 + 50, decay: Math.random() * 1.0 + 0.3, type: 'town' });
    }

    // Transportation corridors
    const corridors = [];
    if (centers.length >= 2) {
        const numCorridors = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numCorridors; i++) {
            const a = centers[Math.floor(Math.random() * numLargeCities)];
            const b = centers[Math.floor(Math.random() * centers.length)];
            if (a !== b) corridors.push({ q1: a.q, r1: a.r, q2: b.q, r2: b.r, width: 1.5 + Math.random(), strength: 60 + Math.random() * 80 });
        }
    }

    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    state.maxPop = 0;
    const leanScale = 0.15 + Math.random() * 0.1;

    validCoords.forEach(c => {
        const { q, r } = c;

        // Base rural population with multi-octave fbm
        const terrainNoise = fbmNoise(q * 0.3, r * 0.3, noiseSeed, 5);
        const microNoise = fbmNoise(q * 1.2, r * 1.2, noiseSeed + 50, 3);
        let pop = Math.floor(3 + terrainNoise * 70 + microNoise * 30 + Math.random() * 20);

        // City/suburb/town contributions
        for (const center of centers) {
            const d = hexDistance(q, r, center.q, center.r);
            const localNoise = 0.5 + hashNoise(q, r, noiseSeed + 777);
            const edgeJitter = 0.8 + hashNoise(q * 2.3, r * 2.3, noiseSeed + 555) * 0.4;
            pop += Math.floor(center.strength * Math.exp(-d / (center.decay * edgeJitter)) * localNoise);
        }

        // Corridor population boost
        for (const cor of corridors) {
            const d = distToSegment(q, r, cor.q1, cor.r1, cor.q2, cor.r2);
            if (d < cor.width * 2.5) {
                pop += Math.floor(cor.strength * Math.exp(-d / cor.width) * (0.3 + hashNoise(q, r, noiseSeed + 999) * 0.7));
            }
        }

        // Sporadic spikes and voids
        if (Math.random() < 0.10) pop += Math.floor(Math.random() * 120 + 30);
        if (hashNoise(q * 0.8, r * 0.8, noiseSeed + 2000) > 0.82) {
            pop = Math.floor(pop * (0.1 + Math.random() * 0.2));
        }

        // Multiplicative noise
        pop = Math.floor(pop * (0.4 + hashNoise(q * 1.7, r * 1.7, noiseSeed + 333) * 1.2));
        pop = Math.max(3, Math.floor(pop * (0.7 + hashNoise(q * 3.1, r * 3.1, noiseSeed + 444) * 0.6)));

        if (pop > state.maxPop) state.maxPop = pop;

        // Political lean
        const regionalLean = fbmNoise(q * leanScale, r * leanScale, partySeed, 3);
        const isUrban = pop > 150;
        const isSuburban = pop > 80 && pop <= 150;

        let party;
        const roll = Math.random();

        if (isUrban) {
            // Cities lean strongly blue
            const blueChance = 0.70 + (regionalLean - 0.5) * 0.15;
            const redChance = 0.22 - (regionalLean - 0.5) * 0.1;
            party = roll < blueChance ? 'blue' : roll < blueChance + redChance ? 'red' : 'yellow';
        } else if (isSuburban) {
            // Suburbs lean solidly red, modulated by regional noise
            const redChance = 0.62 + (0.5 - regionalLean) * 0.15;
            const blueChance = 0.25 + (regionalLean - 0.5) * 0.1;
            party = roll < redChance ? 'red' : roll < redChance + blueChance ? 'blue' : 'yellow';
        } else {
            // Rural areas lean heavily red
            const redChance = 0.76 + (0.5 - regionalLean) * 0.12;
            const blueChance = 0.16 + (regionalLean - 0.5) * 0.08;
            party = roll < redChance ? 'red' : roll < redChance + blueChance ? 'blue' : 'yellow';
        }

        // Vote distribution — urban/rural density affects margins
        const votes = { red: 0, blue: 0, yellow: 0 };
        if (party === 'yellow') {
            const yellowBoost = 0.28 + Math.random() * 0.08;
            votes.yellow = Math.floor(pop * yellowBoost);
            const rest = pop - votes.yellow;
            const redShare = 0.3 + Math.random() * 0.4;
            votes.red = Math.floor(rest * redShare);
            votes.blue = rest - votes.red;
        } else {
            const yellowPct = 0.04 + Math.random() * 0.08;
            votes.yellow = Math.floor(pop * yellowPct);
            const majorRemainder = pop - votes.yellow;
            // Urban hexes have wider margins for the winner; rural too
            const baseMargin = isUrban ? 0.58 : (isSuburban ? 0.54 : 0.58);
            const winningPct = baseMargin + Math.random() * 0.25;
            votes[party] = Math.floor(majorRemainder * winningPct);
            const loser = party === 'red' ? 'blue' : 'red';
            votes[loser] = majorRemainder - votes[party];
        }

        // Minority clusters
        const minorityNoise = fbmNoise(q * 0.35, r * 0.35, minoritySeed, 4) * 0.7
            + fbmNoise(q * 0.9, r * 0.9, minoritySeed + 500, 3) * 0.3;
        const minorityThreshold = isUrban ? 0.48 : (isSuburban ? 0.60 : 0.78);

        const hex = {
            id: ++idCounter, q, r, s: -q - r,
            population: pop, votes, party,
            minority: minorityNoise > minorityThreshold,
            district: 0
        };
        hex.partyWinner = getHexWinner(hex);
        state.hexes.set(`${q},${r}`, hex);
    });

    initDistricts();
    calculateMetrics();
}

function initDistricts() {
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = {
            id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 },
            hexes: [], minorityPop: 0, isContiguous: true, compactness: 0,
            winner: 'none', isMinorityMajority: false
        };
    }
}

function getHexWinner(hex) {
    const { red, blue, yellow } = hex.votes;
    const max = Math.max(red, blue, yellow);
    if (max === red) return 'red';
    if (max === blue) return 'blue';
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
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    updateMetrics();
}

function pushUndoSnapshot() {
    state.undoStack.push(getSnapshot());
    state.redoStack = [];
    if (state.undoStack.length > 50) state.undoStack.shift();
    updateUndoRedoState();
}

function undo() {
    if (state.undoStack.length <= 1) return;
    state.redoStack.push(state.undoStack.pop());
    restoreSnapshot(state.undoStack[state.undoStack.length - 1]);
    updateUndoRedoState();
}

function redo() {
    if (state.redoStack.length === 0) return;
    const snap = state.redoStack.pop();
    state.undoStack.push(snap);
    restoreSnapshot(snap);
    updateUndoRedoState();
}

function updateUndoRedoState() {
    if ($.undoBtn) $.undoBtn.disabled = state.undoStack.length <= 1;
    if ($.redoBtn) $.redoBtn.disabled = state.redoStack.length === 0;
}

// ─── Map Operations ───
const MODES = {
    delete: { stateKey: 'deleteMode', btn: 'deleteBtn', cssClass: 'delete-mode' },
    erase:  { stateKey: 'eraseMode', btn: 'eraseBtn',  cssClass: 'erase-mode' },
    pan:    { stateKey: 'panMode',   btn: 'moveBtn',   cssClass: 'pan-mode' },
};

function setMode(name) {
    const toggling = MODES[name];
    const wasActive = toggling && state[toggling.stateKey];
    for (const m of Object.values(MODES)) {
        state[m.stateKey] = false;
        $[m.btn]?.classList.remove('active');
        $.mapContainer?.classList.remove(m.cssClass);
    }
    if (toggling && !wasActive) {
        state[toggling.stateKey] = true;
        $[toggling.btn]?.classList.add('active');
        $.mapContainer?.classList.add(toggling.cssClass);
    }
}

function clearModes() { setMode(null); }

function randomizeMap() {
    clearModes();
    state.hexes.clear();
    hexElements.clear();
    initDistricts();
    state.undoStack = [];
    state.redoStack = [];
    generateHexes();
    state.targetPop = Math.round(
        Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts
    );
    renderMap();
    updateMetrics();
    renderDistrictPalette();
    pushUndoSnapshot();
}

function resetMap() {
    clearModes();
    state.hexes.forEach(hex => { hex.district = 0; });
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    updateMetrics();
    pushUndoSnapshot();
}

function deleteDistrict(dId) {
    if (dId === 0) return;
    let changed = false;
    state.hexes.forEach(hex => {
        if (hex.district === dId) {
            hex.district = 0;
            changed = true;
        }
    });
    if (changed) {
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        updateMetrics();
        pushUndoSnapshot();
    }
}

// ─── UI Setup ───
function setupUI() {
    $.svg.addEventListener('mousedown', onMouseDown);
    $.svg.addEventListener('mouseup', onMouseUp);
    $.svg.addEventListener('mouseleave', (e) => {
        onMouseUp(e);
        clearHover();
    });
    $.svg.addEventListener('mousemove', onMouseMove);
    $.svg.addEventListener('wheel', onWheel, { passive: false });
    $.svg.addEventListener('contextmenu', e => e.preventDefault());

    // Toolbar buttons
    $.resetBtn?.addEventListener('click', resetMap);
    $.randomizeBtn?.addEventListener('click', randomizeMap);

    $.deleteBtn?.addEventListener('click', () => setMode('delete'));
    $.eraseBtn?.addEventListener('click', () => setMode('erase'));
    $.moveBtn?.addEventListener('click', () => setMode('pan'));

    if ($.undoBtn) $.undoBtn.addEventListener('click', undo);
    if ($.redoBtn) $.redoBtn.addEventListener('click', redo);
    if ($.themeBtn) $.themeBtn.addEventListener('click', toggleTheme);

    $.zoomInBtn?.addEventListener('click', () => smoothZoom(1));
    $.zoomOutBtn?.addEventListener('click', () => smoothZoom(-1));
    $.zoomFitBtn?.addEventListener('click', zoomToFit);

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });

    // Stats panel toggle
    function shiftMapForSidebar(opening) {
        if (window.innerWidth <= 900) return; // bottom sheet on mobile, no shift
        const panelW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--panel-w'));
        const scale = Math.min(window.innerWidth / state.viewBox.w, window.innerHeight / state.viewBox.h);
        const dx = panelW / (2 * scale);
        const endVb = { ...state.viewBox };
        endVb.x += opening ? dx : -dx;
        clampViewBox(endVb);
        animateViewBox({ ...state.viewBox }, endVb, 450);
    }
    if ($.statsToggle && $.sidebar) {
        $.statsToggle.addEventListener('click', () => {
            const opening = !$.sidebar.classList.contains('open');
            $.sidebar.classList.toggle('open');
            $.statsToggle.classList.toggle('active');
            shiftMapForSidebar(opening);
        });
        if (window.innerWidth > 900) {
            $.sidebar.classList.add('open');
            $.statsToggle.classList.add('active');
        }
    }
    if ($.closeStats && $.sidebar) {
        $.closeStats.addEventListener('click', () => {
            $.sidebar.classList.remove('open');
            $.statsToggle?.classList.remove('active');
            shiftMapForSidebar(false);
        });
    }

    // Swipe-to-dismiss for mobile bottom sheet
    if (typeof initSwipeDismiss === 'function' && $.sidebar) {
        initSwipeDismiss($.sidebar, {
            onDismiss() {
                $.statsToggle?.classList.remove('active');
                shiftMapForSidebar(false);
            }
        });
    }

    renderDistrictPalette();

    // Intro screen
    if ($.introStart && $.introScreen) {
        $.introStart.addEventListener('click', () => {
            $.introScreen.classList.add('hidden');
            document.body.classList.add('app-ready');
            if ($.mapContainer) $.mapContainer.classList.remove('paused');
            setTimeout(() => { $.introScreen.style.display = 'none'; }, 850);
        });
    }
}

// ─── District Palette ───
const paletteButtons = [];

function renderDistrictPalette() {
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
            clearModes();
            updateDistrictPalette();
            updateSidebarDetails(i);
            renderBorders();
            renderDistrictLabels();
        });

        $.palette.appendChild(btn);
        paletteButtons.push(btn);
    }

    updateDistrictPalette();
}

function updateDistrictPalette() {
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

// ─── Zoom & Pan ───
function clampViewBox(vb) {
    const o = state.origViewBox;
    const padX = vb.w * 0.5;
    const padY = vb.h * 0.5;
    vb.x = Math.max(o.x - padX, Math.min(o.x + o.w - vb.w + padX, vb.x));
    vb.y = Math.max(o.y - padY, Math.min(o.y + o.h - vb.h + padY, vb.y));
}

function onWheel(e) {
    e.preventDefault();
    const vb = state.viewBox;
    const rect = $.svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const svgX = vb.x + mx * vb.w;
    const svgY = vb.y + my * vb.h;

    const zoomFactor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const minW = state.origViewBox.w / 3;
    const maxW = state.origViewBox.w;
    const ratio = vb.h / vb.w;
    const newW = Math.max(minW, Math.min(maxW, vb.w * zoomFactor));
    if (newW === vb.w) return;
    const newH = newW * ratio;

    vb.x = svgX - mx * newW;
    vb.y = svgY - my * newH;
    vb.w = newW;
    vb.h = newH;
    clampViewBox(vb);
    state.zoomLevel = state.origViewBox.w / vb.w;

    $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    updateZoomDisplay();
}

function smoothZoom(direction) {
    const vb = state.viewBox;
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;

    const factor = direction > 0 ? 1 / 1.25 : 1.25;
    const minW = state.origViewBox.w / 3;
    const maxW = state.origViewBox.w;
    const ratio = vb.h / vb.w;
    const targetW = Math.max(minW, Math.min(maxW, vb.w * factor));
    if (targetW === vb.w) return;
    const targetH = targetW * ratio;

    const startVb = { ...vb };
    const endVb = { x: cx - targetW / 2, y: cy - targetH / 2, w: targetW, h: targetH };
    animateViewBox(startVb, endVb, 200);
}

function zoomToFit() {
    const endVb = { ...state.origViewBox };
    if ($.sidebar?.classList.contains('open') && window.innerWidth > 900) {
        const scale = Math.min(window.innerWidth / endVb.w, window.innerHeight / endVb.h);
        endVb.x += 350 / (2 * scale);
    }
    animateViewBox({ ...state.viewBox }, endVb, 300);
}

function animateViewBox(startVb, endVb, duration, easeFn = EASE_OUT) {
    const vb = state.viewBox;
    let start = null;

    function step(ts) {
        if (!start) start = ts;
        const t = Math.min((ts - start) / duration, 1);
        const ease = easeFn(t);

        vb.x = startVb.x + (endVb.x - startVb.x) * ease;
        vb.y = startVb.y + (endVb.y - startVb.y) * ease;
        vb.w = startVb.w + (endVb.w - startVb.w) * ease;
        vb.h = startVb.h + (endVb.h - startVb.h) * ease;
        clampViewBox(vb);
        state.zoomLevel = state.origViewBox.w / vb.w;

        $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
        updateZoomDisplay();

        if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

function updateZoomDisplay() {
    if ($.zoomLevel) $.zoomLevel.textContent = `${Math.round(state.zoomLevel * 100)}%`;
}

function clearHover() {
    if (state.hoveredHex) {
        const el = hexElements.get(state.hoveredHex);
        if (el) el.classList.remove('hovered');
        state.hoveredHex = null;
    }
    if ($.tooltip) $.tooltip.classList.remove('visible');
}

// ─── Mouse Handlers ───
function onMouseDown(e) {
    if (e.button === 1 || (e.button === 0 && state.panMode)) {
        e.preventDefault();
        state.isPanning = true;
        state.panStart = { x: e.clientX, y: e.clientY };
        $.mapContainer.classList.add('panning');
        return;
    }
    startPainting(e);
}

function onMouseUp(e) {
    if (state.isPanning) {
        state.isPanning = false;
        $.mapContainer.classList.remove('panning');
        return;
    }
    stopPainting();
}

function onMouseMove(e) {
    if (state.isPanning) {
        const rect = $.svg.getBoundingClientRect();
        const dx = (e.clientX - state.panStart.x) / rect.width * state.viewBox.w;
        const dy = (e.clientY - state.panStart.y) / rect.height * state.viewBox.h;
        state.viewBox.x -= dx;
        state.viewBox.y -= dy;
        clampViewBox(state.viewBox);
        state.panStart = { x: e.clientX, y: e.clientY };
        $.svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
        return;
    }
    const qr = getHexFromEvent(e);
    if (qr) {
        handleHover(e, qr);
    } else {
        clearHover();
    }
}

// ─── Live border update (throttled to one per frame) ───
let _borderUpdatePending = false;

function scheduleBorderUpdate() {
    if (_borderUpdatePending) return;
    _borderUpdatePending = true;
    requestAnimationFrame(() => {
        renderBorders();
        renderDistrictLabels();
        _borderUpdatePending = false;
    });
}

// ─── Painting ───
// Start painting at a hex key. Returns true if painting started, false otherwise.
function startPaintingAt(qr, isErase) {
    const hex = state.hexes.get(qr);
    if (!hex) return false;

    if (state.deleteMode) {
        if (hex.district > 0) deleteDistrict(hex.district);
        return false;
    }

    if (isErase) {
        state.isPainting = 'erase';
    } else if (hex.district > 0) {
        state.isPainting = hex.district;
    } else {
        state.isPainting = state.currentDistrict;
    }
    state.currentDistrict = typeof state.isPainting === 'number' ? state.isPainting : state.currentDistrict;
    paintHexByKey(qr);
    updateSidebarDetails(state.currentDistrict);
    updateDistrictPalette();
    return true;
}

function startPainting(e) {
    e.preventDefault();
    const qr = getHexFromEvent(e);
    if (!qr) return;
    const isErase = e.button === 2 || (e.button === 0 && state.eraseMode);
    startPaintingAt(qr, isErase);
}

function stopPainting() {
    if (state.isPainting !== false) {
        state.isPainting = false;
        updateMetrics();
        pushUndoSnapshot();
    }
}

function getHexFromEvent(e) {
    let target = e.target;
    if (target.tagName === 'polygon') {
        target = target.parentNode;
    } else if (target.tagName !== 'g' || !target.classList.contains('hex')) {
        target = target.closest('.hex');
    }
    return target?.classList?.contains('hex') ? target.dataset.qr : null;
}

// Convert screen coordinates to hex key via SVG coordinate math (reliable for touch)
function getHexFromPoint(clientX, clientY) {
    const rect = $.svg.getBoundingClientRect();
    const vb = state.viewBox;
    const svgX = vb.x + ((clientX - rect.left) / rect.width) * vb.w;
    const svgY = vb.y + ((clientY - rect.top) / rect.height) * vb.h;

    // Inverse of hexToPixel: x = HEX_W * (q + r/2), y = HEX_H * r
    const r_frac = svgY / HEX_H;
    const q_frac = svgX / HEX_W - r_frac / 2;
    const s_frac = -q_frac - r_frac;

    // Cube coordinate rounding
    let q = Math.round(q_frac);
    let r = Math.round(r_frac);
    let s = Math.round(s_frac);
    const q_diff = Math.abs(q - q_frac);
    const r_diff = Math.abs(r - r_frac);
    const s_diff = Math.abs(s - s_frac);
    if (q_diff > r_diff && q_diff > s_diff) {
        q = -r - s;
    } else if (r_diff > s_diff) {
        r = -q - s;
    }

    const key = `${q},${r}`;
    return state.hexes.has(key) ? key : null;
}

function paintHexByKey(qr) {
    if (state.isPainting === false) return;
    const hex = state.hexes.get(qr);
    if (!hex) return;
    const targetDistrict = state.isPainting === 'erase' ? 0 : state.isPainting;

    // Population cap using cached district state
    if (targetDistrict > 0 && hex.district !== targetDistrict && state.targetPop > 0) {
        const d = state.districts[targetDistrict];
        if (d && d.population + hex.population > state.targetPop * 1.1) return;
    }

    if (hex.district !== targetDistrict) {
        hex.district = targetDistrict;
        updateHexVisuals(qr);
        const g = hexElements.get(qr);
        if (g) {
            g.classList.remove('just-painted');
            void g.offsetWidth;
            g.classList.add('just-painted');
        }
    }
}


function updateHoverTarget(qr) {
    if (state.hoveredHex === qr) return;
    if (state.hoveredHex) {
        const oldEl = hexElements.get(state.hoveredHex);
        if (oldEl) oldEl.classList.remove('hovered');
    }
    state.hoveredHex = qr;
    const el = hexElements.get(qr);
    if (el) el.classList.add('hovered');
}

function paintIfActive(qr) {
    if (!state.isPainting) return;
    paintHexByKey(qr);
    calculateMetrics();
    updateSidebarDetails(state.currentDistrict);
    scheduleBorderUpdate();
}

function handleHover(e, qr) {
    updateHoverTarget(qr);
    paintIfActive(qr);
    showHexTooltip(e, qr);
}

function handleHoverAt(qr) {
    updateHoverTarget(qr);
    paintIfActive(qr);
}

function showHexTooltip(e, qr) {
    if (!$.tooltip) return;
    if (!qr) { $.tooltip.classList.remove('visible'); return; }
    const hex = state.hexes.get(qr);
    if (!hex) { $.tooltip.classList.remove('visible'); return; }

    const pct = votePcts(hex.votes);
    const pR = Math.round(pct.red), pB = Math.round(pct.blue), pY = Math.round(pct.yellow);

    $.tooltip.innerHTML = `<span class="tt-pop">Pop: ${hex.population.toLocaleString()}</span>`
        + `<div class="tt-votes"><span class="tt-r">R ${pR}%</span> <span class="tt-b">B ${pB}%</span> <span class="tt-y">Y ${pY}%</span></div>`
        + (hex.minority ? `<span class="tt-m">Minority area</span>` : '')
        + (hex.district > 0 ? `<span>District ${hex.district}</span>` : '');

    const rect = $.mapContainer.getBoundingClientRect();
    $.tooltip.style.left = `${e.clientX - rect.left + 12}px`;
    $.tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    $.tooltip.classList.add('visible');
}

function votePcts(votes) {
    const total = votes.red + votes.blue + votes.yellow;
    if (total === 0) return { red: 0, blue: 0, yellow: 0 };
    return { red: votes.red / total * 100, blue: votes.blue / total * 100, yellow: votes.yellow / total * 100 };
}

// ─── Rendering ───
let _cachedMinOpacity = 0.22;

function refreshMinOpacity() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--hex-min-opacity');
    _cachedMinOpacity = parseFloat(val) || 0.22;
}

function hexOpacity(population) {
    return Math.max(_cachedMinOpacity, Math.min(1.0, _cachedMinOpacity + (1 - _cachedMinOpacity) * (population / state.maxPop)));
}

function updateHexVisuals(qr) {
    const hex = state.hexes.get(qr);
    const g = hexElements.get(qr);
    if (g) {
        g.firstChild.style.fill = activeColors[hex.partyWinner];
        g.style.opacity = hexOpacity(hex.population);
    }
}

function renderMap() {
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

        // Staggered radial pop-in
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

    // Expand viewBox vertically so hex content clears toolbar & palette at 100% zoom
    const vpH = window.innerHeight;
    const uiClearance = 172; // toolbar (12+52+12) + palette (12+56+12) + margin
    const vScale = vpH / Math.max(vpH - uiClearance, 200);
    const h = cH * vScale;

    const vb = { x: minX - padding, y: minY - padding - (h - cH) / 2, w: cW, h };
    state.origViewBox = { ...vb };
    // Shift map left if sidebar is already open (desktop auto-open)
    if ($.sidebar?.classList.contains('open') && window.innerWidth > 900) {
        const scale = Math.min(window.innerWidth / vb.w, vpH / vb.h);
        vb.x += 350 / (2 * scale); // --panel-w / 2
    }
    state.viewBox = { ...vb };
    $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);

    renderBorders();
}

function renderBorders() {
    $.borderGroup.innerHTML = '';
    $.defs.innerHTML = '';

    const districtGroups = {};
    const districtSegments = {};
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        districtGroups[i] = document.createElementNS("http://www.w3.org/2000/svg", "g");
        districtGroups[i].dataset.districtId = i;
        districtSegments[i] = [];
    }

    // Collect boundary segments
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

        // Build adjacency map keyed by rounded endpoint for O(n) chaining
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

            // Extend tail
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

            // Extend head
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

        // Build clip path from district hex polygons
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

        // Draw border path
        const d = state.districts[i];
        const winner = d?.winner !== 'none' ? d.winner : 'none';

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", dAttrTrimmed);
        path.setAttribute("clip-path", `url(#clip-d-${i})`);
        path.style.stroke = _darken(activeColors[winner] || activeColors.none);
        path.classList.add('district-path', 'outline');
        districtGroups[i].appendChild(path);

        // Minority-majority overlay
        if (d?.isMinorityMajority) {
            const mmPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            mmPath.setAttribute("d", dAttrTrimmed);
            mmPath.setAttribute("clip-path", `url(#clip-d-${i})`);
            mmPath.classList.add('district-path', 'mmd-overlay');
            districtGroups[i].appendChild(mmPath);
        }
    }

    // Append groups (current district last for z-order)
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

// ─── Metrics ───
function calculateMetrics() {
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = {
            id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 },
            hexes: [], minorityPop: 0, isContiguous: false, compactness: 0,
            winner: 'none', isMinorityMajority: false
        };
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
            const { red, blue, yellow } = d.votes;
            const max = Math.max(red, blue, yellow);
            d.winner = max === red ? 'red' : max === blue ? 'blue' : 'yellow';
            d.isMinorityMajority = (d.minorityPop / d.population) > 0.5;
            d.isContiguous = checkContiguity(d);
            d.compactness = calculateCompactness(d);
        }
    }
}

function checkContiguity(d) {
    if (d.hexes.length === 0) return true;
    const visited = new Set([d.hexes[0].id]);
    const queue = [d.hexes[0]];
    let head = 0;
    while (head < queue.length) {
        const curr = queue[head++];
        for (const dir of HEX_DIRS) {
            const neighbor = state.hexes.get(`${curr.q + dir.dq},${curr.r + dir.dr}`);
            if (neighbor && neighbor.district === d.id && !visited.has(neighbor.id)) {
                visited.add(neighbor.id);
                queue.push(neighbor);
            }
        }
    }
    return queue.length === d.hexes.length;
}

function calculateCompactness(d) {
    if (d.hexes.length === 0) return 0;
    let perimeter = 0;
    for (const hex of d.hexes) {
        for (const dir of HEX_DIRS) {
            const neighbor = state.hexes.get(`${hex.q + dir.dq},${hex.r + dir.dr}`);
            if (!neighbor || neighbor.district !== d.id) perimeter++;
        }
    }
    if (perimeter === 0) return 100;
    return Math.min(100, Math.round((32.648 * d.hexes.length) / (perimeter * perimeter) * 100));
}

// ─── Efficiency Gap ───
function calculateEfficiencyGap() {
    let wastedRed = 0, wastedBlue = 0, totalVotes = 0;
    let numActiveDistricts = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population === 0) continue;
        numActiveDistricts++;

        const { red: redV, blue: blueV } = d.votes;
        const districtTotal = redV + blueV;
        if (districtTotal === 0) continue;

        totalVotes += districtTotal;
        const threshold = Math.floor(districtTotal / 2) + 1;

        if (redV > blueV) {
            wastedRed += redV - threshold;
            wastedBlue += blueV;
        } else {
            wastedBlue += blueV - threshold;
            wastedRed += redV;
        }
    }

    if (totalVotes === 0 || numActiveDistricts < 2) return null;
    return (wastedRed - wastedBlue) / totalVotes;
}

// ─── Update UI ───
function updateMetrics() {
    calculateMetrics();
    renderBorders();

    let seats = { red: 0, blue: 0, yellow: 0 };
    let mmdCount = 0;
    let activeDistrictCount = 0;

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            activeDistrictCount++;
            if (d.winner !== 'none') seats[d.winner]++;
            if (d.isMinorityMajority) mmdCount++;
        }
    }

    animateValue($.redSeats, seats.red, 600, v => Math.round(v), 'seats-red');
    animateValue($.blueSeats, seats.blue, 600, v => Math.round(v), 'seats-blue');
    animateValue($.yellowSeats, seats.yellow, 600, v => Math.round(v), 'seats-yellow');
    if ($.mmdCount) $.mmdCount.textContent = `${mmdCount} / 2 min`;
    if ($.districtCount) $.districtCount.textContent = `${activeDistrictCount} / ${CONFIG.numDistricts}`;

    // Efficiency Gap
    const eg = calculateEfficiencyGap();
    if ($.efficiencyGap) {
        if (eg !== null) {
            const pct = (eg * 100).toFixed(1);
            $.efficiencyGap.textContent = `${Math.abs(pct)}% ${eg > 0 ? '→ Blue' : '→ Red'}`;
            $.efficiencyGap.style.color = Math.abs(eg) > 0.07 ? 'var(--party-red)' : 'var(--text)';
        } else {
            $.efficiencyGap.textContent = '—';
            $.efficiencyGap.style.color = 'var(--text-secondary)';
        }
    }

    updateSidebarDetails(state.currentDistrict);
    updateProportionality(seats);
    renderDistrictLabels();
    updateDistrictPalette();
}

// ─── Popular Vote vs Seats ───
function updateProportionality(seats) {
    const totalVotes = { red: 0, blue: 0, yellow: 0 };
    const totalSeats = (seats.red || 0) + (seats.blue || 0) + (seats.yellow || 0);

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (d.population > 0) {
            totalVotes.red += d.votes.red;
            totalVotes.blue += d.votes.blue;
            totalVotes.yellow += d.votes.yellow;
        }
    }

    const grandTotal = totalVotes.red + totalVotes.blue + totalVotes.yellow;

    for (const party of ['red', 'blue', 'yellow']) {
        const p = $.prop[party];
        if (!p) continue;
        const votePct = grandTotal > 0 ? (totalVotes[party] / grandTotal) * 100 : 0;
        const seatPct = totalSeats > 0 ? ((seats[party] || 0) / totalSeats) * 100 : 0;

        if (p.votes) p.votes.style.width = `${votePct}%`;
        if (p.seats) p.seats.style.width = `${seatPct}%`;
        if (p.votePct) p.votePct.textContent = grandTotal > 0 ? `${Math.round(votePct)}% votes` : '—';
        if (p.seatPct) p.seatPct.textContent = totalSeats > 0 ? `${Math.round(seatPct)}% seats` : '—';
    }
}

// ─── District Labels ───
function renderDistrictLabels() {
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

function updateSidebarDetails(dId) {
    const d = state.districts[dId];
    if (!d || d.population === 0) {
        $.selectedInfo?.classList.add('hidden');
        $.noSelectionMsg?.classList.remove('hidden');
        return;
    }

    $.selectedInfo?.classList.remove('hidden');
    $.noSelectionMsg?.classList.add('hidden');

    if ($.detailTitle) {
        $.detailTitle.textContent = `District ${d.id}`;
        if (state.targetPop > 0) {
            const dev = Math.abs((d.population - state.targetPop) / state.targetPop);
            $.detailTitle.style.color = (dev > 0.1 || !d.isContiguous) ? 'var(--party-red)' : 'inherit';
        }
    }

    if ($.detailWinner) {
        $.detailWinner.textContent = d.winner.charAt(0).toUpperCase() + d.winner.slice(1);
        $.detailWinner.style.color = d.winner !== 'none' ? activeColors[d.winner] : 'var(--text-secondary)';
    }

    const totalVotes = d.votes.red + d.votes.blue + d.votes.yellow;
    if (totalVotes > 0) {
        const sorted = [d.votes.red, d.votes.blue, d.votes.yellow].sort((a, b) => b - a);
        const margin = (sorted[0] - sorted[1]) / totalVotes * 100;
        animateValue($.detailMargin, margin, 600, v => `+${v.toFixed(1)}%`, 'detail-margin');
    } else if ($.detailMargin) {
        $.detailMargin.textContent = '-';
    }

    animateValue($.detailPop, d.population, 600, v => Math.round(v).toLocaleString(), 'detail-pop');
    if ($.targetPop) $.targetPop.textContent = state.targetPop.toLocaleString();

    if (state.targetPop > 0 && $.detailDeviation) {
        const dev = ((d.population - state.targetPop) / state.targetPop) * 100;
        animateValue($.detailDeviation, dev, 600, v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, 'detail-dev');
        $.detailDeviation.style.color = Math.abs(dev) > 10 ? 'var(--party-red)' : 'var(--text-secondary)';
    }

    animateValue($.detailCompactness, d.compactness, 600, v => `${Math.round(v)}%`, 'detail-comp');

    if ($.detailContiguous) {
        $.detailContiguous.textContent = d.isContiguous ? 'Yes' : 'No';
        $.detailContiguous.style.color = d.isContiguous ? 'var(--party-green)' : 'var(--party-red)';
    }

    if ($.detailMm) {
        $.detailMm.textContent = d.isMinorityMajority ? 'Yes' : 'No';
        $.detailMm.style.color = d.isMinorityMajority ? 'var(--party-green)' : 'var(--text-secondary)';
    }

    if (totalVotes > 0) {
        const pct = votePcts(d.votes);
        if ($.voteBarRed) $.voteBarRed.style.width = `${pct.red}%`;
        if ($.voteBarBlue) $.voteBarBlue.style.width = `${pct.blue}%`;
        if ($.voteBarYellow) $.voteBarYellow.style.width = `${pct.yellow}%`;
        if ($.votePctRed) $.votePctRed.textContent = `${Math.round(pct.red)}% Red`;
        if ($.votePctBlue) $.votePctBlue.textContent = `${Math.round(pct.blue)}% Blue`;
        if ($.votePctYellow) $.votePctYellow.textContent = `${Math.round(pct.yellow)}% Yell`;
    }
}

// ─── Theme Management ───
function initTheme() {
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
    const isDark = document.documentElement.dataset.theme === 'dark';
    refreshMinOpacity();
}

function toggleTheme() {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('gerry-theme', next);
    syncTheme();
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    renderBorders();
}

// ─── Touch Handlers ───
function initTouchHandlers() {
    if (!$.svg || !$.mapContainer) return;

    let lastPinchDist = 0;
    let lastPinchCenter = null;
    let isTouchPainting = false;
    let isTouchPanning = false;
    let touchPanStart = null;
    let wasMultiTouch = false;

    $.mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];

            // After pinch-zoom, ignore the remaining finger to prevent accidental paint
            if (wasMultiTouch) {
                wasMultiTouch = false;
                return;
            }

            if (state.panMode) {
                isTouchPanning = true;
                touchPanStart = { x: touch.clientX, y: touch.clientY };
                $.mapContainer.classList.add('panning');
                return;
            }

            const qr = getHexFromPoint(touch.clientX, touch.clientY);
            if (qr) {
                isTouchPainting = startPaintingAt(qr, state.eraseMode);
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            if (isTouchPainting) {
                isTouchPainting = false;
                stopPainting();
            }
            if (isTouchPanning) {
                isTouchPanning = false;
                $.mapContainer.classList.remove('panning');
            }
            wasMultiTouch = true;
            const [t1, t2] = [e.touches[0], e.touches[1]];
            lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            lastPinchCenter = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
        }
    }, { passive: false });

    $.mapContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            const touch = e.touches[0];

            if (isTouchPanning) {
                const rect = $.svg.getBoundingClientRect();
                const dx = (touch.clientX - touchPanStart.x) / rect.width * state.viewBox.w;
                const dy = (touch.clientY - touchPanStart.y) / rect.height * state.viewBox.h;
                state.viewBox.x -= dx;
                state.viewBox.y -= dy;
                clampViewBox(state.viewBox);
                touchPanStart = { x: touch.clientX, y: touch.clientY };
                $.svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
                return;
            }

            if (isTouchPainting) {
                const qr = getHexFromPoint(touch.clientX, touch.clientY);
                if (qr) handleHoverAt(qr);
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            const [t1, t2] = [e.touches[0], e.touches[1]];
            const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const center = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };

            if (lastPinchDist > 0) {
                const scale = lastPinchDist / dist;
                const vb = state.viewBox;
                const rect = $.svg.getBoundingClientRect();

                const mx = (center.x - rect.left) / rect.width;
                const my = (center.y - rect.top) / rect.height;
                const svgX = vb.x + mx * vb.w;
                const svgY = vb.y + my * vb.h;

                const minW = state.origViewBox.w / 3;
                const maxW = state.origViewBox.w;
                const ratio = vb.h / vb.w;
                const newW = Math.max(minW, Math.min(maxW, vb.w * scale));
                if (newW !== vb.w) {
                    const newH = newW * ratio;
                    vb.x = svgX - mx * newW;
                    vb.y = svgY - my * newH;
                    vb.w = newW;
                    vb.h = newH;
                    state.zoomLevel = state.origViewBox.w / vb.w;
                }

                // Pan with two-finger drag
                if (lastPinchCenter) {
                    vb.x += (lastPinchCenter.x - center.x) / rect.width * vb.w;
                    vb.y += (lastPinchCenter.y - center.y) / rect.height * vb.h;
                }

                clampViewBox(vb);
                $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
                updateZoomDisplay();
            }

            lastPinchDist = dist;
            lastPinchCenter = center;
        }
    }, { passive: false });

    $.mapContainer.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            if (isTouchPainting) {
                isTouchPainting = false;
                stopPainting();
            }
            if (isTouchPanning) {
                isTouchPanning = false;
                $.mapContainer.classList.remove('panning');
            }
            clearHover();
            lastPinchDist = 0;
            lastPinchCenter = null;
        } else if (e.touches.length === 1) {
            lastPinchDist = 0;
            lastPinchCenter = null;
        }
    });

    $.mapContainer.addEventListener('touchcancel', () => {
        isTouchPainting = false;
        isTouchPanning = false;
        lastPinchDist = 0;
        lastPinchCenter = null;
        touchPanStart = null;
        $.mapContainer.classList.remove('panning');
        stopPainting();
    });
}

// ─── Initialize ───
document.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    initTheme();
    init();
    initTouchHandlers();
});
