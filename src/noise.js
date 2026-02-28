// ─── Noise Functions ───

export function hashNoise(x, y, seed) {
    let n = Math.sin(x * 127.1 + y * 311.7 + seed * 53.3) * 43758.5453;
    return n - Math.floor(n);
}

export function smoothNoise(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const n00 = hashNoise(ix, iy, seed);
    const n10 = hashNoise(ix + 1, iy, seed);
    const n01 = hashNoise(ix, iy + 1, seed);
    const n11 = hashNoise(ix + 1, iy + 1, seed);
    return n00 * (1 - sx) * (1 - sy) + n10 * sx * (1 - sy) + n01 * (1 - sx) * sy + n11 * sx * sy;
}

export function fbmNoise(x, y, seed, octaves = 4) {
    let value = 0, amplitude = 1, frequency = 1, total = 0;
    for (let i = 0; i < octaves; i++) {
        value += smoothNoise(x * frequency, y * frequency, seed + i * 100) * amplitude;
        total += amplitude;
        amplitude *= 0.5;
        frequency *= 2;
    }
    return value / total;
}
