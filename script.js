const CONFIG = {
    numDistricts: 10,
    rows: 18,
    cols: 25,
    hexSize: 18,
    colors: {
        light: {
            red: { base: '#b80f2a', dark: '#800a1d', light: '#e83856', muted: '#e1a6b0', district: '#b80f2a' },
            blue: { base: '#0b429c', dark: '#062861', light: '#4d88e8', muted: '#a5bccc', district: '#0b429c' },
            yellow: { base: '#e6a800', dark: '#9c7200', light: '#ffc933', muted: '#ebe4ab', district: '#e6a800' },
            none: { base: '#d1d5db', dark: '#374151', light: '#e5e7eb', muted: '#f3f4f6', district: '#9ca3af' },
            minority: '#1b8a3a'
        },
        dark: {
            red: { base: '#e05060', dark: '#c43848', light: '#f08888', muted: '#4a1820', district: '#e05060' },
            blue: { base: '#5a90e0', dark: '#3868b8', light: '#88b0f0', muted: '#182848', district: '#5a90e0' },
            yellow: { base: '#e0b030', dark: '#b88820', light: '#f0d060', muted: '#3a3010', district: '#e0b030' },
            none: { base: '#5a564e', dark: '#3a3830', light: '#706860', muted: '#2a2820', district: '#5a564e' },
            minority: '#48b070'
        }
    }
};

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
    // Zoom/Pan
    viewBox: { x: 0, y: 0, w: 0, h: 0 },
    origViewBox: { x: 0, y: 0, w: 0, h: 0 },
    isPanning: false,
    panStart: { x: 0, y: 0 },
    zoomLevel: 1,
    // Undo/Redo
    undoStack: [],
    redoStack: [],
    deleteMode: false,
    eraseMode: false,
    maxPop: 100
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

// ─── Animation Utilities ───
const animatedCounters = {};
function animateValue(obj, end, duration, formatFn = Math.round, id) {
    if (!obj) return;
    const start = obj._currentVal || 0;
    if (start === end) {
        obj.innerText = formatFn(end);
        obj._currentVal = end;
        return;
    }

    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart
        const current = progress < 1 ? start + (end - start) * ease : end;

        obj.innerText = formatFn(current);
        obj._currentVal = current;

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
    const mapContainer = document.getElementById('map-container');
    if (mapContainer) mapContainer.classList.add('paused');
    generateHexes();
    setupUI();
    state.targetPop = Math.round(Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts);
    renderMap();
    updateMetrics();
    pushUndoSnapshot();
}

// ─── Simple hash-based noise (no dependencies) ───
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

