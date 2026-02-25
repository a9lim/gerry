// ─── Configuration ───
const CONFIG = {
    numDistricts: 10,
    rows: 18,
    cols: 25,
    hexSize: 18,
    colors: {
        light: {
            red: { base: '#C42838', dark: '#8A1C28', light: '#E84858', muted: '#e1a6b0', district: '#C42838' },
            blue: { base: '#1A54B0', dark: '#0E3470', light: '#4D88E8', muted: '#a5bccc', district: '#1A54B0' },
            yellow: { base: '#B88A00', dark: '#7A5C00', light: '#E0B830', muted: '#ebe4ab', district: '#B88A00' },
            none: { base: '#d1d5db', dark: '#374151', light: '#e5e7eb', muted: '#f3f4f6', district: '#9ca3af' },
            minority: '#2B8650'
        },
        dark: {
            red: { base: '#E86070', dark: '#C44050', light: '#F08888', muted: '#4a1820', district: '#E86070' },
            blue: { base: '#6498E6', dark: '#3868B8', light: '#88B0F0', muted: '#182848', district: '#6498E6' },
            yellow: { base: '#E0B830', dark: '#B89020', light: '#F0D060', muted: '#3a3010', district: '#E0B830' },
            none: { base: '#5a564e', dark: '#3a3830', light: '#706860', muted: '#2a2820', district: '#5a564e' },
            minority: '#50B878'
        }
    }
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

const PALETTE_COLOR_MAP = {
    red: 'var(--party-red)',
    blue: 'var(--party-blue)',
    yellow: 'var(--party-yellow)'
};

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
    $.themeBtn = document.getElementById('theme-btn');
    $.statsToggle = document.getElementById('stats-toggle');
    $.closeStats = document.getElementById('close-stats');
    $.zoomLevel = document.getElementById('zoom-level');
    $.introScreen = document.getElementById('intro-screen');
    $.introStart = document.getElementById('intro-start');

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

// Resolved color reference — updated on theme change
let activeColors = CONFIG.colors.light;

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
            const blueChance = 0.52 + (regionalLean - 0.5) * 0.3;
            party = roll < blueChance ? 'blue' : roll < blueChance + 0.38 ? 'red' : 'yellow';
        } else if (isSuburban) {
            if (regionalLean > 0.55) {
                party = roll < 0.48 ? 'blue' : roll < 0.90 ? 'red' : 'yellow';
            } else {
                party = roll < 0.48 ? 'red' : roll < 0.90 ? 'blue' : 'yellow';
            }
        } else {
            const redChance = 0.48 + (0.5 - regionalLean) * 0.3;
            party = roll < redChance ? 'red' : roll < redChance + 0.42 ? 'blue' : 'yellow';
        }

        // Vote distribution
        const votes = { red: 0, blue: 0, yellow: 0 };
        if (party === 'yellow') {
            const yellowBoost = 0.30 + Math.random() * 0.10;
            votes.yellow = Math.floor(pop * yellowBoost);
            const rest = pop - votes.yellow;
            const redShare = 0.3 + Math.random() * 0.4;
            votes.red = Math.floor(rest * redShare);
            votes.blue = rest - votes.red;
        } else {
            const yellowPct = 0.05 + Math.random() * 0.10;
            votes.yellow = Math.floor(pop * yellowPct);
            const majorRemainder = pop - votes.yellow;
            const winningPct = 0.50 + Math.random() * 0.30;
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
    calculateMetrics();
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    renderBorders();
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
function clearModes() {
    state.deleteMode = false;
    state.eraseMode = false;
    if ($.deleteBtn) $.deleteBtn.classList.remove('active');
    if ($.eraseBtn) $.eraseBtn.classList.remove('active');
    if ($.mapContainer) $.mapContainer.classList.remove('delete-mode', 'erase-mode');
}

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
    calculateMetrics();
    state.hexes.forEach((_, qr) => updateHexVisuals(qr));
    renderBorders();
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
        calculateMetrics();
        state.hexes.forEach((_, qr) => updateHexVisuals(qr));
        renderBorders();
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
        if ($.tooltip) $.tooltip.classList.remove('visible');
        if (state.hoveredHex) {
            const oldEl = hexElements.get(state.hoveredHex);
            if (oldEl) oldEl.classList.remove('hovered');
            state.hoveredHex = null;
        }
    });
    $.svg.addEventListener('mousemove', onMouseMove);
    $.svg.addEventListener('wheel', onWheel, { passive: false });
    $.svg.addEventListener('contextmenu', e => e.preventDefault());

    // Toolbar buttons
    document.getElementById('reset-btn')?.addEventListener('click', resetMap);
    document.getElementById('randomize-btn')?.addEventListener('click', randomizeMap);

    if ($.deleteBtn) {
        $.deleteBtn.addEventListener('click', () => {
            state.deleteMode = !state.deleteMode;
            $.deleteBtn.classList.toggle('active', state.deleteMode);
            $.mapContainer.classList.toggle('delete-mode', state.deleteMode);
            if (state.deleteMode && state.eraseMode) {
                state.eraseMode = false;
                $.eraseBtn?.classList.remove('active');
                $.mapContainer.classList.remove('erase-mode');
            }
        });
    }

    if ($.eraseBtn) {
        $.eraseBtn.addEventListener('click', () => {
            state.eraseMode = !state.eraseMode;
            $.eraseBtn.classList.toggle('active', state.eraseMode);
            $.mapContainer.classList.toggle('erase-mode', state.eraseMode);
            if (state.eraseMode && state.deleteMode) {
                state.deleteMode = false;
                $.deleteBtn?.classList.remove('active');
                $.mapContainer.classList.remove('delete-mode');
            }
        });
    }

    if ($.undoBtn) $.undoBtn.addEventListener('click', undo);
    if ($.redoBtn) $.redoBtn.addEventListener('click', redo);
    if ($.themeBtn) $.themeBtn.addEventListener('click', toggleTheme);

    document.getElementById('zoom-in-btn')?.addEventListener('click', () => smoothZoom(1));
    document.getElementById('zoom-out-btn')?.addEventListener('click', () => smoothZoom(-1));
    document.getElementById('zoom-fit-btn')?.addEventListener('click', zoomToFit);

    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });

    // Stats panel toggle
    if ($.statsToggle && $.sidebar) {
        $.statsToggle.addEventListener('click', () => {
            $.sidebar.classList.toggle('open');
            $.statsToggle.classList.toggle('active');
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
function renderDistrictPalette() {
    if (!$.palette) return;
    $.palette.innerHTML = '';

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
    }

    updateDistrictPalette();
}

function updateDistrictPalette() {
    const buttons = document.querySelectorAll('.palette-btn');
    for (const btn of buttons) {
        const dId = parseInt(btn.dataset.district);
        const d = state.districts[dId];

        btn.classList.toggle('active', dId === state.currentDistrict);

        if (d && d.population > 0 && d.winner !== 'none') {
            btn.classList.add('has-district');
            btn.style.background = PALETTE_COLOR_MAP[d.winner] || '';
        } else {
            btn.classList.remove('has-district');
            btn.style.background = '';
        }
    }
}

// ─── Zoom & Pan ───
function onWheel(e) {
    e.preventDefault();
    const vb = state.viewBox;
    const rect = $.svg.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;
    const my = (e.clientY - rect.top) / rect.height;
    const svgX = vb.x + mx * vb.w;
    const svgY = vb.y + my * vb.h;

    const zoomFactor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const newW = vb.w * zoomFactor;
    const newH = vb.h * zoomFactor;

    const minW = state.origViewBox.w * 0.3;
    const maxW = state.origViewBox.w * 3;
    if (newW < minW || newW > maxW) return;

    vb.x = svgX - mx * newW;
    vb.y = svgY - my * newH;
    vb.w = newW;
    vb.h = newH;
    state.zoomLevel = state.origViewBox.w / vb.w;

    $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    updateZoomDisplay();
}

function smoothZoom(direction) {
    const vb = state.viewBox;
    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;

    const factor = direction > 0 ? 1 / 1.25 : 1.25;
    const targetW = vb.w * factor;
    const targetH = vb.h * factor;

    const minW = state.origViewBox.w * 0.3;
    const maxW = state.origViewBox.w * 3;
    if (targetW < minW || targetW > maxW) return;

    const startVb = { ...vb };
    const endVb = { x: cx - targetW / 2, y: cy - targetH / 2, w: targetW, h: targetH };
    animateViewBox(startVb, endVb, 200);
}

function zoomToFit() {
    animateViewBox({ ...state.viewBox }, { ...state.origViewBox }, 300);
}

function animateViewBox(startVb, endVb, duration) {
    const vb = state.viewBox;
    let start = null;

    function step(ts) {
        if (!start) start = ts;
        const t = Math.min((ts - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        vb.x = startVb.x + (endVb.x - startVb.x) * ease;
        vb.y = startVb.y + (endVb.y - startVb.y) * ease;
        vb.w = startVb.w + (endVb.w - startVb.w) * ease;
        vb.h = startVb.h + (endVb.h - startVb.h) * ease;
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

// ─── Mouse Handlers ───
function onMouseDown(e) {
    if (e.button === 1) {
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
        state.panStart = { x: e.clientX, y: e.clientY };
        $.svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${state.viewBox.w} ${state.viewBox.h}`);
        return;
    }
    const qr = getHexFromEvent(e);
    if (qr) {
        handleHover(e, qr);
    } else {
        if ($.tooltip) $.tooltip.classList.remove('visible');
        if (state.hoveredHex) {
            const oldEl = hexElements.get(state.hoveredHex);
            if (oldEl) oldEl.classList.remove('hovered');
            state.hoveredHex = null;
        }
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
function startPainting(e) {
    e.preventDefault();
    const qr = getHexFromEvent(e);
    if (!qr) return;
    const hex = state.hexes.get(qr);

    if (state.deleteMode) {
        if (hex && hex.district > 0) deleteDistrict(hex.district);
        return;
    }

    if (e.button === 2 || (e.button === 0 && state.eraseMode)) {
        state.isPainting = 'erase';
    } else if (e.button === 0) {
        if (hex.district > 0) {
            state.isPainting = hex.district;
        } else {
            // Use currently selected district from palette
            state.isPainting = state.currentDistrict;
        }
    }
    state.currentDistrict = typeof state.isPainting === 'number' ? state.isPainting : state.currentDistrict;
    paintHex(e);
    updateSidebarDetails(state.currentDistrict);
    updateDistrictPalette();
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

function paintHex(e) {
    if (state.isPainting === false) return;
    const qr = getHexFromEvent(e);
    if (!qr) return;
    const hex = state.hexes.get(qr);
    const targetDistrict = state.isPainting === 'erase' ? 0 : state.isPainting;

    // Population cap using cached district state (avoid full hex iteration)
    if (targetDistrict > 0 && hex.district !== targetDistrict && state.targetPop > 0) {
        const d = state.districts[targetDistrict];
        if (d && d.population + hex.population > state.targetPop * 1.1) return;
    }

    if (hex.district !== targetDistrict) {
        hex.district = targetDistrict;
        updateHexVisuals(qr);
        // Paint flash micro-animation
        const g = hexElements.get(qr);
        if (g) {
            g.classList.remove('just-painted');
            void g.offsetWidth;
            g.classList.add('just-painted');
        }
    }
}

function handleHover(e, qr) {
    if (state.hoveredHex !== qr) {
        if (state.hoveredHex) {
            const oldEl = hexElements.get(state.hoveredHex);
            if (oldEl) oldEl.classList.remove('hovered');
        }
        state.hoveredHex = qr;
        const el = hexElements.get(qr);
        if (el) el.classList.add('hovered');
    }
    if (state.isPainting) {
        paintHex(e);
        calculateMetrics();
        updateSidebarDetails(state.currentDistrict);
        scheduleBorderUpdate();
    }
    showHexTooltip(e, qr);
}

function showHexTooltip(e, qr) {
    if (!$.tooltip) return;
    if (!qr) { $.tooltip.classList.remove('visible'); return; }
    const hex = state.hexes.get(qr);
    if (!hex) { $.tooltip.classList.remove('visible'); return; }

    const total = hex.votes.red + hex.votes.blue + hex.votes.yellow;
    const pR = total > 0 ? Math.round(hex.votes.red / total * 100) : 0;
    const pB = total > 0 ? Math.round(hex.votes.blue / total * 100) : 0;
    const pY = total > 0 ? Math.round(hex.votes.yellow / total * 100) : 0;

    $.tooltip.innerHTML = `<span class="tt-pop">Pop: ${hex.population.toLocaleString()}</span>`
        + `<div class="tt-votes"><span class="tt-r">R ${pR}%</span> <span class="tt-b">B ${pB}%</span> <span class="tt-y">Y ${pY}%</span></div>`
        + (hex.minority ? `<span class="tt-m">Minority area</span>` : '')
        + (hex.district > 0 ? `<span>District ${hex.district}</span>` : '');

    const rect = $.mapContainer.getBoundingClientRect();
    $.tooltip.style.left = `${e.clientX - rect.left + 12}px`;
    $.tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    $.tooltip.classList.add('visible');
}

// ─── Rendering ───
function getPartyColor(party) {
    return activeColors[party].base;
}

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
        g.querySelector('polygon').style.fill = getPartyColor(hex.partyWinner);
        g.style.opacity = hexOpacity(hex.population);
    }
}

function renderMap() {
    $.hexGroup.innerHTML = '';
    $.minorityGroup.innerHTML = '';
    hexElements.clear();

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
        poly.setAttribute("points", cornersToString(hexCorners(center, CONFIG.hexSize)));
        poly.style.fill = getPartyColor(hex.partyWinner);

        // Staggered radial pop-in
        const dist = Math.sqrt((hex.q + hex.r / 2 - mapCenterX) ** 2 + (hex.r - mapCenterY) ** 2);
        poly.style.animationDelay = `${dist * 0.04 + Math.random() * 0.03}s`;

        g.appendChild(poly);
        $.hexGroup.appendChild(g);
        hexElements.set(qr, g);

        if (hex.minority) {
            const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            circle.setAttribute("cx", center.x);
            circle.setAttribute("cy", center.y);
            circle.setAttribute("r", CONFIG.hexSize * 0.25);
            circle.classList.add('minority-marker');
            circle.style.animationDelay = `${dist * 0.04 + Math.random() * 0.03 + 0.15}s`;
            $.minorityGroup.appendChild(circle);
        }
    });

    const padding = CONFIG.hexSize * 2;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const vb = { x: minX - padding, y: minY - padding, w, h };
    state.viewBox = { ...vb };
    state.origViewBox = { ...vb };
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

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const segments = districtSegments[i];
        if (segments.length === 0) continue;

        // Chain segments into continuous paths
        let dAttr = '';
        const unvisited = [...segments];
        while (unvisited.length > 0) {
            const currentPath = [];
            const startSeg = unvisited.pop();
            currentPath.push(startSeg.c1, startSeg.c2);

            let added = true;
            while (added) {
                added = false;
                const lastPt = currentPath[currentPath.length - 1];
                const firstPt = currentPath[0];
                for (let j = 0; j < unvisited.length; j++) {
                    const s = unvisited[j];
                    const close = (p1, p2) => Math.abs(p1.x - p2.x) < 0.1 && Math.abs(p1.y - p2.y) < 0.1;

                    if (close(s.c1, lastPt)) {
                        currentPath.push(s.c2);
                    } else if (close(s.c2, lastPt)) {
                        currentPath.push(s.c1);
                    } else if (close(s.c2, firstPt)) {
                        currentPath.unshift(s.c1);
                    } else if (close(s.c1, firstPt)) {
                        currentPath.unshift(s.c2);
                    } else {
                        continue;
                    }
                    unvisited.splice(j, 1);
                    added = true;
                    break;
                }
            }

            const isClosed = currentPath.length > 2
                && Math.abs(currentPath[0].x - currentPath[currentPath.length - 1].x) < 0.1
                && Math.abs(currentPath[0].y - currentPath[currentPath.length - 1].y) < 0.1;

            if (isClosed) currentPath.pop();

            dAttr += `M ${fmt(currentPath[0].x)},${fmt(currentPath[0].y)} `;
            for (let k = 1; k < currentPath.length; k++) {
                dAttr += `L ${fmt(currentPath[k].x)},${fmt(currentPath[k].y)} `;
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
        path.style.stroke = activeColors[winner]?.dark || activeColors.none.dark;
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
    let count = 0;
    while (queue.length > 0) {
        const curr = queue.shift();
        count++;
        for (const dir of HEX_DIRS) {
            const neighbor = state.hexes.get(`${curr.q + dir.dq},${curr.r + dir.dr}`);
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
            $.efficiencyGap.style.color = Math.abs(eg) > 0.07 ? 'var(--party-red)' : 'var(--text-primary)';
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
    let totalVotes = { red: 0, blue: 0, yellow: 0 };
    let totalSeats = (seats.red || 0) + (seats.blue || 0) + (seats.yellow || 0);

    state.hexes.forEach(hex => {
        if (hex.district > 0) {
            totalVotes.red += hex.votes.red;
            totalVotes.blue += hex.votes.blue;
            totalVotes.yellow += hex.votes.yellow;
        }
    });

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
        $.detailWinner.style.color = d.winner !== 'none' ? activeColors[d.winner].base : 'var(--text-secondary)';
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
        const pR = (d.votes.red / totalVotes) * 100;
        const pB = (d.votes.blue / totalVotes) * 100;
        const pY = (d.votes.yellow / totalVotes) * 100;
        if ($.voteBarRed) $.voteBarRed.style.width = `${pR}%`;
        if ($.voteBarBlue) $.voteBarBlue.style.width = `${pB}%`;
        if ($.voteBarYellow) $.voteBarYellow.style.width = `${pY}%`;
        if ($.votePctRed) $.votePctRed.textContent = `${Math.round(pR)}% Red`;
        if ($.votePctBlue) $.votePctBlue.textContent = `${Math.round(pB)}% Blue`;
        if ($.votePctYellow) $.votePctYellow.textContent = `${Math.round(pY)}% Yell`;
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
    activeColors = isDark ? CONFIG.colors.dark : CONFIG.colors.light;
    refreshMinOpacity();
    updateThemeIcon();
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

function updateThemeIcon() {
    if (!$.themeBtn) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    const sun = $.themeBtn.querySelector('.icon-sun');
    const moon = $.themeBtn.querySelector('.icon-moon');
    if (sun) sun.style.display = isDark ? 'block' : 'none';
    if (moon) moon.style.display = isDark ? 'none' : 'block';
}

// ─── Touch Handlers ───
function initTouchHandlers() {
    if (!$.svg || !$.mapContainer) return;

    let lastPinchDist = 0;
    let lastPinchCenter = null;
    let isTouchPainting = false;

    $.mapContainer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            isTouchPainting = true;
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                el.dispatchEvent(new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: state.eraseMode ? 2 : 0
                }));
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            isTouchPainting = false;
            stopPainting();
            const [t1, t2] = [e.touches[0], e.touches[1]];
            lastPinchDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            lastPinchCenter = {
                x: (t1.clientX + t2.clientX) / 2,
                y: (t1.clientY + t2.clientY) / 2
            };
        }
    }, { passive: false });

    $.mapContainer.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isTouchPainting) {
            e.preventDefault();
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                el.dispatchEvent(new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 0
                }));
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

                const newW = vb.w * scale;
                const newH = vb.h * scale;

                const minW = state.origViewBox.w * 0.3;
                const maxW = state.origViewBox.w * 3;
                if (newW >= minW && newW <= maxW) {
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
            lastPinchDist = 0;
            lastPinchCenter = null;
        } else if (e.touches.length === 1) {
            lastPinchDist = 0;
            lastPinchCenter = null;
        }
    });

    $.mapContainer.addEventListener('touchcancel', () => {
        isTouchPainting = false;
        lastPinchDist = 0;
        lastPinchCenter = null;
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
