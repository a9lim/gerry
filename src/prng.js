// Mulberry32: fast 32-bit seeded PRNG for deterministic map generation.

/** Returns a function that yields [0, 1) on each call, deterministic from `seed`. */
export function createPRNG(seed) {
    let s = seed | 0;
    return function() {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
}