function generateHexes() {
    let idCounter = 0;
    const centerX = CONFIG.cols / 2;
    const centerY = CONFIG.rows / 2;
    const maxRadius = Math.min(CONFIG.cols, CONFIG.rows) / 2 + 1;

    // Randomize shape noise for dynamic map footprints
    const phase1 = Math.random() * Math.PI * 2;
    const phase2 = Math.random() * Math.PI * 2;
    const freq1 = 2 + Math.random() * 4;
    const freq2 = 3 + Math.random() * 5;
    const amp1 = 1 + Math.random() * 2;
    const amp2 = 0.5 + Math.random() * 2;
    const baseRadius = maxRadius * (0.75 + Math.random() * 0.15);

    let validCoords = [];
    for (let r = 0; r < CONFIG.rows; r++) {
        let r_offset = Math.floor(r / 2);
        for (let q = -r_offset; q < CONFIG.cols - r_offset; q++) {
            let y = r, x = q + r_offset;
            let dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
            let angle = Math.atan2(y - centerY, x - centerX);
            let noise = Math.sin(angle * freq1 + phase1) * amp1 + Math.cos(angle * freq2 + phase2) * amp2;
            if (dist <= baseRadius + noise) {
                validCoords.push({ q, r, x, y, dist });
            }
        }
    }

    // Noise seeds for this map
    const noiseSeed = Math.random() * 10000;
    const partySeed = Math.random() * 10000;
    const minoritySeed = Math.random() * 10000;

    // Generate scattered population centers
    const numLargeCities = Math.floor(Math.random() * 2) + 2;
    const numSmallTowns = Math.floor(Math.random() * 6) + 5;
    const numSuburbs = Math.floor(Math.random() * 4) + 3;
    const centers = [];

    for (let i = 0; i < numLargeCities; i++) {
        const c = validCoords[Math.floor(Math.random() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: Math.random() * 600 + 350, decay: Math.random() * 1.8 + 1.2, type: 'city' });
    }
    for (let i = 0; i < numSuburbs; i++) {
        // Suburbs cluster near cities with irregular offsets
        const city = centers[Math.floor(Math.random() * Math.min(centers.length, numLargeCities))];
        const angle = Math.random() * Math.PI * 2;
        const dist = 1.5 + Math.random() * 4;
        const sq = city.q + Math.round(Math.cos(angle) * dist);
        const sr = city.r + Math.round(Math.sin(angle) * dist);
        centers.push({ q: sq, r: sr, strength: Math.random() * 250 + 100, decay: Math.random() * 1.2 + 0.6, type: 'suburb' });
    }
    for (let i = 0; i < numSmallTowns; i++) {
        const c = validCoords[Math.floor(Math.random() * validCoords.length)];
        centers.push({ q: c.q, r: c.r, strength: Math.random() * 200 + 50, decay: Math.random() * 1.0 + 0.3, type: 'town' });
    }

    // Transportation corridors — lines of elevated population between two cities
    const corridors = [];
    if (centers.length >= 2) {
        const numCorridors = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < numCorridors; i++) {
            const a = centers[Math.floor(Math.random() * numLargeCities)];
            const b = centers[Math.floor(Math.random() * centers.length)];
            if (a !== b) corridors.push({ q1: a.q, r1: a.r, q2: b.q, r2: b.r, width: 1.5 + Math.random(), strength: 60 + Math.random() * 80 });
        }
    }

    const hexDistance = (q1, r1, q2, r2) => (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;

    // Point-to-line-segment distance for corridors
    function distToSegment(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.sqrt((px - (x1 + t * dx)) ** 2 + (py - (y1 + t * dy)) ** 2);
    }

    state.maxPop = 0;

    // Regional political lean — fbm noise creates large-scale political geography
    const leanScale = 0.15 + Math.random() * 0.1;

    validCoords.forEach(c => {
        let q = c.q, r = c.r;

        // Base rural population with multi-octave fbm for rough terrain variation
        const terrainNoise = fbmNoise(q * 0.3, r * 0.3, noiseSeed, 5);
        const microNoise = fbmNoise(q * 1.2, r * 1.2, noiseSeed + 50, 3);
        let pop = Math.floor(3 + terrainNoise * 70 + microNoise * 30 + Math.random() * 20);

        // City/suburb/town contributions with noisy, irregular decay
        centers.forEach(center => {
            const d = hexDistance(q, r, center.q, center.r);
            const localNoise = 0.5 + hashNoise(q, r, noiseSeed + 777) * 1.0;
            const edgeJitter = 0.8 + hashNoise(q * 2.3, r * 2.3, noiseSeed + 555) * 0.4;
            pop += Math.floor(center.strength * Math.exp(-d / (center.decay * edgeJitter)) * localNoise);
        });

        // Corridor population boost
        corridors.forEach(cor => {
            const d = distToSegment(q, r, cor.q1, cor.r1, cor.q2, cor.r2);
            if (d < cor.width * 2.5) {
                const falloff = Math.exp(-d / cor.width);
                pop += Math.floor(cor.strength * falloff * (0.3 + hashNoise(q, r, noiseSeed + 999) * 0.7));
            }
        });

        // Sporadic random population spikes (hamlets, crossroads, factories)
        if (Math.random() < 0.10) pop += Math.floor(Math.random() * 120 + 30);

        // Occasional population voids (parks, water, farmland)
        if (hashNoise(q * 0.8, r * 0.8, noiseSeed + 2000) > 0.82) {
            pop = Math.floor(pop * (0.1 + Math.random() * 0.2));
        }

        // Two layers of multiplicative noise to break up smooth gradients
        pop = Math.floor(pop * (0.4 + hashNoise(q * 1.7, r * 1.7, noiseSeed + 333) * 1.2));
        pop = Math.max(3, Math.floor(pop * (0.7 + hashNoise(q * 3.1, r * 3.1, noiseSeed + 444) * 0.6)));

        if (pop > state.maxPop) state.maxPop = pop;

        // Political lean uses large-scale noise for regional clustering
        const regionalLean = fbmNoise(q * leanScale, r * leanScale, partySeed, 3);
        const isUrban = pop > 150;
        const isSuburban = pop > 80 && pop <= 150;

        // Assign winning party — yellow is a minor third party (~10% of vote)
        let party;
        let roll = Math.random();

        if (isUrban) {
            const blueChance = 0.52 + (regionalLean - 0.5) * 0.3;
            if (roll < blueChance) party = 'blue';
            else if (roll < blueChance + 0.38) party = 'red';
            else party = 'yellow';
        } else if (isSuburban) {
            const lean = regionalLean;
            if (lean > 0.55) {
                if (roll < 0.48) party = 'blue';
                else if (roll < 0.90) party = 'red';
                else party = 'yellow';
            } else {
                if (roll < 0.48) party = 'red';
                else if (roll < 0.90) party = 'blue';
                else party = 'yellow';
            }
        } else {
            const redChance = 0.48 + (0.5 - regionalLean) * 0.3;
            if (roll < redChance) party = 'red';
            else if (roll < redChance + 0.42) party = 'blue';
            else party = 'yellow';
        }

        // Vote distribution: ~45% red, ~45% blue, ~10% yellow overall
        let votes = { red: 0, blue: 0, yellow: 0 };
        // Yellow always gets a small share (~5-15% of each hex)
        const yellowPct = 0.05 + Math.random() * 0.10;
        votes.yellow = Math.floor(pop * yellowPct);
        const majorRemainder = pop - votes.yellow;

        if (party === 'yellow') {
            // Rare yellow-winning hex: give yellow a plurality via a three-way split
            const yellowBoost = 0.30 + Math.random() * 0.10;
            votes.yellow = Math.floor(pop * yellowBoost);
            const rest = pop - votes.yellow;
            const redShare = 0.3 + Math.random() * 0.4;
            votes.red = Math.floor(rest * redShare);
            votes.blue = rest - votes.red;
        } else {
            // Red/blue winner — split the major remainder between them
            const winningPct = 0.50 + Math.random() * 0.30;
            votes[party] = Math.floor(majorRemainder * winningPct);
            const loser = party === 'red' ? 'blue' : 'red';
            votes[loser] = majorRemainder - votes[party];
        }

        // Minority clusters using multi-scale spatial noise — coherent neighborhoods with pockets
        const minorityNoise = fbmNoise(q * 0.35, r * 0.35, minoritySeed, 4)
            * 0.7 + fbmNoise(q * 0.9, r * 0.9, minoritySeed + 500, 3) * 0.3;
        const minorityThreshold = isUrban ? 0.48 : (isSuburban ? 0.60 : 0.78);
        let isMinority = minorityNoise > minorityThreshold;

        let hex = {
            id: ++idCounter, q, r, s: -q - r,
            population: pop,
            votes,
            party,
            minority: isMinority,
            district: 0
        };
        hex.partyWinner = getHexWinner(hex);
        state.hexes.set(`${q},${r}`, hex);
    });

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
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    if (undoBtn) undoBtn.disabled = state.undoStack.length <= 1;
    if (redoBtn) redoBtn.disabled = state.redoStack.length === 0;
}

