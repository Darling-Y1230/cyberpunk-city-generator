import * as THREE from 'three';
import { MeshBuilder } from './primitives.js';

/**
 * models/vehicles.js — everything that moves through the vertical city:
 * air taxis on the corridors, delivery drones in the low lanes, ground traffic,
 * the maglev consist, harbour ships and the advertising blimp.
 *
 * Each factory returns { geometry, emissivePoints } so the generator can both
 * instance the mesh and register the vehicle's lights with the neon pool.
 */

const D = (seed, flags, lit, emis, baseY, h, hue, dirt) =>
  [[seed, flags, lit, emis], [baseY, h, hue, dirt]];

/** Air taxi: blended delta body, four ducted fans, cabin glow, tail strobe. */
export function airTaxiGeometry(rng) {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();
  const [a, b] = D(seed, 3, 0.9, 0.4, 0, 3.0, hue, 0.25);
  // fuselage: stacked frustums give a faceted, moulded look
  mb.frustum(0, 0.55, 0, 1.15, 2.6, 5.4, 2.2, 4.2, a, b, { uo: 0, vo: 0 });
  mb.frustum(0, 1.15, 0, 1.6, 2.2, 4.2, 1.5, 2.0, a, b, { uo: 0, vo: 1.15 });
  mb.frustum(0, 1.6, 0, 1.78, 1.5, 2.0, 0.5, 0.7, a, b, { uo: 0, vo: 1.6 });
  // canopy
  mb.frustum(0, 1.05, 1.5, 1.42, 1.7, 1.9, 1.2, 1.0, [seed, 4, 1.0, 0.8], b, { uo: 0, vo: 0 });
  // ducted fans
  for (const [sx, sz] of [[1, 1.5], [-1, 1.5], [1, -1.6], [-1, -1.6]]) {
    mb.cylinder(sx * 1.5, 0.9, sz, 1.05, 0.62, 0.62, 10, a, b, { vo: 0, cap: false });
    mb.cylinder(sx * 1.5, 0.72, sz, 0.95, 0.1, 0.06, 6, [seed, 2, 1.0, 1.2], b, { vo: 0, cap: false });
  }
  // underglow strips
  mb.box(0, 0.52, 0, 2.4, 0.06, 0.3, [seed, 2, 1.0, 2.2], b, { uo: 0, vo: 0 });
  // tail fin + strobe
  mb.frustum(0, 1.78, -2.0, 2.5, 0.16, 1.1, 0.1, 0.7, a, b, { rotY: Math.PI / 2, uo: 0, vo: 0 });
  mb.cylinder(0, 2.5, -2.0, 2.62, 0.11, 0.11, 6, [seed, 2, 1.0, 2.6], b, { vo: 0, cap: false });
  return mb.build('airtaxi');
}

/** Delivery / surveillance drone. Compact, with a blinking nav light. */
export function droneGeometry(rng) {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();
  const [a, b] = D(seed, 3, 0.7, 0.35, 0, 0.6, hue, 0.35);
  mb.box(0, 0, 0, 0.62, 0.22, 0.86, a, b, { uo: 0, vo: 0 });
  mb.box(0, -0.15, 0.1, 0.3, 0.24, 0.3, a, b, { uo: 0, vo: 0 });
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    mb.box(sx * 0.42, 0.05, sz * 0.42, 0.5, 0.05, 0.06, a, b, { uo: 0, vo: 0 });
    mb.cylinder(sx * 0.62, 0.06, sz * 0.62, 0.12, 0.19, 0.19, 8, [seed, 2, 1.0, 0.7], b, { vo: 0, cap: false });
  }
  mb.cylinder(0, -0.28, 0.3, -0.36, 0.06, 0.06, 6, [seed, 2, 1.0, 2.4], b, { vo: 0, cap: false });
  return mb.build('drone');
}

/** Ground vehicle: low, wide, with a light bar. */
export function carGeometry(rng, kind = 'car') {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();
  const [a, b] = D(seed, 3, 0.8, 0.3, 0, 1.6, hue, 0.35);
  if (kind === 'bus') {
    mb.frustum(0, 0.3, 0, 2.6, 2.6, 9.0, 2.5, 8.6, a, b, { uo: 0, vo: 0 });
    mb.box(0, 1.5, 0, 2.62, 1.1, 8.4, [seed, 4, 0.9, 0.6], b, { uo: 0, vo: 0 });
    mb.box(0, 0.5, 0, 2.7, 0.08, 8.8, [seed, 2, 1.0, 1.4], b, { uo: 0, vo: 0 });
  } else {
    mb.frustum(0, 0.28, 0, 0.82, 1.9, 4.4, 1.8, 4.0, a, b, { uo: 0, vo: 0 });
    mb.frustum(0, 0.82, 0, 1.32, 1.75, 2.6, 1.2, 2.0, [seed, 4, 0.9, 0.5], b, { uo: 0, vo: 0 });
    mb.box(0, 0.3, 0, 1.92, 0.06, 4.0, [seed, 2, 1.0, 1.6], b, { uo: 0, vo: 0 });
    // headlights
    for (const s of [-1, 1]) mb.box(s * 0.6, 0.6, 2.2, 0.5, 0.12, 0.06, [seed, 2, 1.0, 2.4], b, { uo: 0, vo: 0 });
  }
  return mb.build('car_' + kind);
}

