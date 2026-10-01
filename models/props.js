import * as THREE from 'three';
import { MeshBuilder, instAttr } from './primitives.js';

/**
 * models/props.js — the street furniture that sells the density.
 *
 * Every prop is a tiny hand-built mesh; instances are placed by the generator
 * through a single InstancedMesh per kind so 40 000 air-conditioning units,
 * vending machines and security cameras cost a handful of draw calls.
 */

const D = (seed, flags, lit, emis, baseY, h, hue, dirt) =>
  [[seed, flags, lit, emis], [baseY, h, hue, dirt]];

/* ------------------------------------------------------------------ *
 * Individual prop meshes
 * ------------------------------------------------------------------ */
export const PROP_KINDS = [
  'ac', 'dish', 'antenna', 'vent', 'pipeRun', 'tank', 'streetlight',
  'vending', 'stall', 'trash', 'barrier', 'camera', 'signal', 'hydrant',
  'dumpster', 'scaffold', 'railing', 'ladder', 'awning', 'holoEmitter',
  'terminal', 'planter', 'cableBox', 'transformer', 'pad',
];

export function propGeometry(kind, rng) {
  const mb = new MeshBuilder();
  const seed = rng.next();
  const hue = rng.next();

  switch (kind) {
    case 'ac': {                       // outdoor condenser unit
      const [a, b] = D(seed, 2, 0.6, 0.35, 0, 0.9, hue, 0.7);
      mb.box(0, 0, 0, 0.95, 0.82, 0.62, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0, 0.34, 0.72, 0.6, 0.06, [seed, 2, 0.9, 1.0], b, { uo: 0, vo: 0 });
      break;
    }
    case 'dish': {                     // satellite dish on a bracket
      const [a, b] = D(seed, 1, 0.4, 0, 0, 1.4, hue, 0.6);
      mb.box(0, 0, 0, 0.12, 0.6, 0.12, a, b, { uo: 0, vo: 0 });
      mb.cylinder(0, 0.55, 0, 0.75, 0.5, 0.62, 12, a, b, { vo: 0, cap: false });
      break;
    }
    case 'antenna': {                  // lattice mast with aviation light
      const [a, b] = D(seed, 3, 0.5, 0, 0, 6, hue, 0.5);
      for (let i = 0; i < 3; i++) {
        const h = 6 - i * 1.6;
        for (const s of [-1, 1]) {
          mb.box(s * 0.16, h / 2, 0, 0.07, h, 0.07, a, b, { uo: 0, vo: 0 });
          mb.box(0, h / 2, s * 0.16, 0.07, h, 0.07, a, b, { uo: 0, vo: 0 });
        }
        mb.box(0, i * 1.6 + 1.6, 0, 0.4, 0.06, 0.4, a, b, { uo: 0, vo: 0 });
      }
      mb.cylinder(0, 6, 0, 6.9, 0.09, 0.06, 6, [seed, 2, 1.0, 1.6], b, { vo: 0, cap: false });
      break;
    }
    case 'vent': {
      const [a, b] = D(seed, 1, 0.3, 0, 0, 1.2, hue, 0.8);
      mb.box(0, 0, 0, 0.9, 1.1, 0.9, a, b, { uo: 0, vo: 0 });
      mb.cylinder(0, 0.55, 0, 1.45, 0.42, 0.5, 10, a, b, { vo: 0, cap: false });
      break;
    }
    case 'pipeRun': {
      const [a, b] = D(seed, 1, 0.2, 0, 0, 0.4, hue, 0.9);
      mb.cylinder(-1.5, 0, 0, 1.5, 0.16, 0.16, 7, a, b, { vo: 0, cap: false });
      mb.cylinder(0, 0, 0, 0, 0.16, 0.16, 7, a, b, { vo: 0 });
      for (const x of [-1.2, 0, 1.2]) {
        mb.box(x, -0.28, 0, 0.09, 0.5, 0.09, a, b, { uo: 0, vo: 0 });
      }
      break;
    }
    case 'tank': {
      const [a, b] = D(seed, 1, 0.3, 0, 0, 2.4, hue, 0.85);
      mb.cylinder(0, 0, 0, 2.2, 0.7, 0.7, 12, a, b, { vo: 0 });
      mb.cylinder(0, 2.2, 0, 2.5, 0.7, 0.2, 12, a, b, { vo: 2.2, cap: false });
      break;
    }
    case 'streetlight': {              // bent-arm luminaire with an LED head
      const [a, b] = D(seed, 1, 0.0, 0, 0, 8.5, hue, 0.5);
      mb.cylinder(0, 0, 0, 8.0, 0.22, 0.14, 8, a, b, { vo: 0, cap: false });
      mb.box(0.9, 8.0, 0, 1.9, 0.16, 0.16, a, b, { uo: 0, vo: 0 });
      mb.box(1.85, 7.85, 0, 0.7, 0.18, 0.34, [seed, 2, 1.0, 1.4], b, { uo: 0, vo: 0 });
      break;
    }
    case 'vending': {                  // glowing vending machine
      const [a, b] = D(seed, 2, 1.0, 1.1, 0, 2.0, hue, 0.5);
      mb.box(0, 0, 0, 1.25, 1.95, 0.75, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0.15, 0.39, 1.12, 1.5, 0.03, [seed, 2, 1.0, 2.4], b, { uo: 0, vo: 0 });
      mb.box(0, 0.85, 0.4, 1.0, 0.02, 0.02, [seed, 2, 1.0, 1.6], b, { uo: 0, vo: 0 });
      break;
    }
    case 'stall': {                    // noodle stand: counter, canopy, lanterns
      const [a, b] = D(seed, 1, 0.9, 0.6, 0, 2.6, hue, 0.55);
      mb.box(0, 0.5, 0, 2.6, 1.0, 1.3, a, b, { uo: 0, vo: 0 });
      mb.box(0, 1.05, 0.62, 2.7, 0.12, 0.5, a, b, { uo: 0, vo: 0 });
      for (const s of [-1, 1]) mb.box(s * 1.24, 1.6, 0, 0.1, 1.2, 0.1, a, b, { uo: 0, vo: 0 });
      mb.box(0, 2.3, 0, 2.9, 0.12, 1.9, [seed, 1, 0, 0], b, { uo: 0, vo: 0 });
      mb.box(0, 1.85, 0.85, 1.1, 0.6, 0.06, [seed, 2, 1.0, 2.2], b, { uo: 0, vo: 0 });
      for (const s of [-1, 1]) {
        mb.cylinder(s * 1.1, 1.75, 0.7, 1.95, 0.16, 0.13, 8, [seed, 2, 1.0, 1.8], b, { vo: 0 });
      }
      break;
    }
    case 'trash': {                    // bag pile + bin
      const [a, b] = D(seed, 1, 0.1, 0, 0, 1.0, hue, 1.0);
      mb.box(0.35, 0.45, 0, 0.7, 0.9, 0.7, a, b, { uo: 0, vo: 0 });
      for (let i = 0; i < 4; i++) {
        const s = rng.float(0.28, 0.5);
        mb.box(rng.float(-0.9, -0.2), s * 0.5, rng.float(-0.4, 0.4), s, s, s * 0.9, a, b, { uo: 0, vo: 0 });
      }
      break;
    }
    case 'barrier': {
      const [a, b] = D(seed, 1, 0.4, 0.0, 0, 1.1, hue, 0.6);
      mb.box(0, 0, 0, 1.9, 1.0, 0.28, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0.15, 0.16, 1.7, 0.16, 0.02, [seed, 2, 1.0, 0.8], b, { uo: 0, vo: 0 });
      break;
    }
    case 'camera': {                   // pole + pan-tilt head + IR ring
      const [a, b] = D(seed, 2, 1.0, 1.0, 0, 3.4, hue, 0.4);
      mb.cylinder(0, 0, 0, 3.2, 0.09, 0.08, 6, a, b, { vo: 0, cap: false });
      mb.box(0, 3.2, 0.2, 0.2, 0.2, 0.42, a, b, { uo: 0, vo: 0 });
      mb.box(0, 3.05, 0.45, 0.34, 0.22, 0.5, [seed, 2, 1.0, 0.5], b, { uo: 0, vo: 0 });
      mb.cylinder(0, 3.05, 0.72, 3.05, 0.14, 0.14, 8, [seed, 2, 1.0, 1.8], b, { vo: 0, cap: false });
      break;
    }
    case 'signal': {                   // traffic signal gantry
      const [a, b] = D(seed, 2, 1.0, 0.9, 0, 5.4, hue, 0.5);
      mb.cylinder(0, 0, 0, 5.2, 0.16, 0.12, 8, a, b, { vo: 0, cap: false });
      mb.box(1.2, 5.2, 0, 2.6, 0.14, 0.14, a, b, { uo: 0, vo: 0 });
      mb.box(2.3, 4.85, 0, 0.3, 0.8, 0.3, a, b, { uo: 0, vo: 0 });
      for (let i = 0; i < 3; i++) {
        mb.cylinder(2.3, 4.6 + i * 0.04, 0.17, 4.6 + i * 0.04, 0.09, 0.09, 8,
          [seed, 2, 1.0, i === 2 ? 2.0 : 0.35], b, { vo: 0, cap: false });
      }
      break;
    }
    case 'hydrant': {
      const [a, b] = D(seed, 1, 0.3, 0.0, 0, 0.9, hue, 0.7);
      mb.cylinder(0, 0, 0, 0.7, 0.16, 0.14, 8, a, b, { vo: 0 });
      mb.cylinder(0, 0.7, 0, 0.85, 0.09, 0.09, 8, a, b, { vo: 0.7, cap: false });
      for (const s of [-1, 1]) mb.cylinder(s * 0.16, 0.45, 0, 0.45, 0.07, 0.07, 6, a, b, { vo: 0, cap: false });
      break;
    }
    case 'dumpster': {
      const [a, b] = D(seed, 1, 0.2, 0.0, 0, 1.3, hue, 0.9);
      mb.box(0, 0, 0, 2.4, 1.2, 1.3, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0.66, 0, 2.5, 0.14, 1.4, a, b, { uo: 0, vo: 0 });
      break;
    }
    case 'scaffold': {                 // temporary works scaffolding
      const [a, b] = D(seed, 3, 0.5, 0.2, 0, 8, hue, 0.6);
      const H = 8, W = 2.4, Dp = 1.2;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        mb.box(sx * W / 2, H / 2, sz * Dp / 2, 0.09, H, 0.09, a, b, { uo: 0, vo: 0 });
      }
      for (let lvl = 1; lvl <= 3; lvl++) {
        mb.box(0, lvl * (H / 4), 0, W, 0.09, Dp, a, b, { uo: 0, vo: 0 });
        for (const sz of [-1, 1]) mb.box(0, lvl * (H / 4) + 0.5, sz * Dp / 2, W, 0.07, 0.07, a, b, { uo: 0, vo: 0 });
      }
      break;
    }
    case 'railing': {
      const [a, b] = D(seed, 1, 0.1, 0.0, 0, 1.1, hue, 0.6);
      mb.box(0, 1.05, 0, 4, 0.08, 0.08, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0.55, 0, 4, 0.05, 0.05, a, b, { uo: 0, vo: 0 });
      for (let i = -2; i <= 2; i++) mb.box(i * 1, 0.55, 0, 0.07, 1.05, 0.07, a, b, { uo: 0, vo: 0 });
      break;
    }
    case 'ladder': {
      const [a, b] = D(seed, 3, 0.3, 0.0, 0, 6, hue, 0.7);
      for (const s of [-1, 1]) mb.box(s * 0.22, 3, 0, 0.07, 6, 0.07, a, b, { uo: 0, vo: 0 });
      for (let i = 0; i < 14; i++) mb.box(0, 0.3 + i * 0.42, 0, 0.5, 0.05, 0.05, a, b, { uo: 0, vo: 0 });
      break;
    }
    case 'awning': {                   // fabric canopy over a shopfront
      const [a, b] = D(seed, 1, 0.3, 0.0, 0, 2.4, hue, 0.5);
      mb.box(0, 0, 0, 5, 0.08, 1.6, a, b, { uo: 0, vo: 0 });
      mb.box(0, -0.35, 0.8, 5, 0.7, 0.06, a, b, { uo: 0, vo: 0 });
      for (const s of [-1, 1]) mb.box(s * 2.4, -0.7, 0, 0.09, 1.5, 0.09, a, b, { uo: 0, vo: 0 });
      break;
    }
    case 'holoEmitter': {              // projector head that spawns a hologram
      const [a, b] = D(seed, 2, 1.0, 1.5, 0, 0.5, hue, 0.3);
      mb.cylinder(0, 0, 0, 0.34, 0.4, 0.32, 10, a, b, { vo: 0 });
      mb.cylinder(0, 0.34, 0, 0.44, 0.26, 0.3, 10, [seed, 2, 1.0, 2.0], b, { vo: 0.34, cap: false });
      break;
    }
    case 'terminal': {                 // public access terminal / ATM
      const [a, b] = D(seed, 2, 1.0, 1.4, 0, 1.9, hue, 0.4);
      mb.box(0, 0, 0, 0.9, 1.8, 0.5, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0.25, 0.26, 0.8, 1.0, 0.03, [seed, 2, 1.0, 2.6], b, { uo: 0, vo: 0 });
      mb.box(0, 1.0, 0.27, 0.7, 0.02, 0.02, [seed, 2, 1.0, 1.8], b, { uo: 0, vo: 0 });
      break;
    }
    case 'planter': {
      const [a, b] = D(seed, 1, 0.2, 0.0, 0, 0.8, hue, 0.8);
      mb.frustum(0, 0, 0, 0.7, 1.4, 1.4, 1.6, 1.6, a, b, { uo: 0, vo: 0 });
      mb.box(0, 0.85, 0, 1.2, 0.5, 1.2, [seed, 1, 0.05, 0.0], b, { uo: 0, vo: 0 });
      break;
    }
    case 'cableBox': {
      const [a, b] = D(seed, 1, 0.2, 0.0, 0, 1.4, hue, 0.8);
      mb.box(0, 0, 0, 0.7, 1.3, 0.45, a, b, { uo: 0, vo: 0 });
      break;
    }
    case 'transformer': {
      const [a, b] = D(seed, 3, 0.4, 0.3, 0, 3.2, hue, 0.7);
      mb.box(0, 0, 0, 1.6, 2.6, 1.6, a, b, { uo: 0, vo: 0 });
      mb.cylinder(-0.5, 2.6, 0, 3.2, 0.14, 0.1, 6, a, b, { vo: 0, cap: false });
      mb.cylinder(0.5, 2.6, 0, 3.2, 0.14, 0.1, 6, a, b, { vo: 0, cap: false });
      for (let i = 0; i < 3; i++) mb.box(0, 2.75 + i * 0.16, 0, 2.2, 0.07, 0.07, a, b, { uo: 0, vo: 0 });
      break;
    }
    case 'pad': {                      // rooftop vertipad
      const [a, b] = D(seed, 2, 1.0, 0.8, 0, 0.4, hue, 0.3);
      mb.cylinder(0, 0, 0, 0.3, 5.0, 5.0, 16, a, b, { vo: 0, cap: false });
      mb.cylinder(0, 0.3, 0, 0.34, 5.0, 5.0, 16, [seed, 2, 1.0, 1.1], b, { vo: 0 });
      break;
    }
    default: {
      const [a, b] = D(seed, 1, 0.2, 0.0, 0, 1, hue, 0.6);
      mb.box(0, 0, 0, 1, 1, 1, a, b, { uo: 0, vo: 0 });
    }
  }
  return mb.build('prop_' + kind);
}