// ─── Map Operations ───
function randomizeMap() {
    state.deleteMode = false;
    document.getElementById('delete-btn')?.classList.remove('active');
    document.getElementById('map-container')?.classList.remove('delete-mode');

    state.hexes.clear();
    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        state.districts[i] = { id: i, population: 0, votes: { red: 0, blue: 0, yellow: 0 }, hexes: [], minorityPop: 0, isContiguous: true, compactness: 0, winner: 'none' };
    }
    state.undoStack = [];
    state.redoStack = [];
    generateHexes();
    state.targetPop = Math.round(Array.from(state.hexes.values()).reduce((sum, h) => sum + h.population, 0) / CONFIG.numDistricts);
    renderMap();
    updateMetrics();
    pushUndoSnapshot();
}

function resetMap() {
    state.deleteMode = false;
    document.getElementById('delete-btn')?.classList.remove('active');
    document.getElementById('map-container')?.classList.remove('delete-mode');

    state.hexes.forEach(hex => { hex.district = 0; });
    calculateMetrics();
    state.hexes.forEach((hex, qr) => updateHexVisuals(qr));
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
        state.hexes.forEach((hex, qr) => updateHexVisuals(qr));
        renderBorders();
        updateMetrics();
        pushUndoSnapshot();
    }
}

