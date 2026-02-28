// ─── Hex Geometry ───
import { HEX_W, HEX_H, HEX_CORNER_OFFSETS } from './config.js';

export function hexToPixel(q, r) {
    return { x: HEX_W * (q + r / 2), y: HEX_H * r };
}

export function hexCorners(center, size) {
    return HEX_CORNER_OFFSETS.map(o => ({
        x: center.x + size * o.dx,
        y: center.y + size * o.dy
    }));
}

export function cornersToString(corners) {
    return corners.map(c => `${c.x},${c.y}`).join(' ');
}

export function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}
