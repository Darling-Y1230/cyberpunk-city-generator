import * as THREE from 'three';

/**
 * models/primitives.js — the geometry soil of the city.
 *
 * Everything solid is emitted through MeshBuilder so that a whole district
 * ends up as ONE BufferGeometry with ONE material: road, tower, slum shack and
 * cargo crane all speak the same per-vertex language
 *
 *    position / normal / uv(meters) / aData(seed,flags,litRatio,emissive)
 *                                  / aData2(baseY,height,hue,dirt)
 *
 * which is what keeps a 2048 m city inside a few hundred draw calls.
 */
export class MeshBuilder {
  constructor() {
    this.reset();
  }
  /** Set true to fail loudly on a non-finite primitive argument. */
  static DEBUG = false;
  static _chk(where, ...vals) {
    if (!MeshBuilder.DEBUG) return;
    for (let i = 0; i < vals.length; i++) {
      if (!Number.isFinite(vals[i])) {
        throw new Error(`MeshBuilder.${where}: argument ${i} is ${vals[i]} (args: ${vals.join(', ')})`);
      }
    }
  }
  reset() {
    this.pos = []; this.nor = []; this.uv = []; this.d1 = []; this.d2 = []; this.idx = [];
    this.vcount = 0;
    return this;
  }
  get empty() { return this.vcount === 0; }

