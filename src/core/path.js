import * as THREE from 'three';

/**
 * A polyline in 3D with arc-length parameterisation, used by every moving
 * thing in the city (taxis, drones, maglev consists, patrol NPCs).
 */
export class Path3 {
  constructor(points, closed = false) {
    this.pts = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1] ?? 0, p[2])));
    this.closed = closed;
    if (closed && this.pts.length) this.pts.push(this.pts[0].clone());
    this.cum = [0];
    let acc = 0;
    for (let i = 1; i < this.pts.length; i++) {
      acc += this.pts[i].distanceTo(this.pts[i - 1]);
      this.cum.push(acc);
    }
    this.length = acc;
  }
  _seg(t) {
    const tt = this.closed ? ((t % this.length) + this.length) % this.length : Math.max(0, Math.min(this.length, t));
    let lo = 0, hi = this.cum.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= tt) lo = mid; else hi = mid;
    }
    const segLen = this.cum[lo + 1] - this.cum[lo] || 1e-5;
    return { i: lo, u: (tt - this.cum[lo]) / segLen };
  }
  sample(t, out = new THREE.Vector3()) {
    const { i, u } = this._seg(t);
    return out.copy(this.pts[i]).lerp(this.pts[i + 1] ?? this.pts[i], u);
  }
  tangent(t, out = new THREE.Vector3()) {
    const { i, u } = this._seg(t);
    out.copy(this.pts[i + 1] ?? this.pts[i]).sub(this.pts[i]);
    if (out.lengthSq() < 1e-8) out.set(0, 0, 1);
    return out.normalize();
  }
  curvatureAt(t) {
    const a = this.tangent(Math.max(0, t - 4), new THREE.Vector3());
    const b = this.tangent(t + 4, new THREE.Vector3());
    return a.angleTo(b) * Math.sign(a.x * b.z - a.z * b.x);
  }
  /** Evenly spaced samples, for path textures and minimap drawing. */
  resample(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.sample((i / (n - 1)) * this.length, new THREE.Vector3()));
    return out;
  }
}

/** Catmull-Rom through the points; returns a denser polyline. */
export function smoothPolyline(pts, subdiv = 6, closed = false, y = 0) {
  const P = pts.map((p) => new THREE.Vector3(p[0], p[1] ?? y, p[2] ?? p[1] ?? 0));
  const out = [];
  const n = P.length;
  const get = (i) => P[closed ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < subdiv; s++) {
      const t = s / subdiv, t2 = t * t, t3 = t2 * t;
      out.push(new THREE.Vector3(
        0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
      ));
    }
  }
  if (!closed) out.push(P[n - 1].clone());
  return out;
}
