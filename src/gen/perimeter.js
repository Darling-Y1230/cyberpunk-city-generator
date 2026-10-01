import * as THREE from 'three';
import { STYLE } from '../../models/buildings.js';
import { clamp } from '../core/grid.js';

/**
 * The city edge.
 *
 * A megacity does not stop at a line — it frays. Outward from the last zoned
 * blocks the build thins into industrial ruins, then a quarantine belt with a
 * blast wall, watchtowers and checkpoints, and finally open wasteland, salt
 * flats and hills. Everything is generated as *decay* of the same language used
 * inside the wall, which is what keeps the boundary from reading as a cut.
 */
export function generatePerimeter(cfg, rng, plan, roads, buildings, chunks, propReqs) {
  const Rc = plan.Rc;
  const S = cfg.world.mapSize;
  const wallR = Rc * 1.09;
  const ruins = [];
  const towers = [];
  const gates = [];

  /* ---------------- industrial ruins in the fray zone ---------------- */
  const nRuins = S >= 2048 ? 300 : S >= 1024 ? 160 : 70;
  for (let i = 0; i < nRuins; i++) {
    const a = rng.float(0, Math.PI * 2);
    let r = Rc * rng.float(1.0, 1.55);
    let x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > S * 0.49 || Math.abs(z) > S * 0.49) continue;
    if (plan.isWater(x, z)) continue;
    const gy = plan.heightAt(x, z);
    if (gy < 0.4) continue;
    const mb = chunks.at(x, z, STYLE.METAL);
    const kind = rng.next();
    const w = rng.float(10, 46), d = rng.float(10, 46), h = rng.float(3, 22) * (rng.bool(0.15) ? 3 : 1);
    const a1 = [rng.next(), 1, 0.05, 0.0];
    const b = [gy, h, rng.next(), 1.4];
    if (kind < 0.42) {
      // a collapsed hall: walls only, one long side missing
      mb.box(x, gy + h * 0.5, z - d / 2, w, h, 0.7, a1, b, { uo: 0, vo: 0 });
      mb.box(x - w / 2, gy + h * 0.5, z, 0.7, h, d, a1, b, { uo: 0, vo: 0 });
      mb.box(x + w / 2, gy + h * 0.42, z, 0.7, h * 0.84, d * 0.7, a1, b, { uo: 0, vo: 0 });
      // roof partially caved in
      mb.box(x - w * 0.24, gy + h, z, w * 0.5, 0.5, d, a1, b, { uo: 0, vo: 0, rotY: rng.float(-0.1, 0.1) });
    } else if (kind < 0.7) {
      // skeletal frame
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        mb.box(x + sx * w / 2, gy + h / 2, z + sz * d / 2, 0.6, h, 0.6, a1, b, { uo: 0, vo: 0 });
      }
      for (let f = 1; f <= 3; f++) {
        if (rng.bool(0.3)) continue;
        mb.box(x, gy + h * f / 4, z, w, 0.4, d, a1, b, { uo: 0, vo: 0 });
      }
    } else if (kind < 0.86) {
      // rubble mound with fragments
      mb.cylinder(x, gy - 1, z, gy + h * 0.35, w * 0.5, w * 0.16, 9, a1, b, { vo: 0, cap: false });
      for (let k = 0; k < rng.int(3, 10); k++) {
        const fw = rng.float(1, 5);
        mb.box(x + rng.float(-w * 0.5, w * 0.5), gy + rng.float(0, h * 0.4), z + rng.float(-d * 0.5, d * 0.5),
          fw, rng.float(0.4, 2), fw * rng.float(0.5, 1.4), a1, b, { uo: 0, vo: 0, rotY: rng.float(0, 3.14) });
      }
    } else {
      // abandoned stack / silo
      const rr = rng.float(2, 8);
      mb.cylinder(x, gy, z, gy + h * rng.float(0.6, 1.4), rr, rr * 0.8, 10, a1, b, { vo: 0, cap: false });
      mb.cylinder(x, gy + h * 0.9, z, gy + h * 1.05, rr * 0.8, rr * 0.5, 10, a1, b, { vo: 0, cap: false });
    }
    ruins.push({ x, z, gy, h });
    if (rng.bool(0.25)) {
      propReqs.push({ kind: 'barrier', x: x + rng.float(-8, 8), y: gy, z: z + rng.float(-8, 8), yaw: rng.float(0, 6.3), scale: 1 });
    }
  }

  /* ---------------- quarantine belt: blast wall + watchtowers ---------------- */
  const wallSegs = [];
  const nSeg = S >= 2048 ? 260 : S >= 1024 ? 160 : 96;
  for (let i = 0; i < nSeg; i++) {
    const a0 = (i / nSeg) * Math.PI * 2;
    const a1 = ((i + 1) / nSeg) * Math.PI * 2;
    const rr = wallR * rng.float(0.97, 1.03);
    const x0 = Math.cos(a0) * rr, z0 = Math.sin(a0) * rr;
    const x1 = Math.cos(a1) * rr, z1 = Math.sin(a1) * rr;
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
    if (Math.abs(mx) > S * 0.5 || Math.abs(mz) > S * 0.5) continue;
    // the wall follows the shore: it opens at the harbour
    const dot = (mx * plan.seaDir[0] + mz * plan.seaDir[1]);
    if (dot > plan.coastBase - 30) continue;
    if (plan.isWater(mx, mz)) continue;
    const gy = plan.heightAt(mx, mz);
    const seg = Math.hypot(x1 - x0, z1 - z0) * 1.15;
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    const mb = chunks.at(mx, mz, STYLE.CONCRETE);
    const a = [rng.next(), 1, 0.2, 0.0];
    const b = [gy, cfg.world.wallHeight, rng.next(), 1.1];
    const H = cfg.world.wallHeight;
    mb.frustum(mx, gy - 2, mz, gy + H, 0.92, seg, 0.72, seg * 0.99,
      a, b, { rotY: yaw + Math.PI / 2, uo: 0, vo: 0 });
    // coping, buttresses and the sensor mast line
    mb.box(mx, gy + H + 0.7, mz, 1.9, 1.4, seg * 1.01, a, b, { uo: 0, vo: 0, rotY: yaw + Math.PI / 2 });
    if (i % 4 === 0) {
      mb.frustum(mx, gy - 2, mz, gy + H * 0.62, 3.4, 2.6, 2.4, 2.0, a, b, { rotY: yaw, uo: 0, vo: 0 });
    }
    if (i % 6 === 0) {
      // spotlight mast
      mb.cylinder(mx, gy + H, mz, gy + H + 7, 0.24, 0.16, 6, a, b, { vo: 0, cap: false });
      mb.box(mx, gy + H + 7, mz, 1.6, 0.5, 0.5, [rng.next(), 2, 1, 1.6], b, { uo: 0, vo: 0, rotY: yaw });
    }
    wallSegs.push({ mx, mz, gy, H });
  }
  // watchtowers
  const nT = 22;
  for (let i = 0; i < nT; i++) {
    const a = (i / nT) * Math.PI * 2 + rng.float(-0.03, 0.03);
    const rr = wallR * rng.float(1.01, 1.05);
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.abs(x) > S * 0.5 || Math.abs(z) > S * 0.5) continue;
    if (plan.isWater(x, z)) continue;
    const dot = (x * plan.seaDir[0] + z * plan.seaDir[1]);
    if (dot > plan.coastBase - 30) continue;
    const gy = plan.heightAt(x, z);
    const H = cfg.world.wallHeight;
    const mb = chunks.at(x, z, STYLE.CONCRETE);
    const a1 = [rng.next(), 1, 0.4, 0.0];
    const b = [gy, H + 26, rng.next(), 1.0];
    mb.frustum(x, gy - 2, z, gy + H + 16, 7.5, 7.5, 6.2, 6.2, a1, b, { uo: 0, vo: 0 });
    mb.frustum(x, gy + H + 16, z, gy + H + 22, 6.2, 6.2, 8.4, 8.4, a1, b, { uo: 0, vo: 0 });
    mb.frustum(x, gy + H + 22, z, gy + H + 26, 8.4, 8.4, 3.0, 3.0, [rng.next(), 2, 1, 1.2], b, { uo: 0, vo: 0 });
    // rotating beacon
    mb.cylinder(x, gy + H + 26, z, gy + H + 28, 0.5, 0.4, 6, [rng.next(), 2, 1, 2.4], b, { vo: 0, cap: false });
    towers.push({ x, z, gy, h: H + 28 });
  }

  /* ---------------- checkpoints: the only ways in and out ---------------- */
  const nG = 5;
  for (let i = 0; i < nG; i++) {
    const a = (i / nG) * Math.PI * 2 + rng.float(-0.25, 0.25);
    const rr = wallR;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (Math.abs(x) > S * 0.5 || Math.abs(z) > S * 0.5) continue;
    if (plan.isWater(x, z)) continue;
    const dot = (x * plan.seaDir[0] + z * plan.seaDir[1]);
    if (dot > plan.coastBase - 30) continue;
    const gy = plan.heightAt(x, z);
    const yaw = Math.atan2(z, x);
    const mb = chunks.at(x, z, STYLE.CONCRETE);
    const a1 = [rng.next(), 1, 0.6, 0.0];
    const b = [gy, 14, rng.next(), 0.9];
    const H = cfg.world.wallHeight;
    // gate: two pylon blocks with a span over the road
    for (const s of [-1, 1]) {
      const px = x + Math.cos(yaw + Math.PI / 2) * s * 17;
      const pz = z + Math.sin(yaw + Math.PI / 2) * s * 17;
      mb.frustum(px, gy - 2, pz, gy + H + 6, 9, 14, 8, 12, a1, b, { rotY: yaw, uo: 0, vo: 0 });
      mb.frustum(px, gy + H + 6, pz, gy + H + 12, 8, 12, 6, 9, a1, b, { rotY: yaw, uo: 0, vo: 0 });
    }
    mb.box(x, gy + H + 4, z, 40, 3.2, 8, a1, b, { uo: 0, vo: 0, rotY: yaw + Math.PI / 2 });
    mb.box(x, gy + H + 2.4, z, 36, 0.9, 3.0, [rng.next(), 2, 1, 2.0], b, { uo: 0, vo: 0, rotY: yaw + Math.PI / 2 });
    gates.push({ x, z, gy, yaw });
    propReqs.push({ kind: 'barrier', x, y: gy, z, yaw: yaw + Math.PI / 2, scale: 2.2 });
    for (let k = 0; k < 10; k++) {
      propReqs.push({
        kind: rng.pick(['barrier', 'camera', 'signal', 'trash']),
        x: x + rng.float(-22, 22), y: gy, z: z + rng.float(-16, 16),
        yaw: rng.float(0, 6.3), scale: rng.float(0.9, 1.5),
      });
    }
  }

  return {
    ruins, towers, gates, wallSegs,
    wallRadius: wallR,
    stats: { ruins: ruins.length, wallSegments: wallSegs.length, watchtowers: towers.length, gates: gates.length },
  };
}
