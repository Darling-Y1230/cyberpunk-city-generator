import * as THREE from 'three';
import { PropInstancer, PROP_KINDS } from '../../models/props.js';
import { instancedQuad } from '../../models/primitives.js';
import { Path3 } from '../core/path.js';
import { clamp } from '../core/grid.js';

/**
 * AGENT 8 — Environmental detail.
 *
 * The layer that separates a blockout from a shipped city: overhead cabling,
 * condenser units bolted to every facade, steam rolling out of street grates,
 * surveillance heads on every third pole, noodle stalls, vending machines,
 * trash, scaffolding, laundry lines and the drone traffic overhead.
 *
 * Everything here is instanced; the whole detail layer is ~12 draw calls.
 */
export function generateDetails(cfg, rng, ctx) {
  const { plan, roads, buildings, lighting, transit } = ctx;
  const E = cfg.environment;

  /* ==================================================================== *
   * 1. Collect prop placements
   * ==================================================================== */
  const reqs = new Map();  // kind -> [{x,y,z,yaw,scale}]
  const want = (kind, x, y, z, yaw, scale) => {
    let a = reqs.get(kind);
    if (!a) { a = []; reqs.set(kind, a); }
    a.push({ x, y, z, yaw, scale });
  };

  // roof and facade clutter requested by the building generator
  for (const r of buildings.propReqs) want(r.kind, r.x, r.y, r.z, r.yaw, r.scale);

  const budgetScale = cfg.world.mapSize >= 2048 ? 1 : cfg.world.mapSize >= 1024 ? 0.7 : 0.4;

  /* ---------------- street furniture ---------------- */
  const isCommercial = (x, z) => {
    const d = plan.districtAt(x, z);
    const id = cfg.districts.order[d];
    return id === 'commercial' || id === 'nightlife';
  };
  const districtName = (x, z) => cfg.districts.order[plan.districtAt(x, z)] || 'residential';

  // luminaires on the lighting grid
  for (const L of lighting.streetLights) {
    const ax = L.x + rng.float(-1.4, 1.4), az = L.z + rng.float(-1.4, 1.4);
    const dir = rng.float(0, Math.PI * 2);
    want('streetlight', ax, plan.heightAt(ax, az), az, dir, rng.float(0.85, 1.15));
    if (rng.bool(0.26 * budgetScale)) {
      want('camera', ax, plan.heightAt(ax, az), az, dir + Math.PI, rng.float(0.9, 1.2));
    }
    if (rng.bool(0.16)) want('cableBox', ax + rng.float(-2, 2), plan.heightAt(ax, az), az + rng.float(-2, 2), dir, 1);
  }

  // traffic signals + crossings furniture
  for (const [x, z] of roads.crossings) {
    if (!rng.bool(0.7 * budgetScale)) continue;
    const gy = plan.heightAt(x, z);
    const w = roads.raster.sampleWorld(x, z);
    want('signal', x + rng.float(-2, 2), gy, z + rng.float(-2, 2), rng.float(0, 6.28), rng.float(0.85, 1.1));
    if (rng.bool(0.5)) want('hydrant', x + rng.float(-6, 6), gy, z + rng.float(-6, 6), 0, 1);
    if (rng.bool(0.35)) want('railing', x + rng.float(-8, 8), gy, z + rng.float(-8, 8), rng.float(0, 3.14), 1);
  }

  // kerbside life, driven by district character
  for (const seg of roads.segments) {
    if (seg.v > 2) continue;
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    const n = Math.floor(len / rng.float(18, 34));
    for (let i = 0; i < n; i++) {
      const t = (i + rng.float(0.15, 0.85)) / Math.max(n, 1);
      const x = seg.x0 + (seg.x1 - seg.x0) * t;
      const z = seg.z0 + (seg.z1 - seg.z0) * t;
      const off = (seg.v === 1 ? seg.w * 0.5 + rng.float(3, 11) : seg.w * 0.5 + rng.float(2, 7));
      const ang = Math.atan2(seg.z1 - seg.z0, seg.x1 - seg.x0) + Math.PI / 2;
      const side = rng.bool() ? 1 : -1;
      const px = x + Math.cos(ang) * off * side;
      const pz = z + Math.sin(ang) * off * side;
      if (plan.isWater(px, pz) || roads.isRoad(roads.raster.sampleWorld(px, pz))) continue;
      const gy = plan.heightAt(px, pz);
      const dn = districtName(px, pz);
      const roll = rng.next();

      if (dn === 'commercial' || dn === 'nightlife') {
        if (roll < 0.34) want('vending', px, gy, pz, rng.float(0, 6.28), rng.float(0.9, 1.15));
        else if (roll < 0.58) want('stall', px, gy, pz, ang + rng.float(-0.4, 0.4), rng.float(0.8, 1.1));
        else if (roll < 0.72) want('terminal', px, gy, pz, ang, 1);
        else if (roll < 0.84) want('trash', px, gy, pz, rng.float(0, 6.28), rng.float(0.7, 1.3));
        else if (roll < 0.93) want('planter', px, gy, pz, ang, 1);
        else want('holoEmitter', px, gy + 3.2, pz, ang, 1);
      } else if (dn === 'slum') {
        if (roll < 0.3) want('trash', px, gy, pz, rng.float(0, 6.28), rng.float(0.8, 1.5));
        else if (roll < 0.5) want('stall', px, gy, pz, ang + rng.float(-0.6, 0.6), rng.float(0.7, 1.0));
        else if (roll < 0.64) want('scaffold', px, gy, pz, ang, rng.float(0.7, 1.2));
        else if (roll < 0.76) want('vending', px, gy, pz, rng.float(0, 6.28), 0.95);
        else if (roll < 0.88) want('cableBox', px, gy, pz, ang, 1);
        else want('awning', px, gy + 2.6, pz, ang + Math.PI / 2, rng.float(0.8, 1.3));
      } else if (dn === 'industrial' || dn === 'energy' || dn === 'port') {
        if (roll < 0.3) want('pipeRun', px, gy + 1.4, pz, ang, rng.float(0.9, 1.6));
        else if (roll < 0.5) want('barrier', px, gy, pz, ang, 1);
        else if (roll < 0.68) want('dumpster', px, gy, pz, ang, rng.float(0.9, 1.2));
        else if (roll < 0.82) want('transformer', px, gy, pz, ang, 1);
        else if (roll < 0.92) want('tank', px, gy, pz, 0, rng.float(0.7, 1.3));
        else want('scaffold', px, gy, pz, ang, 0.9);
      } else {
        if (roll < 0.24) want('vending', px, gy, pz, rng.float(0, 6.28), 0.95);
        else if (roll < 0.42) want('trash', px, gy, pz, rng.float(0, 6.28), rng.float(0.7, 1.2));
        else if (roll < 0.58) want('planter', px, gy, pz, ang, 1);
        else if (roll < 0.7) want('railing', px, gy, pz, ang, 1);
        else if (roll < 0.8) want('awning', px, gy + 2.6, pz, ang + Math.PI / 2, 1);
        else if (roll < 0.9) want('ac', px, gy + rng.float(1.5, 3.5), pz, ang, 0.9);
        else want('hydrant', px, gy, pz, 0, 1);
      }
    }
  }

  // vertipads on the tallest roofs
  const padCandidates = buildings.list.filter((b) => b.height > 110 && b.w * b.d > 700);
  for (const b of padCandidates) {
    if (!rng.bool(0.35 * budgetScale)) continue;
    want('pad', b.x, b.roofY + 0.3, b.z, 0, clamp(Math.min(b.w, b.d) / 10, 0.6, 1.6));
    for (let i = 0; i < 3; i++) {
      want('holoEmitter', b.x + rng.float(-4, 4), b.roofY + 0.4, b.z + rng.float(-4, 4), rng.float(0, 6.28), 1.2);
    }
  }

  /* ==================================================================== *
   * 2. Build the instancers
   * ==================================================================== */
  const propMeshes = [];
  const propCounts = {};
  for (const kind of PROP_KINDS) {
    const list = reqs.get(kind);
    if (!list || !list.length) continue;
    // hard cap per kind keeps any single prop from dominating the frame
    const cap = Math.min(list.length, kind === 'ac' ? 60000 : kind === 'trash' ? 24000 : 20000);
    const inst = new PropInstancer(kind, ctx.materials.surface(1, propTint(kind)), rng.derive('prop_' + kind), cap);
    for (let i = 0; i < cap; i++) {
      const r = list[i];
      inst.push(r.x, r.y, r.z, r.yaw, r.scale);
    }
    propMeshes.push(inst.finalize());
    propCounts[kind] = cap;
  }

  /* ==================================================================== *
   * 3. Overhead cabling / pipes / laundry lines
   * ==================================================================== */
  const cables = [];
  if (E.cables) {
    const list = buildings.list;
    const maxCables = cfg.world.mapSize >= 2048 ? 9000 : cfg.world.mapSize >= 1024 ? 4800 : 2200;
    for (let i = 0; i < list.length && cables.length < maxCables; i++) {
      const a = list[i];
      if (a.height < 9) continue;
      const near = buildings.index.query(a.x, a.z, 74, []);
      let made = 0;
      for (const j of near) {
        if (made >= 2) break;
        const b = list[j];
        if (!b || b.i <= a.i) continue;
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d < 7 || d > 74) continue;
        const ya = a.baseY + a.height * rng.float(0.35, 0.92);
        const yb = b.baseY + b.height * rng.float(0.35, 0.92);
        if (Math.abs(ya - yb) > 26) continue;
        const type = rng.weighted([
          { k: 0, weight: 7 }, { k: 1, weight: 2.4 }, { k: 2, weight: 1.4 }, { k: 3, weight: 1.6 },
        ]).k;
        cables.push({
          ax: a.x + rng.float(-a.w * 0.3, a.w * 0.3), ay: ya, az: a.z + rng.float(-a.d * 0.3, a.d * 0.3),
          bx: b.x + rng.float(-b.w * 0.3, b.w * 0.3), by: yb, bz: b.z + rng.float(-b.d * 0.3, b.d * 0.3),
          thick: type === 0 ? rng.float(0.055, 0.11) : type === 2 ? rng.float(0.22, 0.4) : rng.float(0.03, 0.07),
          sag: d * rng.float(0.03, 0.11), seed: rng.next(), type,
        });
        made++;
      }
    }
  }
  const cableMesh = cables.length ? buildCables(cables, ctx.materials) : null;

  /* ==================================================================== *
   * 4. Steam, smoke, dust, sparks
   * ==================================================================== */
  const particles = [];
  if (E.steam) {
    // street grates
    for (const seg of roads.segments) {
      if (seg.v > 2) continue;
      const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
      const n = Math.floor(len / rng.float(40, 90));
      for (let i = 0; i < n; i++) {
        const t = rng.next();
        const x = seg.x0 + (seg.x1 - seg.x0) * t + rng.float(-5, 5);
        const z = seg.z0 + (seg.z1 - seg.z0) * t + rng.float(-5, 5);
        if (plan.isWater(x, z)) continue;
        const gy = plan.heightAt(x, z);
        const dn = districtName(x, z);
        const type = dn === 'industrial' || dn === 'energy' ? rng.weighted([{ k: 0, weight: 3 }, { k: 1, weight: 4 }, { k: 3, weight: 1 }]).k : 0;
        for (let k = 0; k < rng.int(5, 12); k++) {
          particles.push({
            x: x + rng.float(-1.6, 1.6), y: gy + rng.float(0, 0.6), z: z + rng.float(-1.6, 1.6),
            size: rng.float(1.4, 4.2), seed: rng.next(), rise: rng.float(4, 15) * (type === 1 ? 2.4 : 1),
            life: rng.float(3.5, 9), type,
            tint: type === 1 ? [0.16, 0.15, 0.14] : type === 3 ? [1.2, 0.5, 0.12] : [0.7, 0.74, 0.82],
          });
        }
      }
    }
    // industrial stacks
    for (const b of buildings.list) {
      if (b.districtId !== 'industrial' && b.districtId !== 'energy') continue;
      if (b.height < 12 || !rng.bool(0.4)) continue;
      const n = rng.int(8, 22);
      for (let k = 0; k < n; k++) {
        particles.push({
          x: b.x + rng.float(-3, 3), y: b.roofY + rng.float(0, 3), z: b.z + rng.float(-3, 3),
          size: rng.float(2.5, 7), seed: rng.next(), rise: rng.float(12, 34), life: rng.float(7, 16),
          type: 1, tint: [0.16, 0.15, 0.14],
        });
      }
    }
    // vendor steam
    for (const s of (reqs.get('stall') || [])) {
      for (let k = 0; k < 5; k++) {
        particles.push({
          x: s.x + rng.float(-1, 1), y: s.y + 1.2, z: s.z + rng.float(-1, 1),
          size: rng.float(0.5, 1.3), seed: rng.next(), rise: rng.float(2.5, 6), life: rng.float(2.2, 5),
          type: 0, tint: [0.85, 0.86, 0.9],
        });
      }
    }
  }
  const particleMesh = particles.length ? buildParticles(particles, ctx.materials) : null;

  return {
    propMeshes, propCounts, propTotal: propMeshes.reduce((s, m) => s + m.count, 0),
    cableMesh, cableCount: cables.length,
    particleMesh, particleCount: particles.length,
    reqs,
  };
}