/** A single InstancedMesh per prop kind; transforms are pushed by the caller. */
export class PropInstancer {
  constructor(kind, material, rng, capacity = 64) {
    this.kind = kind;
    this.material = material;
    this.rng = rng;
    this.capacity = capacity;
    this.geo = propGeometry(kind, rng);
    this.mesh = new THREE.InstancedMesh(this.geo, material, capacity);
    this.mesh.name = 'props_' + kind;
    this.mesh.count = 0;
    this.mesh.frustumCulled = true;
    // per-instance look variation
    const n = capacity;
    this.aData = new Float32Array(n * 4);
    this.aData2 = new Float32Array(n * 4);
    const d1 = this.geo.getAttribute('aData');
    const d2 = this.geo.getAttribute('aData2');
    this.base1 = d1 ? [d1.getX(0), d1.getY(0), d1.getZ(0), d1.getW(0)] : [0, 1, 0.5, 0];
    this.base2 = d2 ? [d2.getX(0), d2.getY(0), d2.getZ(0), d2.getW(0)] : [0, 1, 0.5, 0.5];
    for (let i = 0; i < n; i++) {
      this.aData.set([rng.next(), this.base1[1], rng.float(0.1, 0.9), this.base1[3] * rng.float(0.5, 1.4)], i * 4);
      this.aData2.set([0, this.base2[1], rng.next(), rng.float(0, 0.6)], i * 4);
    }
    this.geo.setAttribute('aData', instAttr('aData', this.aData, 4));
    this.geo.setAttribute('aData2', instAttr('aData2', this.aData2, 4));
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
  }
  /** x,y,z world, yaw radians, uniform scale */
  push(x, y, z, yaw = 0, scale = 1, pitch = 0, roll = 0) {
    if (this.mesh.count >= this.capacity) return false;
    this._e.set(pitch, yaw, roll, 'YXZ');
    this._q.setFromEuler(this._e);
    this._v.set(x, y, z);
    this._s.set(scale, scale, scale);
    this._m.compose(this._v, this._q, this._s);
    const i = this.mesh.count++;
    this.mesh.setMatrixAt(i, this._m);
    // keep the canyon-AO base height roughly right
    this.aData2[i * 4] = y;
    return true;
  }
  finalize() {
    this.mesh.count = Math.min(this.mesh.count, this.capacity);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.geo.getAttribute('aData').needsUpdate = true;
    this.geo.getAttribute('aData2').needsUpdate = true;
    this.mesh.computeBoundingSphere();
    return this.mesh;
  }
}
