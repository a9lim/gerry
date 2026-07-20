// Mulberry32 PRNG. The generator algorithm lives in /shared/utils.js
// (window.mulberry32); re-exported here under gerry's createPRNG name so
// existing import sites stay stable. Bit-for-bit identical to the prior
// inline implementation, so map seeds still produce the same maps.

/** Returns a function that yields [0, 1) on each call, deterministic from `seed`. */
export const createPRNG = (seed) => mulberry32(seed);

export function randomSeed() {
    return (Math.random() * 4294967296) >>> 0;
}
