import * as THREE from 'three';
import { Path3, smoothPolyline } from '../core/path.js';
import { clamp } from '../core/grid.js';
import { STYLE } from '../../models/buildings.js';
import { maglevCarGeometry, airTaxiGeometry, droneGeometry } from '../../models/vehicles.js';

/**
 * AGENT 4 — The vertical transport system.
 *
 * Every elevated element is anchored to something that already exists:
 * viaducts and maglev guideways follow arterial alignments, skybridges only
 * span gaps between real structures, and flight corridors sit above the same
 * arterials the ground traffic uses. Nothing floats.
 */
export function generateTransit(cfg, rng, plan, roads, buildings, chunks, propReqs) {
  const out = {
    viaducts: [], maglev: { lines: [], stations: [], paths: [] },
    skybridges: [], walkways: [], airLanes: [], taxiPaths: [],
    droneLanes: [], dronePaths: [], neonSources: [], vehicleSpawns: {},
  };
  const T = cfg.transit;

  /* ---------------- pick the arterials that will carry rail ---------------- */
  const arterials = [...roads.xLines, ...roads.zLines]
    .filter((l) => l.level === 1)
    .map((l) => ({ l, len: Math.hypot(l.x1 - l.x0, l.z1 - l.z0), mid: [(l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2] }))
    .filter((a) => Math.hypot(a.mid[0], a.mid[1]) < plan.Rc * 0.95 && a.len > 90)
    .sort((a, b) => b.len - a.len);
  // de-duplicate lines that are nearly colinear
  const picked = [];
  for (const a of arterials) {
    if (picked.some((p) => Math.abs(p.mid[0] - a.mid[0]) < 40 && Math.abs(p.mid[1] - a.mid[1]) < 40)) continue;
    picked.push(a);
  }

  /* ==================================================================== *
   * Elevated highway (高架公路)
   * ==================================================================== */
  if (T.viaduct.enabled) {
    const n = Math.min(T.viaduct.count, picked.length);
    for (let i = 0; i < n; i++) {
      const { l } = picked[i * 2 % picked.length];
      const deckY = T.viaduct.deckY + i * 3.2;
      const w = T.viaduct.width;
      const mb = chunks.at((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2, STYLE.CONCRETE);
      const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0);
      const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
      const along = l.axis === 'x' ? 'z' : 'x';
      const a = [rng.next(), 1, 0.2, 0.0];
      const b = [0, deckY, rng.next(), 0.9];

      const put = (px, py, pz, sx, sy, sz, aa, bb) =>
        mb.box(px, py, pz, along === 'z' ? sx : sz, sy, along === 'z' ? sz : sx, aa, bb, { uo: 0, vo: 0 });

      // deck + soffit box girder
      put(cx, deckY, cz, w, 1.8, len, a, b);
      put(cx, deckY - 1.6, cz, w * 0.72, 1.6, len, a, b);
      // parapets
      for (const s of [-1, 1]) {
        put(along === 'z' ? cx + s * w / 2 : cx, deckY + 1.5, along === 'z' ? cz : cz + s * w / 2,
          along === 'z' ? 0.7 : len, 1.6, along === 'z' ? len : 0.7, a, b);
      }
      // luminous lane edge (the light ribbon you see from below)
      const neon = new THREE.Color(rng.pick(['#2f7bff', '#20e6d6', '#a83cff']));
      for (const s of [-1, 1]) {
        put(along === 'z' ? cx + s * (w / 2 - 0.9) : cx, deckY - 1.9, along === 'z' ? cz : cz + s * (w / 2 - 0.9),
          along === 'z' ? 1.2 : len * 0.98, 0.35, along === 'z' ? len * 0.98 : 1.2,
          [rng.next(), 2, 1, 2.2], b);
      }
      // piers
      const n2 = Math.max(2, Math.floor(len / T.viaduct.pillarEvery));
      for (let k = 1; k < n2; k++) {
        const t = k / n2;
        const px = l.x0 + (l.x1 - l.x0) * t, pz = l.z0 + (l.z1 - l.z0) * t;
        const gy = plan.heightAt(px, pz);
        const h = deckY - 1.9 - gy;
        if (h < 2) continue;
        mb.cylinder(px, gy - 1, pz, deckY - 1.9, 1.5, 1.2, 8, a, b, { vo: 0, cap: false });
        mb.box(px, gy, pz, 4.4, 1.2, 4.4, a, b, { uo: 0, vo: 0 });
        // hazard beacon
        propReqs.push({ kind: 'signal', x: px, y: gy + 1.2, z: pz + 3, yaw: rng.float(0, 6.3), scale: 0.7 });
      }
      // ground-level support columns must not stand inside a building:
      // nudge each pier to the nearest road cell
      const ramps = [];
      for (const s of [-1, 1]) {
        const t = s < 0 ? 0.12 : 0.88;
        const px = l.x0 + (l.x1 - l.x0) * t, pz = l.z0 + (l.z1 - l.z0) * t;
        ramps.push({ x: px, z: pz, dir: s, length: 70, dropY: deckY });
        // ramp deck: stepped boxes give a believable grade without splines
        const steps = 9;
        for (let k = 0; k < steps; k++) {
          const tt = k / steps;
          const yy = deckY - (1 - tt) * (deckY * 0.92);
          const off = (0.06 + tt * 0.34) * len;
          const rx = l.x0 + (l.x1 - l.x0) * (s < 0 ? 0.5 - off / len : 0.5 + off / len);
          const rz = l.z0 + (l.z1 - l.z0) * (s < 0 ? 0.5 - off / len : 0.5 + off / len);
          put(along === 'z' ? rx : rx, yy, along === 'z' ? rz : rz, w * 0.6, 1.2, len / steps, a, b);
        }
      }
      out.neonSources.push({ x: cx, y: deckY - 2, z: cz, r: 90, intensity: 1.4, colorHint: '#' + neon.getHexString() });
      out.viaducts.push({ line: l, deckY, width: w, ramps, axis: along });
    }
  }

  /* ==================================================================== *
   * Maglev (磁悬浮轨道) + stations
   * ==================================================================== */
  if (T.maglev.enabled) {
    const n = Math.min(T.maglev.count, picked.length);
    for (let i = 0; i < n; i++) {
      const { l } = picked[(i * 3 + 1) % picked.length];
      const beamY = T.maglev.beamY + i * 5.5;
      const len = Math.hypot(l.x1 - l.x0, l.z1 - l.z0);
      const cx = (l.x0 + l.x1) / 2, cz = (l.z0 + l.z1) / 2;
      const along = l.axis === 'x' ? 'z' : 'x';
      const mb = chunks.at(cx, cz, STYLE.METAL);
      const a = [rng.next(), 3, 0.4, 0.3];
      const b = [0, beamY, rng.next(), 0.5];
      const put = (px, py, pz, sx, sy, sz, aa, bb, uo = 0) => {
        if (along === 'z') mb.box(px, py, pz, sx, sy, sz, aa, bb, { uo, vo: 0 });
        else mb.box(px, py, pz, sz, sy, sx, aa, bb, { uo, vo: 0 });
      };
      // guideway: a narrow box beam + reaction rail
      put(cx, beamY, cz, 3.2, 1.4, len, a, b);
      put(cx, beamY - 1.1, cz, 2.2, 0.9, len, a, b);
      put(cx, beamY + 1.0, cz, 1.1, 0.5, len * 0.999,
        [rng.next(), 2, 1, 2.4], b);
      const n2 = Math.max(2, Math.floor(len / T.maglev.pillarEvery));
      const stationAt = [];
      for (let k = 1; k < n2; k++) {
        const t = k / n2;
        const px = l.x0 + (l.x1 - l.x0) * t, pz = l.z0 + (l.z1 - l.z0) * t;
        const gy = plan.heightAt(px, pz);
        const h = beamY - 1.2 - gy;
        if (h < 2) continue;
        mb.cylinder(px, gy - 1, pz, beamY - 1.2, 1.1, 0.85, 7, a, b, { vo: 0, cap: false });
        mb.box(px, gy + 0.4, pz, 3.4, 0.8, 3.4, a, b, { uo: 0, vo: 0 });
      }
      // stations every ~380 m, aligned to the beam
      const nSt = Math.max(2, Math.floor(len / 380));
      for (let k = 0; k <= nSt; k++) {
        const t = (k + 0.5) / (nSt + 1);
        const px = l.x0 + (l.x1 - l.x0) * t, pz = l.z0 + (l.z1 - l.z0) * t;
        const gy = plan.heightAt(px, pz);
        const st = buildStation(chunks, rng, px, pz, gy, beamY, along, plan);
        out.maglev.stations.push(st);
        out.neonSources.push({ x: px, y: beamY - 3, z: pz, r: 70, intensity: 1.65 });
        stationAt.push([px, pz]);
      }
      const path = new Path3([
        new THREE.Vector3(l.x0, beamY + 0.9, l.z0),
        new THREE.Vector3(l.x1, beamY + 0.9, l.z1),
      ], true);
      out.maglev.paths.push(path);
      out.maglev.lines.push({ line: l, beamY, path, stations: stationAt, length: len });
    }
  }

  /* ==================================================================== *
   * Skybridges (步行天桥 / 企业空中通道)
   *
   * Greedy priority pairing rather than an all-pairs scan: the old approach
   * generated millions of candidate pairs and then sorted them, which is a
   * multi-second stall. Here the best-connected structures claim partners
   * first and each structure can only be used once, which is both faster and
   * produces a more legible network.
   * ==================================================================== */
  if (T.skybridge.enabled) {
    const pool = buildings.list
      .filter((b) => b.height > 40 && b.w > 7 && b.d > 7)
      .sort((a, b) => skyRank(b) - skyRank(a))
      .slice(0, 9000);
    const used = new Set();
    const bb = buildings.list;
    let made = 0;
    for (const b of pool) {
      if (made >= T.skybridge.maxCount) break;
      if (used.has(b.i)) continue;
      const cand = buildings.index.query(b.x, b.z, T.skybridge.maxSpan + 30, []);
      let best = null, bestScore = -Infinity, bestY = 0;
      for (let k = 0; k < cand.length; k++) {
        const o = bb[cand[k]];
        if (!o || o.i === b.i || used.has(o.i)) continue;
        const span = Math.hypot(o.x - b.x, o.z - b.z) - (b.w + o.w) * 0.25;
        if (span < 5 || span > T.skybridge.maxSpan) continue;
        const ya = b.baseY + b.height * 0.5;
        const yb = o.baseY + o.height * 0.5;
        const y = (ya + yb) / 2;
        if (Math.abs(ya - yb) > T.skybridge.maxHeightDelta) continue;
        if (y < T.skybridge.minY) continue;
        if (y > Math.min(b.topY, o.topY) - 3) continue;
        let sc = 120 - span;
        if (b.isHQ || o.isHQ) sc += 90;
        if (b.kind === 'commercial' || o.kind === 'commercial') sc += 45;
        if (b.corporation != null && b.corporation === o.corporation) sc += 60;
        if (o.isHQ) sc += 40;
        if (sc > bestScore) { bestScore = sc; best = o; bestY = y; }
      }
      if (!best) continue;
      used.add(b.i); used.add(best.i);
      buildBridge(chunks, rng.derive('sb' + b.i), { a: b, b: best, y: bestY, span: 0 }, STYLE.CURTAIN, out.neonSources);
      out.skybridges.push({ a: b, b: best, y: bestY });
      made++;
    }
  }

  /* ==================================================================== *
   * Low pedestrian walkways across the alleys (步行天桥)
   * ==================================================================== */
  if (T.walkway.enabled) {
    const small = buildings.list.filter((b) => b.height > 12 && b.w > 6 && b.w < 40 && b.d > 6 && b.d < 40);
    let made = 0;
    for (let i = 0; i < small.length && made < T.walkway.maxCount; i++) {
      const b = small[i];
      const near = buildings.index.query(b.x, b.z, 46, []);
      for (const j of near) {
        const o = buildings.list[j];
        if (!o || o.i <= b.i) continue;
        const span = Math.hypot(o.x - b.x, o.z - b.z) - (b.w + o.w) * 0.25;
        if (span < 4 || span > 42) continue;
        const y = Math.min(b.baseY + b.height * 0.22, o.baseY + o.height * 0.22);
        if (y < 4.5 || y > 26) continue;
        buildBridge(chunks, rng, { a: b, b: o, y, span, light: true }, STYLE.CONCRETE, out.neonSources);
        made++;
        break;
      }
    }
    out.walkways = made;
  }

  /* ==================================================================== *
   * Air corridors (空中出租车航线) and drone lanes (无人机航道)
   * ==================================================================== */
  const laneSeeds = picked.slice(0, Math.max(3, Math.min(picked.length, 8)));
  if (T.airLane.enabled) {
    for (let i = 0; i < Math.min(T.airLane.count, laneSeeds.length * 2); i++) {
      const { l } = laneSeeds[i % laneSeeds.length];
      const y = clamp(T.airLane.minY + (i / Math.max(1, T.airLane.count - 1)) * (T.airLane.maxY - T.airLane.minY),
        T.airLane.minY, T.airLane.maxY);
      const off = ((i % 3) - 1) * 26;
      const ax = l.axis === 'x' ? l.x0 : l.x0 + off;
      const az = l.axis === 'x' ? l.z0 + off : l.z0;
      const bx = l.axis === 'x' ? l.x1 : l.x1 + off;
      const bz = l.axis === 'x' ? l.z1 + off : l.z1;
      const path = new Path3([
        new THREE.Vector3(ax, y, az), new THREE.Vector3(bx, y, bz),
      ], true);
      out.airLanes.push({ path, y });
      // two-way taxi traffic: each lane hosts both directions, offset laterally
      for (const s of [-1, 1]) {
        const perp = l.axis === 'x' ? [0, 1] : [1, 0];
        out.taxiPaths.push(new Path3([
          new THREE.Vector3(ax + perp[0] * s * 5, y + s * 1.5, az + perp[1] * s * 5),
          new THREE.Vector3(bx + perp[0] * s * 5, y + s * 1.5, bz + perp[1] * s * 5),
        ], true));
      }
      // floating lane beacons so the corridor is legible in the dark
      const nB = Math.max(2, Math.floor(path.length / 160));
      for (let k = 0; k < nB; k++) {
        const p = path.sample((k / nB) * path.length, new THREE.Vector3());
        const mb = chunks.at(p.x, p.z, STYLE.EMISSIVE);
        const a = [rng.next(), 2, 1, 2.4];
        const b = [0, 4, rng.next(), 0.2];
        mb.box(p.x, p.y, p.z, 1.2, 26, 1.2, a, b, { uo: 0, vo: 0 });
        mb.box(p.x, p.y, p.z, 5, 1.0, 5, a, b, { uo: 0, vo: 0 });
        out.neonSources.push({ x: p.x, y: p.y, z: p.z, r: 60, intensity: 1.5 });
      }
    }
    // sightseeing loops over the core give the taxis somewhere to go
    for (let i = 0; i < Math.min(6, T.airLane.count); i++) {
      const r = plan.Rc * rng.float(0.35, 0.95);
      const y = rng.float(T.airLane.minY, T.airLane.maxY * 0.8);
      const pts = [];
      const nP = rng.int(5, 8);
      for (let k = 0; k < nP; k++) {
        const a2 = (k / nP) * Math.PI * 2;
        pts.push([Math.cos(a2) * r * rng.float(0.85, 1.15), y + rng.float(-18, 26), Math.sin(a2) * r * rng.float(0.85, 1.15)]);
      }
      out.taxiPaths.push(new Path3(smoothPolyline(pts, 5, true), true));
    }
  }

  if (T.droneLane.enabled) {
    for (let i = 0; i < T.droneLane.count; i++) {
      const { l } = laneSeeds[i % laneSeeds.length] || { l: { x0: -100, z0: -100, x1: 100, z1: 100, axis: 'x' } };
      const y = rng.float(T.droneLane.minY, T.droneLane.maxY);
      const off = rng.float(-70, 70);
      const p0 = new THREE.Vector3(
        l.x0 + (l.axis === 'x' ? 0 : off), y, l.z0 + (l.axis === 'x' ? off : 0));
      const p1 = new THREE.Vector3(
        l.x1 + (l.axis === 'x' ? 0 : off), y + rng.float(-8, 8), l.z1 + (l.axis === 'x' ? off : 0));
      out.droneLanes.push(new Path3([p0, p1], true));
    }
    // rooftop-to-rooftop delivery legs make the sky feel inhabited
    const tall = buildings.list.filter((b) => b.height > 40).slice(0, 400);
    for (let i = 0; i < 90 && tall.length > 4; i++) {
      const a = tall[Math.floor(rng.next() * tall.length)];
      const near = buildings.index.query(a.x, a.z, 260, []);
      if (!near.length) continue;
      const b2 = buildings.list[near[Math.floor(rng.next() * near.length)]];
      if (!b2 || b2.i === a.i) continue;
      out.dronePaths.push(new Path3([
        new THREE.Vector3(a.x, a.roofY + 6, a.z),
        new THREE.Vector3((a.x + b2.x) / 2, Math.max(a.roofY, b2.roofY) + rng.float(14, 40), (a.z + b2.z) / 2),
        new THREE.Vector3(b2.x, b2.roofY + 6, b2.z),
      ], true));
    }
    out.dronePaths.push(...out.droneLanes);
  }

  return out;
}

/* ------------------------------------------------------------------ */
/** Connectivity priority: corporate HQs, retail and towers first. */
function skyRank(b) {
  let s = b.height;
  if (b.isHQ) s += 4000;
  if (b.corpRole === 'labs' || b.corpRole === 'housing') s += 1200;
  if (b.kind === 'commercial') s += 900;
  if (b.kind === 'tower') s += 600;
  return s;
}

function buildStation(chunks, rng, x, z, gy, beamY, along, plan) {
  const mb = chunks.at(x, z, STYLE.CURTAIN);
  const a = [rng.next(), 3, 1.0, 0.5];
  const b = [gy, beamY, rng.next(), 0.35];
  const W = 46, D = 22;
  const sx = along === 'z' ? W : D, sz = along === 'z' ? D : W;
  // concourse hangs under the beam
  const cy = beamY - 7;
  mb.frustum(x, gy, z, cy, sx * 0.55, sz * 0.55, sx * 0.5, sz * 0.5, a, b, { uo: 0, vo: 0 });
  mb.box(x, cy, z, sx, 2.6, sz, a, b, { uo: 0, vo: cy });
  mb.box(x, cy + 4.6, z, sx * 1.05, 0.5, sz * 1.05, a, b, { uo: 0, vo: cy });
  for (const s of [-1, 1]) {
    mb.box(x + (along === 'z' ? s * sx / 2 : 0), cy + 2.4, z + (along === 'z' ? 0 : s * sz / 2),
      along === 'z' ? 0.4 : 0.4, 4.4, along === 'z' ? 0.4 : 4.4, a, b, { uo: 0, vo: 0 });
  }
  // platform + neon strip + escalator
  mb.box(x, cy + 2.9, z, sx * 1.02, 0.5, sz * 1.02, [rng.next(), 2, 1, 2.2], b, { uo: 0, vo: 0 });
  const esc = new THREE.Color(rng.pick(['#2f7bff', '#20e6d6', '#a83cff', '#ff3fa4']));
  return { x, z, y: cy, sx, sz, color: '#' + esc.getHexString(), along };
}

/* ------------------------------------------------------------------ */
function buildBridge(chunks, rng, c, style, neonSources) {
  const { a, b, y } = c;
  const dx = b.x - a.x, dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const yaw = Math.atan2(dz, dx);
  const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
  const mb = chunks.at(cx, cz, style);
  const wdt = c.light ? 3.2 : rng.float(5, 9);
  const A = [rng.next(), 1, 0.7, 0.2];
  const B = [y, 8, rng.next(), 0.35];

  // deck: box rotated about Y so its length runs along X before rotation
  mb.box(cx, y, cz, len, 0.55, wdt, A, B, { uo: 0, vo: 0, rotY: yaw });
  mb.box(cx, y + 0.9, cz, len, 1.6, 0.22, A, B, { uo: 0, vo: 0, rotY: yaw + Math.PI / 2 });
  for (const s of [-1, 1]) {
    mb.box(cx + Math.cos(yaw + Math.PI / 2) * s * wdt / 2, y + 0.85, cz + Math.sin(yaw + Math.PI / 2) * s * wdt / 2,
      len, 0.14, 0.14, A, B, { uo: 0, vo: 0, rotY: yaw });
  }
  // truss under the deck
  const nT = Math.max(2, Math.round(len / 7));
  for (let i = 0; i <= nT; i++) {
    const t = i / nT;
    const px = a.x + dx * t, pz = a.z + dz * t;
    mb.box(px, y - 1.3, pz, 0.35, 2.0, wdt * 0.8, A, B, { uo: 0, vo: 0, rotY: yaw });
    if (i < nT) {
      const t2 = (i + 1) / nT;
      mb.box((px + a.x + dx * t2) / 2, y - 1.3, (pz + a.z + dz * t2) / 2,
        len / nT, 0.16, 0.16, A, B, { uo: 0, vo: 0, rotY: yaw + (i % 2 ? 0.5 : -0.5) });
    }
  }
  // central support when the span is long
  if (len > 52) {
    const gy = a.baseY;
    mb.cylinder(cx, gy, cz, y - 2.2, 0.85, 0.7, 8, A, B, { vo: 0, cap: false });
  }
  if (!c.light) {
    neonSources.push({ x: cx, y: y - 1, z: cz, r: 34, intensity: 1.2 });
    // a lit spine along the walkway
    mb.box(cx, y + 1.75, cz, len * 0.97, 0.12, 0.5, [rng.next(), 2, 1, 2.0], B, { uo: 0, vo: 0, rotY: yaw });
  }
}
