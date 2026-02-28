// ─── Configuration & Constants ───

export const CONFIG = {
    numDistricts: 10,
    rows: 18,
    cols: 25,
    hexSize: 18,
};

export const SQRT3 = Math.sqrt(3);
export const HEX_W = SQRT3 * CONFIG.hexSize;
export const HEX_H = 1.5 * CONFIG.hexSize;

export const HEX_DIRS = [
    { dq: 1, dr: 0 }, { dq: 0, dr: 1 }, { dq: -1, dr: 1 },
    { dq: -1, dr: 0 }, { dq: 0, dr: -1 }, { dq: 1, dr: -1 }
];

export const HEX_CORNER_OFFSETS = Array.from({ length: 6 }, (_, i) => {
    const angle = Math.PI / 180 * (60 * i - 30);
    return { dx: Math.cos(angle), dy: Math.sin(angle) };
});

export const HEX_RENDER_SIZE = CONFIG.hexSize + 0.5;

export const PALETTE_COLOR_MAP = {
    red: 'var(--party-red)',
    blue: 'var(--party-blue)',
    yellow: 'var(--party-yellow)'
};

// ─── Cubic Bezier Easing ───
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

export const EASE_OUT = cubicBezier(0.23, 1, 0.32, 1);