  vert(x, y, z, nx, ny, nz, u, v, a, b) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.uv.push(u, v);
    this.d1.push(a[0], a[1], a[2], a[3]);
    this.d2.push(b[0], b[1], b[2], b[3]);
    return this.vcount++;
  }

  /** p0..p3 counter-clockwise when viewed from the normal side. */
  quad(p0, p1, p2, p3, uvs, n, a, b) {
    const i0 = this.vert(p0[0], p0[1], p0[2], n[0], n[1], n[2], uvs[0][0], uvs[0][1], a, b);
    const i1 = this.vert(p1[0], p1[1], p1[2], n[0], n[1], n[2], uvs[1][0], uvs[1][1], a, b);
    const i2 = this.vert(p2[0], p2[1], p2[2], n[0], n[1], n[2], uvs[2][0], uvs[2][1], a, b);
    const i3 = this.vert(p3[0], p3[1], p3[2], n[0], n[1], n[2], uvs[3][0], uvs[3][1], a, b);
    this.idx.push(i0, i1, i2, i0, i2, i3);
    return this;
  }

  /**
   * Axis aligned (optionally Y-rotated) box with metre-true UVs.
   * opts: { uo, vo, rotY, skip:{top,bottom,px,nx,pz,nz} }
   */
  box(cx, cy, cz, sx, sy, sz, a, b, opts = {}) {
    const rot = opts.rotY || 0, cs = Math.cos(rot), sn = Math.sin(rot);
    MeshBuilder._chk('box', cx, cy, cz, sx, sy, sz, rot);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const uo = opts.uo || 0, vo = opts.vo || 0;
    const T = (x, y, z) => [
      cx + x * cs + z * sn,
      cy + y,
      cz - x * sn + z * cs,
    ];
    const skip = opts.skip || {};
    const uA = uo, uB = uo + sx, uC = uo + sz;

    if (!skip.top) this.quad(T(-hx, hy, -hz), T(-hx, hy, hz), T(hx, hy, hz), T(hx, hy, -hz),
      [[uA, vo + hz * 2], [uA, vo], [uC, vo], [uC, vo + hz * 2]], [0, 1, 0], a, b);
    if (!skip.bottom) this.quad(T(-hx, -hy, hz), T(-hx, -hy, -hz), T(hx, -hy, -hz), T(hx, -hy, hz),
      [[uA, 0], [uA, sz], [uC, sz], [uC, 0]], [0, -1, 0], a, b);
    // +X
    if (!skip.px) this.quad(T(hx, -hy, -hz), T(hx, -hy, hz), T(hx, hy, hz), T(hx, hy, -hz),
      [[uo, vo], [uo + sz, vo], [uo + sz, vo + sy], [uo, vo + sy]],
      [cs, 0, -sn], a, b);
    // -X
    if (!skip.nx) this.quad(T(-hx, -hy, hz), T(-hx, -hy, -hz), T(-hx, hy, -hz), T(-hx, hy, hz),
      [[uo, vo], [uo + sz, vo], [uo + sz, vo + sy], [uo, vo + sy]],
      [-cs, 0, sn], a, b);
    // +Z
    if (!skip.pz) this.quad(T(hx, -hy, hz), T(-hx, -hy, hz), T(-hx, hy, hz), T(hx, hy, hz),
      [[uo, vo], [uo + sx, vo], [uo + sx, vo + sy], [uo, vo + sy]],
      [sn, 0, cs], a, b);
    // -Z
    if (!skip.nz) this.quad(T(-hx, -hy, -hz), T(hx, -hy, -hz), T(hx, hy, -hz), T(-hx, hy, -hz),
      [[uo, vo], [uo + sx, vo], [uo + sx, vo + sy], [uo, vo + sy]],
      [-sn, 0, -cs], a, b);
    return this;
  }

  /**
   * Tapered box (frustum) — the workhorse for set-back towers.
   * y0..y1 vertical extent, (w0,d0) at the base, (w1,d1) at the top.
   */
  frustum(cx, y0, cz, y1, w0, d0, w1, d1, a, b, opts = {}) {
    const rot = opts.rotY || 0, cs = Math.cos(rot), sn = Math.sin(rot);
    MeshBuilder._chk('frustum', cx, y0, cz, y1, w0, d0, w1, d1, rot);
    const uo = opts.uo || 0, vo = opts.vo || 0;
    const h = y1 - y0;
    const T = (x, y, z) => [cx + x * cs + z * sn, y, cz - x * sn + z * cs];
    const a0 = [-w0 / 2, -d0 / 2], a1 = [w0 / 2, -d0 / 2], a2 = [w0 / 2, d0 / 2], a3 = [-w0 / 2, d0 / 2];
    const b0 = [-w1 / 2, -d1 / 2], b1 = [w1 / 2, -d1 / 2], b2 = [w1 / 2, d1 / 2], b3 = [-w1 / 2, d1 / 2];
    // NB: the base ring is P and the top ring is Q — `a`/`b` are the per-vertex
    // data blocks and must not be shadowed here.
    const P = [a0, a1, a2, a3], Q = [b0, b1, b2, b3];
    const mk = (i0, i1, n) => {
      const fw = Math.hypot(P[i1][0] - P[i0][0], P[i1][1] - P[i0][1]);
      this.quad(
        T(P[i0][0], y0, P[i0][1]), T(P[i1][0], y0, P[i1][1]),
        T(Q[i1][0], y1, Q[i1][1]), T(Q[i0][0], y1, Q[i0][1]),
        [[uo, vo], [uo + fw, vo], [uo + fw, vo + h], [uo, vo + h]], n, a, b);
    };
    mk(0, 1, [cs, 0, -sn]);
    mk(1, 2, [sn, 0, cs]);
    mk(2, 3, [-cs, 0, sn]);
    mk(3, 0, [-sn, 0, -cs]);
    if (!opts.noCap) {
      this.quad(T(b0[0], y1, b0[1]), T(b1[0], y1, b1[1]), T(b2[0], y1, b2[1]), T(b3[0], y1, b3[1]),
        [[uo, vo], [uo + w1, vo], [uo + w1, vo + d1], [uo, vo + d1]], [0, 1, 0], a, b);
    }
    return this;
  }

  /** Smooth-shaded cylinder (tanks, silos, chimneys, pipes, masts). */
  cylinder(cx, y0, cz, y1, r0, r1, seg, a, b, opts = {}) {
    const uo = opts.uo || 0, vo = opts.vo || 0;
    MeshBuilder._chk('cylinder', cx, y0, cz, y1, r0, r1, seg);
    const h = y1 - y0;
    const cap = opts.cap !== false;
    const circ = Math.PI * (r0 + r1);
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * Math.PI * 2, t1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      const u0 = uo + (i / seg) * circ, u1 = uo + ((i + 1) / seg) * circ;
      const p0 = [cx + c0 * r0, y0, cz + s0 * r0];
      const p1 = [cx + c1 * r0, y0, cz + s1 * r0];
      const p2 = [cx + c1 * r1, y1, cz + s1 * r1];
      const p3 = [cx + c0 * r1, y1, cz + s0 * r1];
      const nx = c0 + c1, nz = s0 + s1;
      const nl = Math.hypot(nx, nz) || 1;
      this.quad(p0, p1, p2, p3,
        [[u0, vo], [u1, vo], [u1, vo + h], [u0, vo + h]],
        [nx / nl, 0, nz / nl], a, b);
    }
    if (cap && r1 > 0.01) {
      const cy = y1;
      const c = this.vert(cx, cy, cz, 0, 1, 0, uo, vo, a, b);
      const ring = [];
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        ring.push(this.vert(cx + Math.cos(t) * r1, cy, cz + Math.sin(t) * r1, 0, 1, 0,
          uo + Math.cos(t) * r1, vo + Math.sin(t) * r1, a, b));
      }
      for (let i = 0; i < seg; i++) this.idx.push(c, ring[i + 1], ring[i]);
    }
    return this;
  }

  cone(cx, y0, cz, y1, r, seg, a, b, opts = {}) {
    return this.cylinder(cx, y0, cz, y1, r, 0.001, seg, a, b, opts);
  }

  /** A free quad in world space — used for decks, plates, tarps. */
  plate(p0, p1, p2, p3, n, a, b, uvs) {
    return this.quad(p0, p1, p2, p3,
      uvs || [[0, 0], [1, 0], [1, 1], [0, 1]], n, a, b);
  }

  /** Horizontal strip of arbitrary polygon outline (extruded prism). */
  prism(poly, y0, y1, a, b, opts = {}) {
    const n = poly.length;
    const uo = opts.uo || 0, vo = opts.vo || 0;
    let peri = 0;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      const w = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const nx = (q[1] - p[1]) / (w || 1), nz = -(q[0] - p[0]) / (w || 1);
      this.quad(
        [p[0], y0, p[1]], [q[0], y0, q[1]], [q[0], y1, q[1]], [p[0], y1, p[1]],
        [[uo + peri, vo], [uo + peri + w, vo], [uo + peri + w, vo + (y1 - y0)], [uo + peri, vo + (y1 - y0)]],
        [nx, 0, nz], a, b);
      peri += w;
    }
    if (opts.cap !== false) {
      // simple fan; polygons here are convex quads in practice
      const c = this.vert(poly.reduce((s, p) => s + p[0], 0) / n, y1,
        poly.reduce((s, p) => s + p[1], 0) / n, 0, 1, 0, uo, vo, a, b);
      const ids = poly.map((p) => this.vert(p[0], y1, p[1], 0, 1, 0, uo + p[0], vo + p[1], a, b));
      for (let i = 0; i < n; i++) this.idx.push(c, ids[(i + 1) % n], ids[i]);
    }
    return this;
  }

  build(name = 'chunk') {
    // A single non-finite vertex poisons the bounding sphere and makes the
    // renderer drop the whole batch, so it is caught here rather than debugged
    // in a screenshot.
    let bad = 0, first = -1;
    for (let i = 0; i < this.pos.length; i++) {
      if (!Number.isFinite(this.pos[i])) {
        if (first < 0) first = i;
        this.pos[i] = 0;
        bad++;
      }
    }
    if (bad) {
      const v = (first / 3) | 0;
      console.warn(`MeshBuilder(${name}): ${bad} non-finite coords clamped; `
        + `vertex ${v} component ${first % 3} — near [${this.pos.slice(v * 3, v * 3 + 3).join(', ')}]`);
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aData', new THREE.Float32BufferAttribute(this.d1, 4));
    g.setAttribute('aData2', new THREE.Float32BufferAttribute(this.d2, 4));
    g.setIndex(this.vcount > 65000
      ? new THREE.Uint32BufferAttribute(this.idx, 1)
      : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.name = name;
    return g;
  }
}

/* ------------------------------------------------------------------ *
 * Instanced primitive templates (rain, particles, wires, crowd)
 * ------------------------------------------------------------------ */

/** Quad with uv.x in [-1,1] and uv.y in [0,1], pivoted at its bottom edge. */
export function instancedQuad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ], 3));
  g.setAttribute('aQuad', new THREE.Float32BufferAttribute([
    -1, 0, 1, 0, 1, 1, -1, 1,
  ], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

/** Unit billboard quad in [0,1]x[0,1] with the origin at the feet-centre. */
export function crowdQuad() {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0,
  ], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1,
  ], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
  return g;
}