/** Maglev car: long pressure tube body, panoramic window band, levitation skirt. */
export function maglevCarGeometry(rng, len = 22) {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();
  const [a, b] = D(seed, 3, 1.0, 0.7, 0, 3.6, hue, 0.2);
  mb.frustum(0, -0.5, 0, 0.1, 3.0, len, 3.0, len, a, b, { uo: 0, vo: 0 });        // skirt
  mb.frustum(0, 0.1, 0, 2.6, 3.0, len, 2.6, len * 0.96, a, b, { uo: 0, vo: 0.1 });
  mb.frustum(0, 2.6, 0, 3.3, 2.6, len * 0.96, 1.4, len * 0.8, a, b, { uo: 0, vo: 2.6 });
  // window band
  mb.box(0, 1.7, 0, 2.72, 1.0, len * 0.9, [seed, 2, 1.0, 1.5], b, { uo: 0, vo: 0 });
  // door recesses
  for (const s of [-1, 1]) {
    mb.box(1.42, 1.3, s * len * 0.28, 0.06, 2.0, 2.2, a, b, { uo: 0, vo: 0 });
  }
  return mb.build('maglev');
}

/** Container ship for the port basin. */
export function shipGeometry(rng) {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();
  const [a, b] = D(seed, 3, 0.4, 0.2, 0, 28, hue, 0.8);
  const L = 150, W = 26;
  mb.frustum(0, 0, 0, 9, W, L, W * 0.9, L * 0.97, a, b, { uo: 0, vo: 0 });
  mb.frustum(0, 9, 0, 11, W * 0.9, L * 0.97, W * 0.96, L * 0.99, a, b, { uo: 0, vo: 9 });
  // bow
  mb.frustum(0, 0, L * 0.5, 9, W * 0.9, 26, 0.4, 3, a, b, { uo: 0, vo: 0 });
  // deck stacks
  for (let iy = 0; iy < 5; iy++)
    for (let ix = -3; ix <= 3; ix++)
      for (let iz = 0; iz < 8; iz++) {
        if (rng.bool(0.08)) continue;
        mb.box(ix * 2.6, 11.6 + iy * 2.62, -L * 0.34 + iz * 6.2, 2.45, 2.5, 6.05, a, b, { uo: 0, vo: iy * 2.6 });
      }
  // superstructure
  mb.frustum(0, 11, -L * 0.40, 30, 14, 18, 12, 16, a, b, { uo: 0, vo: 0 });
  mb.frustum(0, 30, -L * 0.40, 34, 12, 16, 9, 12, a, b, { uo: 0, vo: 30 });
  mb.box(0, 32, -L * 0.40, 12.4, 1.4, 16.4, [seed, 2, 1.0, 1.2], b, { uo: 0, vo: 0 });
  return mb.build('ship');
}

/** Advertising blimp — a slow-moving holographic billboard. */
export function blimpGeometry(rng) {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();
  const [a, b] = D(seed, 3, 1.0, 0.9, 0, 40, hue, 0.2);
  const seg = 16, rings = 8, R = 13, L = 46;
  for (let r = 0; r < rings; r++) {
    const t0 = r / rings, t1 = (r + 1) / rings;
    const y0 = -L / 2 + L * t0, y1 = -L / 2 + L * t1;
    const rr0 = R * Math.max(0, Math.sin(Math.PI * t0)) ** 0.7;
    const rr1 = R * Math.max(0, Math.sin(Math.PI * t1)) ** 0.7;
    // body along Z
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2, t2 = ((i + 1) / seg) * Math.PI * 2;
      const p0 = [Math.cos(t) * rr0, Math.sin(t) * rr0, y0];
      const p1 = [Math.cos(t2) * rr0, Math.sin(t2) * rr0, y0];
      const p2 = [Math.cos(t2) * rr1, Math.sin(t2) * rr1, y1];
      const p3 = [Math.cos(t) * rr1, Math.sin(t) * rr1, y1];
      const nx = Math.cos((t + t2) / 2), ny = Math.sin((t + t2) / 2);
      mb.quad(p0, p1, p2, p3,
        [[i * 4, y0], [i * 4 + 4, y0], [i * 4 + 4, y1], [i * 4, y1]],
        [nx, ny, 0], a, b);
    }
  }
  // gondola + fins
  mb.box(0, -R - 1.6, 0, 4, 3.2, 12, a, b, { uo: 0, vo: 0 });
  for (const s of [-1, 1]) mb.frustum(0, 0, s * L * 0.42, 6, 0.3, 8, 0.2, 4, a, b, { uo: 0, vo: 0 });
  return mb.build('blimp');
}

/**
 * CPU-driven vehicle swarm. Few hundred agents, so a plain per-frame matrix
 * update is cheaper than a second path-texture pipeline.
 */
export class VehicleSwarm {
  constructor(mesh, paths, rng, opts = {}) {
    this.mesh = mesh;
    this.paths = paths;
    this.count = mesh.count;
    this.rng = rng;
    this.speed = opts.speed || [20, 45];
    this.bank = opts.bank ?? 0.55;
    this.pitchAlign = opts.pitchAlign ?? 0.3;
    this.data = [];
    for (let i = 0; i < this.count; i++) {
      const p = paths[(i * 7919) % paths.length];
      this.data.push({
        path: p,
        t: rng.next() * p.length,
        v: rng.float(this.speed[0], this.speed[1]),
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._prev = new THREE.Vector3();
  }

  update(dt) {
    const { mesh } = this;
    for (let i = 0; i < this.count; i++) {
      const v = this.data[i];
      const p = v.path;
      v.t = (v.t + v.v * dt) % p.length;
      p.sample(v.t, this._p);
      p.sample((v.t + 1.4) % p.length, this._prev);
      const dx = this._prev.x - this._p.x, dz = this._prev.z - this._p.z, dy = this._prev.y - this._p.y;
      const yaw = Math.atan2(dx, dz);
      const pitch = Math.atan2(dy, Math.hypot(dx, dz)) * this.pitchAlign;
      // bank into the turn
      const curv = p.curvatureAt ? p.curvatureAt(v.t) : 0;
      this._e.set(pitch, yaw, -curv * this.bank, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(i, this._m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
