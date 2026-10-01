import * as THREE from 'three';
import { buildAdAtlas } from '../../textures/signage.js';
import { clamp } from '../core/grid.js';

/**
 * AGENT 6 — The advertising layer.
 *
 * Every sign in the city is an instance of one quad. The artwork lives in a
 * single 6x4 atlas painted procedurally at load time, so an entire metropolis
 * of animated LED walls, projected ads, Japanese blade signs and volumetric
 * holograms costs three draw calls and one texture.
 */

export function generateAds(cfg, rng, ctx) {
  const { buildings, adAnchors, corporations } = ctx;
  const A = cfg.ads;
  const art = buildAdAtlas(THREE, rng.derive('ads'), A.atlasCols, A.atlasRows, A.tileW, A.tileH);
  const tiles = art.cols * art.rows;

  const maxSigns = cfg.world.mapSize >= 2048 ? 32000 : cfg.world.mapSize >= 1024 ? 14000 : 7000;
  const maxHolo = cfg.world.mapSize >= 2048 ? 1500 : 900;

  const solid = new SignSet(art, 'signs_solid', 1);
  const blade = new SignSet(art, 'signs_blade', 2);
  const holo = new SignSet(art, 'signs_holo', 3);
  const frames = new SignSet(art, 'signs_frames', 0);

  // budget: keep the most visible anchors, drop the rest stochastically so the
  // surviving signs stay evenly spread instead of clustering downtown
  const total = adAnchors.length;
  const keep = clamp(maxSigns / Math.max(total, 1), 0.05, 1);
  // Retail frontage is sorted to the front so it is placed before the global
  // sign budget is exhausted, and exempted from the thinning pass below:
  // "at least five billboards per commercial block" is a hard part of the
  // brief, and random sampling is exactly how a block ends up with four.
  const isRetailAnchor = (a) => a.districtId === 'commercial' || a.districtId === 'nightlife'
    || a.districtId === 'cbd' || a.districtId === 'corporate';
  const sorted = adAnchors
    .map((a) => ({ a, w: signWeight(a, buildings, rng) + (isRetailAnchor(a) ? 1000 : 0) }))
    .sort((p, q) => q.w - p.w);

  let placed = 0, holoPlaced = 0;
  const corpColors = new Map(corporations.map((c) => [c.index, c.color]));

  for (const { a } of sorted) {
    if (placed >= maxSigns) break;
    if (!isRetailAnchor(a) && rng.next() > keep * 1.25) continue;

    const bidx = a.building ?? -1;
    const b = bidx >= 0 ? buildings.list[bidx] : null;
    const isNightlife = a.districtId === 'nightlife' || a.districtId === 'commercial';
    const tile = Math.floor(rng.next() * tiles);
    const tx = tile % art.cols, ty = Math.floor(tile / art.cols);
    const seed = rng.next();

    if (a.roof && b) {
      // ---- rooftop signage rack -------------------------------------
      const w = clamp(Math.min(b.w, b.d) * rng.float(0.9, 1.7), 6, 34);
      const h = w * rng.float(0.34, 0.62);
      const nFaces = rng.int(1, 3);
      for (let f = 0; f < nFaces; f++) {
        const ang = (f / nFaces) * Math.PI * 2 + rng.float(-0.4, 0.4);
        const px = a.x + Math.sin(ang) * (Math.min(b.w, b.d) * 0.5 + 0.6);
        const pz = a.z + Math.cos(ang) * (Math.min(b.w, b.d) * 0.5 + 0.6);
        const yy = a.y + h * 0.5 + rng.float(0, 4);
        // steel support frame behind the panel
        frames.push(px, yy - h * 0.5 - 2.4, pz, w * 1.06, h + 4.8, 0.22, ang, 0, 0, 0, 0);
        solid.push(px, yy, pz, w, h, ang, rng.float(-0.05, 0.05), tx, ty, 0, seed);
        placed++;
      }
      continue;
    }

    if (a.dir === 0 && b) {
      // ---- blade sign, projecting from the facade --------------------
      const w = clamp(b.w * rng.float(0.14, 0.3), 1.2, 5.5);
      const h = clamp(b.height * rng.float(0.06, 0.2), 3, 17);
      const side = rng.int(0, 3);
      const off = (side === 1 ? b.w / 2 : side === 3 ? -b.w / 2 : 0) + w * 0.5 + 0.4;
      const offz = (side === 0 ? b.d / 2 : side === 2 ? -b.d / 2 : 0) + w * 0.5 + 0.4;
      const px = a.x + (side === 1 || side === 3 ? off : rng.float(-b.w / 2, b.w / 2));
      const pz = a.z + (side === 0 || side === 2 ? offz : rng.float(-b.d / 2, b.d / 2));
      const ang = side === 0 ? 0 : side === 1 ? Math.PI / 2 : side === 2 ? 0 : Math.PI / 2;
      blade.push(px, a.y, pz, w, h, ang, 0, tx, ty, 3, seed);
      placed++;
      continue;
    }

    // ---- wall-mounted panel or projection ---------------------------
    const faceAng = a.dir > 0 ? 0 : Math.PI;
    const w = clamp((a.width || 18) * rng.float(0.42, 0.95), 3.5, 30);
    const h = w * rng.float(0.3, 0.62);
    const px = a.x;
    const pz = a.z + (a.dir > 0 ? 0.5 : -0.5);
    const py = a.y + h * 0.5;

    const wantHolo = a.corp !== undefined && rng.bool(0.35) || rng.bool(A.holoShare * (isNightlife ? 1.6 : 0.7));
    if (wantHolo && holoPlaced < maxHolo) {
      holo.push(px, py + rng.float(1, 6), pz + rng.float(0.6, 3.5), w * rng.float(1.1, 1.8), h * rng.float(1.3, 2.2),
        faceAng + rng.float(-0.15, 0.15), 0, tx, ty, 1, seed);
      holoPlaced++; placed++;
      continue;
    }

    solid.push(px, py, pz, w, h, faceAng, 0, tx, ty, 0, seed);
    // a small bracket/structural frame so panels are not decals
    frames.push(px, a.y, pz + (a.dir > 0 ? -0.25 : 0.25), w * 1.08, h * 1.08, 0.3, faceAng, 0, 0, 0, 0);
    placed++;
  }

  /* ---------------- the icons: giant holograms over the core ---------------- */
  const core = buildings.list
    .filter((b) => b.height > 120 && (b.districtId === 'commercial' || b.districtId === 'nightlife' || b.districtId === 'cbd'))
    .sort((a, b) => b.height - a.height)
    .slice(0, cfg.world.mapSize >= 2048 ? 34 : 16);
  for (const b of core) {
    const w = rng.float(24, 58);
    const h = w * rng.float(1.1, 1.9);
    const ang = rng.float(0, Math.PI * 2);
    holo.push(
      b.x + Math.sin(ang) * rng.float(10, 40),
      b.baseY + b.height * rng.float(0.55, 1.02) + h * 0.5,
      b.z + Math.cos(ang) * rng.float(10, 40),
      w, h, ang + Math.PI / 2, 0,
      Math.floor(rng.next() * tiles), 0, 1, rng.next());
    // slow drift makes them read as projections, not panels
    holo.drift(holo.count - 1, rng.float(0.2, 0.7));
  }

  const meshes = [];
  for (const s of [solid, blade, holo, frames]) {
    for (const m of s.finalize(ctx.materials)) meshes.push(m);
  }

  return {
    atlas: art,
    meshes,
    counts: { solid: solid.count, blade: blade.count, holo: holo.count, frames: frames.count },
    total: placed,
  };
}