/**
 * Low-poly articulated pedestrian: torso+head shell, two swinging legs.
 * ~44 triangles. Only used for the near/hero tier.
 */
export function crowdFigure(THREEref = THREE) {
  const g = new THREEref.InstancedBufferGeometry();
  const P = [], N = [], U = [], PART = [], I = [];
  let base = 0;

  const pushBox = (cx, cy, cz, sx, sy, sz, part) => {
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const faces = [
      { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
      { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, hy, hz], [hx, hy, -hz], [hx, -hy, -hz]] },
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, hy, -hz], [-hx, hy, hz], [-hx, -hy, hz]] },
      { n: [0, 0, 1], v: [[-hx, -hy, hz], [-hx, hy, hz], [hx, hy, hz], [hx, -hy, hz]] },
      { n: [0, 0, -1], v: [[hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz], [-hx, -hy, -hz]] },
    ];
    for (const f of faces) {
      for (let k = 0; k < 4; k++) {
        P.push(cx + f.v[k][0], cy + f.v[k][1], cz + f.v[k][2]);
        N.push(f.n[0], f.n[1], f.n[2]);
        U.push((k === 1 || k === 2) ? 1 : 0, (k >= 2) ? 1 : 0);
        PART.push(part);
      }
      I.push(base, base + 1, base + 2, base, base + 2, base + 3);
      base += 4;
    }
  };

  // torso + coat, then head; legs are separate so the shader can swing them
  pushBox(0, 1.06, 0, 0.44, 0.62, 0.26, 0);
  pushBox(0, 0.70, 0, 0.50, 0.30, 0.28, 0);   // coat flare
  pushBox(0, 1.56, 0, 0.21, 0.24, 0.22, 0);
  pushBox(0, 0.86, 0, 0.16, 0.60, 0.17, 1);   // left leg
  pushBox(0, 0.86, 0, 0.16, 0.60, 0.17, 2);   // right leg

  g.setAttribute('position', new THREEref.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREEref.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREEref.Float32BufferAttribute(U, 2));
  g.setAttribute('aPart', new THREEref.Float32BufferAttribute(PART, 1));
  g.setIndex(I);
  g.boundingSphere = new THREEref.Sphere(new THREEref.Vector3(), 1e6);
  return g;
}

/** Builds a per-instance attribute buffer from a flat array. */
export function instAttr(name, array, itemSize, InstancedBufferAttribute = THREE.InstancedBufferAttribute) {
  return new InstancedBufferAttribute(new Float32Array(array), itemSize);
}
