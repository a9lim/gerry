// Simulation constants, hex geometry, and shared helpers.

export const CONFIG = {
    numDistricts: 10,
    rows: 18,
    cols: 25,
    hexSize: 18,

    zoomMaxRatio: 3,
    zoomWheelFactor: 1.12,
    zoomButtonFactor: 1.25,
    zoomAnimDuration: 200,
    zoomFitDuration: 300,

    // District population cap = targetPop * popCapRatio.
    popCapRatio: 1.1,
    // Demographic tier thresholds (hex population).
    urbanThreshold: 150,
    suburbanThreshold: 80,

    maxUndoStack: 50,
};

export const SQRT3 = Math.sqrt(3);
export const HEX_W = SQRT3 * CONFIG.hexSize;
export const HEX_H = 1.5 * CONFIG.hexSize;

// Axial-coordinate neighbor offsets (flat-top hexagons, clockwise from east).
export const HEX_DIRS = [
    { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 },
    { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }
];

// Pre-computed unit-circle offsets for flat-top hex vertices (-30 deg start).
export const HEX_CORNER_OFFSETS = Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 180 * (60 * i - 30);
    return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

// Slightly oversized render radius eliminates sub-pixel gaps between hexes.
export const HEX_RENDER_SIZE = CONFIG.hexSize + 0.5;

export const PALETTE_COLOR_MAP = {
    red: 'var(--party-red)',
    blue: 'var(--party-blue)',
    yellow: 'var(--party-yellow)'
};

/** Returns all axial "q,r" keys within `radius` of (q, r). */
export function getHexesInRadius(q, r, radius) {
    const results = [];
    for (let dq = -radius; dq <= radius; dq++) {
        for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
            results.push(`${q + dq},${r + dr}`);
        }
    }
    return results;
}

// Newton-Raphson cubic bezier solver from shared-utils.js.
export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