function signWeight(a, buildings, rng) {
  let w = 1;
  const b = a.building != null ? buildings.list[a.building] : null;
  if (b) w += Math.min(b.height / 60, 8);
  if (a.districtId === 'commercial' || a.districtId === 'nightlife') w += 3;
  if (a.districtId === 'cbd' || a.districtId === 'corporate') w += 1.6;
  if (a.roof) w += 2.2;
  if (a.corp !== undefined) w += 1.2;
  if (a.logo) w += 2.4;
  return w + rng.float(0, 1.5);
}

/**
 * A pool of instanced quads that become one InstancedMesh.
 */
class SignSet {
  /** variant: 0 = plain structural frame, 1 = opaque LED, 2 = blade, 3 = hologram */
  constructor(art, name, variant) {
    this.art = art;
    this.name = name;
    this.variant = variant;
    this.cap = 4096;
    this.count = 0;
    this.data = [];       // flat 12-tuples: x,y,z,w,h,yaw,pitch,tx,ty,mode,seed,drift
  }
  _grow() {
    this.cap *= 2;
  }
  push(x, y, z, w, h, yaw, pitch, tx, ty, mode, seed) {
    if (this.count >= this.cap) this._grow();
    this.data.push(x, y, z, w, h, yaw, pitch, tx, ty, mode, seed, 0);
    this.count++;
    return this.count - 1;
  }
  drift(i, amt) { if (this.data[i * 12 + 11] !== undefined) this.data[i * 12 + 11] = amt; }

  finalize(materials) {
    if (this.count === 0) return [];
    const geo = new THREE.PlaneGeometry(1, 1);
    const mat = this.variant === 3 ? materials.neonHolo()
      : this.variant === 0 ? materials.frame()
        : this.variant === 2 ? materials.neonBlade() : materials.neonSolid();
    const CH = 256;

    // bucket instances spatially so frustum culling actually does something
    const buckets = new Map();
    for (let i = 0; i < this.count; i++) {
      const o = i * 12;
      const k = Math.floor(this.data[o] / CH) + ':' + Math.floor(this.data[o + 2] / CH);
      let b = buckets.get(k);
      if (!b) { b = []; buckets.set(k, b); }
      b.push(i);
    }

    const out = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const [k, ids] of buckets) {
      const sign = new Float32Array(ids.length * 4);
      const mesh = new THREE.InstancedMesh(geo, mat, ids.length);
      mesh.name = this.name + '_' + k;
      for (let n = 0; n < ids.length; n++) {
        const i = ids[n], o = i * 12;
        e.set(this.data[o + 6], this.data[o + 5], 0, 'YXZ');
        q.setFromEuler(e);
        v.set(this.data[o], this.data[o + 1], this.data[o + 2]);
        s.set(this.data[o + 3], this.data[o + 4], 1);
        m.compose(v, q, s);
        mesh.setMatrixAt(n, m);
        sign[n * 4] = this.data[o + 7];
        sign[n * 4 + 1] = this.data[o + 8];
        sign[n * 4 + 2] = this.data[o + 9];
        sign[n * 4 + 3] = this.data[o + 10];
      }
      geo.setAttribute('aSign', new THREE.InstancedBufferAttribute(sign, 4));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      out.push(mesh);
    }
    return out;
  }
}
