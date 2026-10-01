import * as THREE from 'three';
import { MeshBuilder } from '../../models/primitives.js';

/**
 * AGENT 10 (infrastructure) — spatial chunking and batching.
 *
 * A megacity cannot be one merged mesh (nothing would ever be culled) and it
 * cannot be one mesh per building (thousands of draw calls). So geometry is
 * accumulated into a uniform grid of chunks, one bucket per material mode.
 * Each bucket becomes one BufferGeometry: culling works at chunk granularity,
 * materials stay few, and draw calls land in the low hundreds.
 */
export class ChunkSet {
  constructor(chunkSize, name = 'chunk') {
    this.chunkSize = chunkSize;
    this.name = name;
    this.buckets = new Map();     // "cx,cz|mode" -> MeshBuilder
    this.meta = new Map();
  }
  _key(x, z, mode) {
    const cx = Math.floor(x / this.chunkSize), cz = Math.floor(z / this.chunkSize);
    return cx + ',' + cz + '|' + mode;
  }
  /** Returns the MeshBuilder for a world position + material mode. */
  at(x, z, mode = 0) {
    const k = this._key(x, z, mode);
    let b = this.buckets.get(k);
    if (!b) {
      b = new MeshBuilder();
      this.buckets.set(k, b);
      const [c, m] = k.split('|');
      const [cx, cz] = c.split(',').map(Number);
      this.meta.set(k, {
        cx, cz, mode: Number(m),
        center: new THREE.Vector3(
          (cx + 0.5) * this.chunkSize, 0, (cz + 0.5) * this.chunkSize),
      });
    }
    return b;
  }
  get bucketCount() { return this.buckets.size; }

  /**
   * @param {(mode:number)=>THREE.Material} materialFor
   * @param {THREE.Object3D} parent
   */
  finalize(materialFor, parent) {
    const out = [];
    for (const [k, mb] of this.buckets) {
      if (mb.empty) continue;
      const meta = this.meta.get(k);
      const geo = mb.build(this.name + '_' + k);
      const mesh = new THREE.Mesh(geo, materialFor(meta.mode));
      mesh.name = this.name + '_' + k;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      mesh.frustumCulled = true;
      parent.add(mesh);
      out.push(mesh);
      mb.reset();
    }
    this.buckets.clear();
    return out;
  }
}

/**
 * Draw-call / triangle reporting plus distance-based visibility groups.
 */
export function analyseScene(scene) {
  let meshes = 0, tris = 0, instances = 0;
  scene.traverse((o) => {
    if (!o.isMesh && !o.isLine && !o.isPoints) return;
    meshes++;
    const g = o.geometry;
    const count = g.index ? g.index.count : (g.attributes.position ? g.attributes.position.count : 0);
    const inst = o.isInstancedMesh ? o.count : 1;
    instances += inst;
    tris += (count / 3) * inst;
  });
  return { meshes, tris: Math.round(tris), instances };
}

/**
 * Merges a list of {geometry, matrix} into one geometry. Used for the few cases
 * where separate primitives must become a single object (billboard frames,
 * rooftop signage racks).
 */
export function mergeAll(list) {
  let vTotal = 0, iTotal = 0;
  for (const it of list) {
    vTotal += it.geometry.attributes.position.count;
    iTotal += it.geometry.index ? it.geometry.index.count : it.geometry.attributes.position.count;
  }
  const pos = new Float32Array(vTotal * 3);
  const nor = new Float32Array(vTotal * 3);
  const uv = new Float32Array(vTotal * 2);
  const d1 = new Float32Array(vTotal * 4);
  const d2 = new Float32Array(vTotal * 4);
  const idx = vTotal > 65000 ? new Uint32Array(iTotal) : new Uint16Array(iTotal);
  let vo = 0, io = 0;
  const v = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const it of list) {
    const g = it.geometry, m = it.matrix;
    if (m) nm.getNormalMatrix(m);
    const p = g.attributes.position, no = g.attributes.normal, u = g.attributes.uv;
    const a = g.attributes.aData, b = g.attributes.aData2;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); if (m) v.applyMatrix4(m);
      pos[(vo + i) * 3] = v.x; pos[(vo + i) * 3 + 1] = v.y; pos[(vo + i) * 3 + 2] = v.z;
      if (no) {
        n.fromBufferAttribute(no, i); if (m) n.applyMatrix3(nm).normalize();
        nor[(vo + i) * 3] = n.x; nor[(vo + i) * 3 + 1] = n.y; nor[(vo + i) * 3 + 2] = n.z;
      }
      if (u) { uv[(vo + i) * 2] = u.getX(i); uv[(vo + i) * 2 + 1] = u.getY(i); }
      if (a) { d1[(vo + i) * 4] = a.getX(i); d1[(vo + i) * 4 + 1] = a.getY(i); d1[(vo + i) * 4 + 2] = a.getZ(i); d1[(vo + i) * 4 + 3] = a.getW(i); }
      if (b) { d2[(vo + i) * 4] = b.getX(i); d2[(vo + i) * 4 + 1] = b.getY(i); d2[(vo + i) * 4 + 2] = b.getZ(i); d2[(vo + i) * 4 + 3] = b.getW(i); }
    }
    const gi = g.index;
    if (gi) for (let i = 0; i < gi.count; i++) idx[io + i] = gi.getX(i) + vo;
    else for (let i = 0; i < p.count; i++) idx[io + i] = i + vo;
    io += gi ? gi.count : p.count;
    vo += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('aData', new THREE.BufferAttribute(d1, 4));
  out.setAttribute('aData2', new THREE.BufferAttribute(d2, 4));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
