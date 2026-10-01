/**
 * Deterministic pseudo-random utilities.
 * Every generator stage draws from a *named* sub-stream so that changing one
 * stage can never shift the output of another (important for reproducible seeds).
 */

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

export class RNG {
  constructor(seed, stream = 'root') {
    if (typeof seed === 'string') seed = xmur3(seed)();
    this.seed = seed >>> 0;
    this.stream = stream;
    this._f = mulberry32(xmur3(stream + ':' + this.seed)());
    this._spare = null;
  }

  /** Named sub-stream: independent of every other stream. */
  derive(name) { return new RNG(this.seed, this.stream + '/' + name); }

  next() { return this._f(); }

  float(a = 0, b = 1) { return a + (b - a) * this._f(); }
  int(a, b) { return a + Math.floor(this._f() * (b - a + 1)); }
  bool(p = 0.5) { return this._f() < p; }
  sign() { return this._f() < 0.5 ? -1 : 1; }

  pick(arr) { return arr[Math.floor(this._f() * arr.length) % arr.length]; }

  /** Fisher-Yates, non-mutating. */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this._f() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Weighted pick over [{weight|w}] */
  weighted(items, wKey = 'weight') {
    let total = 0;
    for (const it of items) total += (it[wKey] ?? it.weight ?? 1);
    let r = this._f() * total;
    for (const it of items) {
      r -= (it[wKey] ?? it.weight ?? 1);
      if (r <= 0) return it;
    }
    return items[items.length - 1];
  }

  /** Standard normal via Box-Muller with caching. */
  gauss(mean = 0, sd = 1) {
    if (this._spare !== null) { const s = this._spare; this._spare = null; return mean + sd * s; }
    let u = 0, v = 0, s = 0;
    do {
      u = this._f() * 2 - 1;
      v = this._f() * 2 - 1;
      s = u * u + v * v;
    } while (s === 0 || s >= 1);
    const m = Math.sqrt(-2 * Math.log(s) / s);
    this._spare = v * m;
    return mean + sd * (u * m);
  }

  /** Log-normal, clamped. Used for building heights. */
  logNormal(mode, sigma, lo, hi) {
    const mu = Math.log(Math.max(0.001, mode));
    let h = Math.exp(mu + sigma * this.gauss());
    if (h < lo) h = lo + (lo - h) * 0.25;
    if (h > hi) h = hi - (h - hi) * 0.12;
    return clamp(h, lo, hi);
  }

  /** Random point in an annulus. */
  annulus(rMin, rMax) {
    const a = this._f() * Math.PI * 2;
    const r = Math.sqrt(this.float(rMin * rMin, rMax * rMax));
    return [Math.cos(a) * r, Math.sin(a) * r];
  }

  /** Perlin-ish signed noise in [-1,1], resolution independent. */
  noise2(x, y) { return valueNoise2(x, y, this._f0 || (this._f0 = 1)); }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const remap = (v, a, b, c, d) => lerp(c, d, clamp(invLerp(a, b, v), 0, 1));

/* ------------------------------------------------------------------ *
 * Hash / gradient noise (deterministic, no allocation in the hot path)
 * ------------------------------------------------------------------ */
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function valueNoise2(x, y, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}

/** Fractal Brownian motion, returns [-1,1]. */
export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5, seed = 1) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2(x * freq, y * freq, seed + i * 131);
    norm += amp;
    amp *= gain; freq *= lacunarity;
  }
  return sum / norm;
}

/** Ridged fbm — good for mountain silhouettes. */
export function ridged2(x, y, octaves = 4, seed = 1) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * (1 - Math.abs(valueNoise2(x * freq, y * freq, seed + i * 977)));
    norm += amp; amp *= 0.5; freq *= 2.07;
  }
  return sum / norm;
}

/** Poisson-disc-ish jittered lattice sampling; returns [x,y] pairs. */
export function jitteredGrid(rng, x0, y0, x1, y1, step, jitter = 0.42) {
  const pts = [];
  for (let y = y0; y < y1; y += step)
    for (let x = x0; x < x1; x += step)
      pts.push([x + rng.float(-jitter, jitter) * step, y + rng.float(-jitter, jitter) * step]);
  return pts;
}

/** Seed phrase generator so the UI can show a memorable city code. */
const SYL_A = ['NEO', 'KYO', 'SHIN', 'HEX', 'ORO', 'ZAN', 'VEX', 'KAI', 'RYU', 'ARC', 'OBI', 'TSU'];
const SYL_B = ['KOWLOON', 'JAYA', 'PORT', 'GRID', 'SPIRE', 'HARBOR', 'DELTA', 'NEXUS', 'CASCADE', 'VERTEX'];
export function randomCityName(rng) {
  return rng.pick(SYL_A) + '-' + rng.pick(SYL_B) + ' ' + rng.int(20, 21) + rng.int(0, 99);
}