function propTint(kind) {
  switch (kind) {
    case 'vending': return 0x121a2a;
    case 'stall': return 0x2a1a12;
    case 'trash': return 0x1a1a18;
    case 'barrier': return 0x30302c;
    case 'camera': return 0x1c1e24;
    case 'signal': return 0x17191e;
    case 'terminal': return 0x14161c;
    case 'holoEmitter': return 0x101820;
    case 'planter': return 0x2c2a26;
    case 'dumpster': return 0x22301f;
    case 'scaffold': return 0x3a3c40;
    case 'transformer': return 0x2b2d33;
    case 'streetlight': return 0x24262b;
    case 'tank': return 0x30323a;
    case 'pad': return 0x1a1d24;
    default: return 0x3a3f4a;
  }
}

/* ------------------------------------------------------------------ */
function buildCables(cables, materials) {
  const n = cables.length;
  const geo = instancedQuad();
  const aSegA = new Float32Array(n * 3);
  const aSegB = new Float32Array(n * 3);
  const aSegC = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = cables[i];
    aSegA.set([c.ax, c.ay, c.az], i * 3);
    aSegB.set([c.bx, c.by, c.bz], i * 3);
    aSegC.set([c.thick, c.sag, c.seed, c.type], i * 4);
  }
  geo.setAttribute('aSegA', new THREE.InstancedBufferAttribute(aSegA, 3));
  geo.setAttribute('aSegB', new THREE.InstancedBufferAttribute(aSegB, 3));
  geo.setAttribute('aSegC', new THREE.InstancedBufferAttribute(aSegC, 4));
  geo.instanceCount = n;
  const mesh = new THREE.Mesh(geo, materials.wire());
  mesh.name = 'cables';
  mesh.frustumCulled = false;
  return mesh;
}

function buildParticles(list, materials) {
  const n = list.length;
  const geo = instancedQuad();
  const aP = new Float32Array(n * 4);
  const aP2 = new Float32Array(n * 4);
  const aTint = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const p = list[i];
    aP.set([p.x, p.y, p.z, p.size], i * 4);
    aP2.set([p.seed, p.rise, p.life, p.type], i * 4);
    aTint.set(p.tint, i * 3);
  }
  geo.setAttribute('aP', new THREE.InstancedBufferAttribute(aP, 4));
  geo.setAttribute('aP2', new THREE.InstancedBufferAttribute(aP2, 4));
  geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(aTint, 3));
  geo.instanceCount = n;
  const mesh = new THREE.Mesh(geo, materials.particle());
  mesh.name = 'particles';
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  return mesh;
}
