// Axial hex coordinate geometry: pixel conversion, vertex computation, distance.
import { HEX_W, HEX_H, HEX_CORNER_OFFSETS } from './config.js';

/** Axial (q, r) to pixel center for flat-top hexagons. */
export function hexToPixel(q, r) {
    return { x: HEX_W * (q + r / 2), y: HEX_H * r };
}

/** Six vertex positions around `center` at the given `size`. */
export function hexCorners(center, size) {
    return HEX_CORNER_OFFSETS.map(o => ({
        x: center.x + size * o.dx,
        y: center.y + size * o.dy
    }));
}

/** Joins corner points into an SVG polygon `points` attribute string. */
export function cornersToString(corners) {
    return corners.map(c => `${c.x},${c.y}`).join(' ');
}

/** Axial hex distance (equivalent to cube Manhattan / 2). */
export function hexDistance(q1, r1, q2, r2) {
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}
