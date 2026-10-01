import { clamp, lerp, smoothstep, remap } from './rng.js';

/**
 * Uniform raster over the city footprint. Everything that must not overlap
 * (roads, water, building footprints) is resolved through these buffers, which
 * is what guarantees "no clipped geometry / no floating buildings / no broken
 * roads" at the structural level rather than by post-hoc fixing.
 */
export class Raster {
  constructor(size, cellSize) {
    this.size = size;
    this.cell = cellSize;
    this.cols = Math.ceil(size / cellSize);
    this.rows = this.cols;
    this.origin = -size / 2;
    this.n = this.cols * this.rows;
    this.data = new Uint8Array(this.n);
  }
  idx(cx, cy) { return cy * this.cols + cx; }
  inside(cx, cy) { return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows; }
  get(cx, cy) { return this.inside(cx, cy) ? this.data[cy * this.cols + cx] : 255; }
  set(cx, cy, v) { if (this.inside(cx, cy)) this.data[cy * this.cols + cx] = v; }
  worldToCell(x, z) {
    return [Math.floor((x - this.origin) / this.cell), Math.floor((z - this.origin) / this.cell)];
  }
  cellToWorld(cx, cy) {
    return [this.origin + (cx + 0.5) * this.cell, this.origin + (cy + 0.5) * this.cell];
  }
  sampleWorld(x, z) { const [cx, cy] = this.worldToCell(x, z); return this.get(cx, cy); }
  fill(v) { this.data.fill(v); }
  rect(x0, y0, x1, y1, v) {
    const [ax, ay] = this.worldToCell(x0, y0), [bx, by] = this.worldToCell(x1, y1);
    for (let y = Math.max(0, ay); y <= Math.min(this.rows - 1, by); y++)
      for (let x = Math.max(0, ax); x <= Math.min(this.cols - 1, bx); x++)
        this.data[y * this.cols + x] = v;
  }
  /** Thick line (world space) — used to stamp road corridors. */
  stroke(x0, y0, x1, y1, halfWidth, v, onlyIfEmpty = false) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(2, Math.ceil(len / (this.cell * 0.5)));
    const r = halfWidth;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t, py = y0 + dy * t;
      const [cx, cy] = this.worldToCell(px, py);
      const cr = Math.ceil(r / this.cell);
      for (let oy = -cr; oy <= cr; oy++)
        for (let ox = -cr; ox <= cr; ox++) {
          const ccx = cx + ox, ccy = cy + oy;
          if (!this.inside(ccx, ccy)) continue;
          const [wx, wz] = this.cellToWorld(ccx, ccy);
          if ((wx - px) * (wx - px) + (wz - py) * (wz - py) > r * r) continue;
          const id = ccy * this.cols + ccx;
          if (onlyIfEmpty && this.data[id] !== 0) continue;
          this.data[id] = v;
        }
    }
  }
  /** Any non-zero cell inside the axis aligned rect? */
  anyIn(x0, y0, x1, y1, pred) {
    const [ax, ay] = this.worldToCell(x0, y0), [bx, by] = this.worldToCell(x1, y1);
    for (let y = Math.max(0, ay); y <= Math.min(this.rows - 1, by); y++)
      for (let x = Math.max(0, ax); x <= Math.min(this.cols - 1, bx); x++) {
        const v = this.data[y * this.cols + x];
        if (pred ? pred(v) : v !== 0) return true;
      }
    return false;
  }
  countIn(x0, y0, x1, y1, pred) {
    const [ax, ay] = this.worldToCell(x0, y0), [bx, by] = this.worldToCell(x1, y1);
    let c = 0;
    for (let y = Math.max(0, ay); y <= Math.min(this.rows - 1, by); y++)
      for (let x = Math.max(0, ax); x <= Math.min(this.cols - 1, bx); x++)
        if (pred(this.data[y * this.cols + x])) c++;
    return c;
  }
  /** Flood fill of cells matching `pred`; returns Uint8Array visited + component list. */
  components(pred) {
    const seen = new Uint8Array(this.n);
    const comps = [];
    const stack = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      if (seen[i] || !pred(this.data[i])) continue;
      let sp = 0, count = 0;
      stack[sp++] = i;
      seen[i] = 1;
      const cells = [];
      while (sp > 0) {
        const cur = stack[--sp];
        count++;
        if (cells.length < 400000) cells.push(cur);
        const cx = cur % this.cols, cy = (cur / this.cols) | 0;
        for (let d = 0; d < 4; d++) {
          const nx = cx + (d === 0 ? 1 : d === 1 ? -1 : 0);
          const ny = cy + (d === 2 ? 1 : d === 3 ? -1 : 0);
          if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
          const ni = ny * this.cols + nx;
          if (seen[ni] || !pred(this.data[ni])) continue;
          seen[ni] = 1; stack[sp++] = ni;
        }
      }
      comps.push({ size: count, root: i, cells });
    }
    comps.sort((a, b) => b.size - a.size);
    return { seen, comps };
  }
}

/** Sparse spatial hash for point queries (building lookup, NPC, props). */
export class SpatialHash {
  constructor(cellSize) { this.cell = cellSize; this.map = new Map(); }
  key(x, z) { return ((Math.floor(x / this.cell)) * 73856093) ^ ((Math.floor(z / this.cell)) * 19349663); }
  insert(x, z, item) {
    const k = this.key(x, z);
    let b = this.map.get(k);
    if (!b) { b = []; this.map.set(k, b); }
    b.push(item);
  }
  query(x, z, radius, out = []) {
    const r = Math.ceil(radius / this.cell);
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let dz = -r; dz <= r; dz++)
      for (let dx = -r; dx <= r; dx++) {
        const b = this.map.get(((cx + dx) * 73856093) ^ ((cz + dz) * 19349663));
        if (b) for (const it of b) out.push(it);
      }
    return out;
  }
}

/** Disjoint set used by the road-network connectivity validator. */
export class UnionFind {
  constructor(n) { this.p = new Int32Array(n).fill(-1); }
  find(a) { while (this.p[a] >= 0) { if (this.p[this.p[a]] >= 0) this.p[a] = this.p[this.p[a]]; a = this.p[a]; } return a; }
  union(a, b) {
    a = this.find(a); b = this.find(b);
    if (a === b) return false;
    if (this.p[a] > this.p[b]) { const t = a; a = b; b = t; }
    this.p[a] += this.p[b]; this.p[b] = a;
    return true;
  }
}

export function forEachCellInRect(raster, x0, y0, x1, y1, fn) {
  const [ax, ay] = raster.worldToCell(x0, y0), [bx, by] = raster.worldToCell(x1, y1);
  for (let y = Math.max(0, ay); y <= Math.min(raster.rows - 1, by); y++)
    for (let x = Math.max(0, ax); x <= Math.min(raster.cols - 1, bx); x++)
      fn(x, y, y * raster.cols + x);
}

export function dist2(ax, az, bx, bz) { const dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
export function dist(ax, az, bx, bz) { return Math.hypot(ax - bx, az - bz); }
export { clamp, lerp, smoothstep, remap };