// ─── UI Setup ───
function setupUI() {
    const selector = document.getElementById('district-selector');
    if (selector) selector.innerHTML = '';

    const svg = document.getElementById('hex-map');
    svg.addEventListener('mousedown', onMouseDown);
    svg.addEventListener('mouseup', onMouseUp);
    svg.addEventListener('mouseleave', (e) => {
        onMouseUp(e);
        const tooltip = document.getElementById('hex-tooltip');
        if (tooltip) tooltip.classList.remove('visible');
        if (state.hoveredHex) {
            const oldEl = document.querySelector(`.hex[data-qr="${state.hoveredHex}"]`);
            if (oldEl) oldEl.classList.remove('hovered');
            state.hoveredHex = null;
        }
    });
    svg.addEventListener('mousemove', onMouseMove);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', e => e.preventDefault());

    // Header buttons
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetMap);

    const randomizeBtn = document.getElementById('randomize-btn');
    if (randomizeBtn) randomizeBtn.addEventListener('click', randomizeMap);

    const deleteBtn = document.getElementById('delete-btn');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            state.deleteMode = !state.deleteMode;
            deleteBtn.classList.toggle('active', state.deleteMode);
            const container = document.getElementById('map-container');
            container.classList.toggle('delete-mode', state.deleteMode);
            // Mutually exclusive with erase mode
            if (state.deleteMode && state.eraseMode) {
                state.eraseMode = false;
                document.getElementById('erase-btn')?.classList.remove('active');
                container.classList.remove('erase-mode');
            }
        });
    }

    // Erase mode toggle
    const eraseBtn = document.getElementById('erase-btn');
    if (eraseBtn) {
        eraseBtn.addEventListener('click', () => {
            state.eraseMode = !state.eraseMode;
            eraseBtn.classList.toggle('active', state.eraseMode);
            const container = document.getElementById('map-container');
            container.classList.toggle('erase-mode', state.eraseMode);
            // Mutually exclusive with delete mode
            if (state.eraseMode && state.deleteMode) {
                state.deleteMode = false;
                document.getElementById('delete-btn')?.classList.remove('active');
                container.classList.remove('delete-mode');
            }
        });
    }

    // Undo/redo buttons
    const undoBtn = document.getElementById('undo-btn');
    if (undoBtn) undoBtn.addEventListener('click', undo);
    const redoBtn = document.getElementById('redo-btn');
    if (redoBtn) redoBtn.addEventListener('click', redo);

    // Theme toggle
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // Zoom controls
    const zoomInBtn = document.getElementById('zoom-in-btn');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => smoothZoom(1));
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => smoothZoom(-1));
    const zoomFitBtn = document.getElementById('zoom-fit-btn');
    if (zoomFitBtn) zoomFitBtn.addEventListener('click', zoomToFit);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    });

    // Intro screen
    const introStart = document.getElementById('intro-start');
    const introScreen = document.getElementById('intro-screen');
    if (introStart && introScreen) {
        introStart.addEventListener('click', () => {
            introScreen.classList.add('hidden');
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) mapContainer.classList.remove('paused');
            setTimeout(() => { introScreen.style.display = 'none'; }, 650);
        });
    }
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
    updateZoomDisplay();
}

function smoothZoom(direction) {
    const svg = document.getElementById('hex-map');
    const vb = state.viewBox;

    const cx = vb.x + vb.w / 2;
    const cy = vb.y + vb.h / 2;

    const factor = direction > 0 ? 1 / 1.25 : 1.25;
    const targetW = vb.w * factor;
    const targetH = vb.h * factor;

    const minW = state.origViewBox.w * 0.3;
    const maxW = state.origViewBox.w * 3;
    if (targetW < minW || targetW > maxW) return;

    const startVb = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    const endVb = {
        x: cx - targetW / 2,
        y: cy - targetH / 2,
        w: targetW,
        h: targetH
    };

    const duration = 200;
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

        svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
        updateZoomDisplay();

        if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

function zoomToFit() {
    const svg = document.getElementById('hex-map');
    const vb = state.viewBox;
    const orig = state.origViewBox;

    const startVb = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    const duration = 300;
    let start = null;

    function step(ts) {
        if (!start) start = ts;
        const t = Math.min((ts - start) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 3);

        vb.x = startVb.x + (orig.x - startVb.x) * ease;
        vb.y = startVb.y + (orig.y - startVb.y) * ease;
        vb.w = startVb.w + (orig.w - startVb.w) * ease;
        vb.h = startVb.h + (orig.h - startVb.h) * ease;
        state.zoomLevel = state.origViewBox.w / vb.w;

        svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
        updateZoomDisplay();

        if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
}

function updateZoomDisplay() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = `${Math.round(state.zoomLevel * 100)}%`;
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
    if (qr) {
        handleHover(e, qr);
    } else {
        // Hide tooltip when not on a hex
        const tooltip = document.getElementById('hex-tooltip');
        if (tooltip) tooltip.classList.remove('visible');
        if (state.hoveredHex) {
            const oldEl = document.querySelector(`.hex[data-qr="${state.hoveredHex}"]`);
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
        // Paint flash micro-animation
        const g = document.querySelector(`.hex[data-qr="${qr}"]`);
        if (g) {
            g.classList.remove('just-painted');
            void g.offsetWidth; // force reflow to restart animation
            g.classList.add('just-painted');
        }
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
        calculateMetrics();
        updateSidebarDetails(state.currentDistrict);
        scheduleBorderUpdate();
    }
    showHexTooltip(e, qr);
}

function showHexTooltip(e, qr) {
    const tooltip = document.getElementById('hex-tooltip');
    if (!tooltip) return;
    if (!qr) { tooltip.classList.remove('visible'); return; }
    const hex = state.hexes.get(qr);
    if (!hex) { tooltip.classList.remove('visible'); return; }

    const total = hex.votes.red + hex.votes.blue + hex.votes.yellow;
    const pR = total > 0 ? Math.round(hex.votes.red / total * 100) : 0;
    const pB = total > 0 ? Math.round(hex.votes.blue / total * 100) : 0;
    const pY = total > 0 ? Math.round(hex.votes.yellow / total * 100) : 0;

    tooltip.innerHTML = `<span class="tt-pop">Pop: ${hex.population.toLocaleString()}</span>`
        + `<div class="tt-votes"><span class="tt-r">R ${pR}%</span> <span class="tt-b">B ${pB}%</span> <span class="tt-y">Y ${pY}%</span></div>`
        + (hex.minority ? `<span class="tt-m">Minority area</span>` : '')
        + (hex.district > 0 ? `<span>District ${hex.district}</span>` : '');

    const container = document.getElementById('map-container');
    const rect = container.getBoundingClientRect();
    tooltip.style.left = `${e.clientX - rect.left + 12}px`;
    tooltip.style.top = `${e.clientY - rect.top - 10}px`;
    tooltip.classList.add('visible');
}

// ─── Rendering ───
function getPartyColor(party, isMuted) {
    return activeColors[party][isMuted ? 'muted' : 'base'];
}

let _cachedMinOpacity = 0.22;

function refreshMinOpacity() {
    const val = getComputedStyle(document.documentElement).getPropertyValue('--hex-min-opacity');
    _cachedMinOpacity = parseFloat(val) || 0.22;
}

function hexOpacity(population) {
    const min = _cachedMinOpacity;
    return Math.max(min, Math.min(1.0, min + (1 - min) * (population / state.maxPop)));
}

function updateHexVisuals(qr) {
    const hex = state.hexes.get(qr);
    const g = document.querySelector(`.hex[data-qr="${qr}"]`);
    if (g) {
        g.querySelector('polygon').style.fill = getPartyColor(hex.partyWinner, false);
        g.style.opacity = hexOpacity(hex.population);
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
        g.style.opacity = hexOpacity(hex.population);

        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        poly.setAttribute("points", cornersToString(hexCorners(center, CONFIG.hexSize)));
        poly.style.fill = getPartyColor(hex.partyWinner, false);

        // Staggered radial pop-in from center
        const mapCenterX = CONFIG.cols / 2;
        const mapCenterY = CONFIG.rows / 2;
        const dist = Math.sqrt(Math.pow(hex.q + hex.r / 2 - mapCenterX, 2) + Math.pow(hex.r - mapCenterY, 2));
        const delay = dist * 0.04 + Math.random() * 0.03;
        poly.style.animationDelay = `${delay}s`;

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
            circle.style.animationDelay = `${delay + 0.15}s`;
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
                const inset = 0;
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
        let unvisited = [...segments];
        while (unvisited.length > 0) {
            let currentPath = [];
            let startSeg = unvisited.pop();
            currentPath.push(startSeg.c1, startSeg.c2);

            let added = true;
            while (added) {
                added = false;
                const lastPt = currentPath[currentPath.length - 1];
                const firstPt = currentPath[0];
                for (let j = 0; j < unvisited.length; j++) {
                    const s = unvisited[j];
                    const isClose = (p1, p2) => Math.abs(p1.x - p2.x) < 0.1 && Math.abs(p1.y - p2.y) < 0.1;

                    if (isClose(s.c1, lastPt)) {
                        currentPath.push(s.c2);
                        unvisited.splice(j, 1);
                        added = true; break;
                    } else if (isClose(s.c2, lastPt)) {
                        currentPath.push(s.c1);
                        unvisited.splice(j, 1);
                        added = true; break;
                    } else if (isClose(s.c2, firstPt)) {
                        currentPath.unshift(s.c1);
                        unvisited.splice(j, 1);
                        added = true; break;
                    } else if (isClose(s.c1, firstPt)) {
                        currentPath.unshift(s.c2);
                        unvisited.splice(j, 1);
                        added = true; break;
                    }
                }
            }

            const isClosed = Math.abs(currentPath[0].x - currentPath[currentPath.length - 1].x) < 0.1 &&
                Math.abs(currentPath[0].y - currentPath[currentPath.length - 1].y) < 0.1;

            if (isClosed && currentPath.length > 2) {
                currentPath.pop();
                dAttr += `M ${fmt(currentPath[0].x)},${fmt(currentPath[0].y)} `;
                for (let k = 1; k < currentPath.length; k++) {
                    dAttr += `L ${fmt(currentPath[k].x)},${fmt(currentPath[k].y)} `;
                }
                dAttr += 'Z ';
            } else {
                dAttr += `M ${fmt(currentPath[0].x)},${fmt(currentPath[0].y)} `;
                for (let k = 1; k < currentPath.length; k++) {
                    dAttr += `L ${fmt(currentPath[k].x)},${fmt(currentPath[k].y)} `;
                }
            }
        }

        const dAttrTrimmed = dAttr.trim();

        let defs = document.getElementById('map-defs');
        if (!defs) {
            const svg = document.getElementById('hex-map');
            defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
            defs.id = 'map-defs';
            svg.insertBefore(defs, svg.firstChild);
        }

        let clip = document.getElementById(`clip-d-${i}`);
        if (!clip) {
            clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
            clip.id = `clip-d-${i}`;
            defs.appendChild(clip);
        }

        // Build a perfect mask using the district's hex polygons
        let clipHTML = '';
        state.districts[i].hexes.forEach(hex => {
            const center = hexToPixel(hex.q, hex.r);
            const corners = hexCorners(center, CONFIG.hexSize);
            let hexPath = `M ${fmt(corners[0].x)},${fmt(corners[0].y)} `;
            for (let c = 1; c < 6; c++) hexPath += `L ${fmt(corners[c].x)},${fmt(corners[c].y)} `;
            hexPath += 'Z';
            clipHTML += `<path d="${hexPath}"></path>`;
        });
        clip.innerHTML = clipHTML;

        const d = state.districts[i];
        let winner = d && d.winner !== 'none' ? d.winner : 'none';
        const isMM = d && d.isMinorityMajority;

        // Draw the thick MAIN party color stroke FIRST
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", dAttrTrimmed);
        path.setAttribute("clip-path", `url(#clip-d-${i})`);

        if (winner === 'red') path.style.stroke = activeColors.red.dark;
        else if (winner === 'blue') path.style.stroke = activeColors.blue.dark;
        else if (winner === 'yellow') path.style.stroke = activeColors.yellow.dark;
        else path.style.stroke = activeColors.none.dark;

        path.classList.add('district-path', 'outline');
        districtGroups[i].appendChild(path);

        // Draw the thin GREEN overlay SECOND (it will sit on top, right on the boundary edge)
        if (isMM) {
            const mmPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            mmPath.setAttribute("d", dAttrTrimmed);
            mmPath.setAttribute("clip-path", `url(#clip-d-${i})`);
            mmPath.classList.add('district-path', 'mmd-overlay');
            districtGroups[i].appendChild(mmPath);
        }
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

    animateValue(document.getElementById('red-seats'), seats.red, 600, v => Math.round(v) + (Math.round(v) === 1 ? ' Seat' : ' Seats'), 'seats-red');
    animateValue(document.getElementById('blue-seats'), seats.blue, 600, v => Math.round(v) + (Math.round(v) === 1 ? ' Seat' : ' Seats'), 'seats-blue');
    animateValue(document.getElementById('yellow-seats'), seats.yellow, 600, v => Math.round(v) + (Math.round(v) === 1 ? ' Seat' : ' Seats'), 'seats-yellow');
    document.getElementById('mmd-count').innerText = `${mmdCount} / 2 min`;
    document.getElementById('district-count').innerText = `${activeDistrictCount} / ${CONFIG.numDistricts}`;

    // Efficiency Gap
    const eg = calculateEfficiencyGap();
    const egEl = document.getElementById('efficiency-gap');
    if (eg !== null) {
        const pct = (eg * 100).toFixed(1);
        const direction = eg > 0 ? '→ Blue' : '→ Red';
        egEl.innerText = `${Math.abs(pct)}% ${direction}`;
        egEl.style.color = Math.abs(eg) > 0.07 ? 'var(--party-red)' : 'var(--text-primary)';
    } else {
        egEl.innerText = '—';
        egEl.style.color = 'var(--text-secondary)';
    }

    updateSidebarDetails(state.currentDistrict);
    updateProportionality(seats);
    renderDistrictLabels();
}

// ─── Popular Vote vs Seats ───
function updateProportionality(seats) {
    // Calculate total popular vote across all hexes in assigned districts
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

    ['red', 'blue', 'yellow'].forEach(party => {
        const votePct = grandTotal > 0 ? (totalVotes[party] / grandTotal) * 100 : 0;
        const seatPct = totalSeats > 0 ? ((seats[party] || 0) / totalSeats) * 100 : 0;

        const voteBar = document.getElementById(`prop-${party}-votes`);
        const seatBar = document.getElementById(`prop-${party}-seats`);
        const voteLbl = document.getElementById(`prop-${party}-vote-pct`);
        const seatLbl = document.getElementById(`prop-${party}-seat-pct`);

        if (voteBar) voteBar.style.width = `${votePct}%`;
        if (seatBar) seatBar.style.width = `${seatPct}%`;
        if (voteLbl) voteLbl.innerText = grandTotal > 0 ? `${Math.round(votePct)}% votes` : '—';
        if (seatLbl) seatLbl.innerText = totalSeats > 0 ? `${Math.round(seatPct)}% seats` : '—';
    });
}

// ─── District Number Labels ───
function renderDistrictLabels() {
    const labelGroup = document.getElementById('label-group');
    if (!labelGroup) return;
    labelGroup.innerHTML = '';

    for (let i = 1; i <= CONFIG.numDistricts; i++) {
        const d = state.districts[i];
        if (!d || d.hexes.length === 0) continue;

        // Calculate centroid
        let cx = 0, cy = 0;
        d.hexes.forEach(hex => {
            const p = hexToPixel(hex.q, hex.r);
            cx += p.x;
            cy += p.y;
        });
        cx /= d.hexes.length;
        cy /= d.hexes.length;

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", cx);
        text.setAttribute("y", cy);
        text.classList.add('district-label');
        text.textContent = i;
        labelGroup.appendChild(text);
    }
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
            document.getElementById('detail-title').style.color = 'var(--party-red)';
        } else {
            document.getElementById('detail-title').style.color = 'inherit';
        }
    }

    const wSpan = document.getElementById('detail-winner');
    wSpan.innerText = d.winner.charAt(0).toUpperCase() + d.winner.slice(1);
    wSpan.style.color = d.winner !== 'none' ? activeColors[d.winner].base : 'var(--text-secondary)';

    const totalVotes = d.votes.red + d.votes.blue + d.votes.yellow;
    if (totalVotes > 0) {
        let votesArr = [d.votes.red, d.votes.blue, d.votes.yellow].sort((a, b) => b - a);
        const margin = ((votesArr[0] - votesArr[1]) / totalVotes * 100);
        animateValue(document.getElementById('detail-margin'), margin, 600, v => `+${v.toFixed(1)}%`, 'detail-margin');
    } else {
        document.getElementById('detail-margin').innerText = '-';
    }

    animateValue(document.getElementById('detail-pop'), d.population, 600, v => Math.round(v).toLocaleString(), 'detail-pop');
    document.getElementById('target-pop').innerText = state.targetPop.toLocaleString();

    if (state.targetPop > 0) {
        let dev = ((d.population - state.targetPop) / state.targetPop) * 100;
        let devEl = document.getElementById('detail-deviation');
        animateValue(devEl, dev, 600, v => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`, 'detail-dev');
        devEl.style.color = Math.abs(dev) > 10 ? 'var(--party-red)' : 'var(--text-secondary)';
    }

    animateValue(document.getElementById('detail-compactness'), d.compactness, 600, v => `${Math.round(v)}%`, 'detail-comp');

    const cont = document.getElementById('detail-contiguous');
    cont.innerText = d.isContiguous ? 'Yes' : 'No';
    cont.style.color = d.isContiguous ? 'var(--party-green)' : 'var(--party-red)';

    const mmEl = document.getElementById('detail-mm');
    if (mmEl) {
        mmEl.innerText = d.isMinorityMajority ? 'Yes' : 'No';
        mmEl.style.color = d.isMinorityMajority ? 'var(--party-green)' : 'var(--text-secondary)';
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

// ─── Theme Management ───
function initTheme() {
    const saved = localStorage.getItem('gerry-theme');
    if (saved) {
        document.documentElement.dataset.theme = saved;
    } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    }
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
    // Re-render all hex visuals and borders for the new palette
    state.hexes.forEach((hex, qr) => updateHexVisuals(qr));
    renderBorders();
}

function updateThemeIcon() {
    const btn = document.getElementById('theme-btn');
    if (!btn) return;
    const isDark = document.documentElement.dataset.theme === 'dark';
    const sun = btn.querySelector('.icon-sun');
    const moon = btn.querySelector('.icon-moon');
    if (sun) sun.style.display = isDark ? 'block' : 'none';
    if (moon) moon.style.display = isDark ? 'none' : 'block';
}

// ─── Sidebar Resize ───
function initSidebarResize() {
    const handle = document.getElementById('sidebar-resize-handle');
    const sidebar = document.getElementById('sidebar');
    if (!handle || !sidebar) return;

    let isResizing = false;
    let startX, startWidth;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        sidebar.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const dx = startX - e.clientX;
        const newWidth = Math.max(300, Math.min(560, startWidth + dx));
        sidebar.style.width = `${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        sidebar.style.transition = '';
    });
}

// ─── Touch Handlers (mobile pinch-to-zoom & paint) ───
function initTouchHandlers() {
    const svg = document.getElementById('hex-map');
    const container = document.getElementById('map-container');
    if (!svg || !container) return;

    let lastPinchDist = 0;
    let lastPinchCenter = null;
    let isTouchPainting = false;

    container.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            e.preventDefault();
            isTouchPainting = true;
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                const simEvent = new MouseEvent('mousedown', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: state.eraseMode ? 2 : 0
                });
                el.dispatchEvent(simEvent);
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

    container.addEventListener('touchmove', (e) => {
        if (e.touches.length === 1 && isTouchPainting) {
            e.preventDefault();
            const touch = e.touches[0];
            const el = document.elementFromPoint(touch.clientX, touch.clientY);
            if (el) {
                const simEvent = new MouseEvent('mousemove', {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    button: 0
                });
                el.dispatchEvent(simEvent);
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
                const rect = svg.getBoundingClientRect();

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
                    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
                    updateZoomDisplay();
                }

                // Pan with two-finger drag
                if (lastPinchCenter) {
                    const dx = (lastPinchCenter.x - center.x) / rect.width * vb.w;
                    const dy = (lastPinchCenter.y - center.y) / rect.height * vb.h;
                    vb.x += dx;
                    vb.y += dy;
                    svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
                }
            }

            lastPinchDist = dist;
            lastPinchCenter = center;
        }
    }, { passive: false });

    container.addEventListener('touchend', (e) => {
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

    container.addEventListener('touchcancel', () => {
        isTouchPainting = false;
        lastPinchDist = 0;
        lastPinchCenter = null;
        stopPainting();
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    init();
    initSidebarResize();
    initTouchHandlers();
});
