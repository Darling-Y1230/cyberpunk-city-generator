import * as THREE from 'three';
import { MeshBuilder } from '../../models/primitives.js';
import { ChunkSet } from './optimize.js';
import { clamp } from '../core/grid.js';

/**
 * The ground plane.
 *
 * Three coincident surfaces share the same terrain height — terrain, footway
 * and carriageway — and are separated by polygon offset rather than by lifting
 * geometry, so there is no z-fighting at 2 km and no gaps at the kerb line.
 * Road markings, puddles and planar reflections are all evaluated in the
 * fragment shader from metre-true UVs, so a 4 m alley and a 12-lane boulevard
 * are the same two triangles.
 */
export const GROUND_MODE = { ROAD: 0, FOOTWAY: 1, WASTE: 2, WATER: 3, DECK: 4, PLAZA: 5 };

export function buildGround(cfg, rng, plan, roads, chunks) {
  const S = cfg.world.mapSize;
  const Rc = plan.Rc;
  const stats = { roadQuads: 0, groundQuads: 0, crosswalks: 0 };

  /* ---------------- carriageways ---------------- */
  for (let i = 0; i < roads.segments.length; i++) {
    const s = roads.segments[i];
    if (s.v > 3) continue;
    const len = Math.hypot(s.x1 - s.x0, s.z1 - s.z0);
    if (len < 0.5) continue;
    const dx = (s.x1 - s.x0) / len, dz = (s.z1 - s.z0) / len;
    const nx = -dz, nz = dx;
    const half = s.w / 2;
    const lift = 0.045 + (i % 17) * 0.0013;
    const seg = rng.derive('road' + i);
    const seed = seg.next();

    const mb = chunks.at((s.x0 + s.x1) / 2, (s.z0 + s.z1) / 2, GROUND_MODE.ROAD);
    const a = [s.v, s.axis === 'x' ? 0 : 1, half, seed];
    const b = [0, 4, 0, 0.4];

    // subdivide long runs so the surface follows the terrain
    const nSub = Math.max(1, Math.ceil(len / 22));
    for (let k = 0; k < nSub; k++) {
      const t0 = k / nSub, t1 = (k + 1) / nSub;
      const ax = s.x0 + (s.x1 - s.x0) * t0, az = s.z0 + (s.z1 - s.z0) * t0;
      const bx = s.x0 + (s.x1 - s.x0) * t1, bz = s.z0 + (s.z1 - s.z0) * t1;
      const h0 = plan.heightAt(ax, az) + lift;
      const h1 = plan.heightAt(bx, bz) + lift;
      const v0 = t0 * len, v1 = t1 * len;
      mb.quad(
        [ax + nx * half, h0, az + nz * half],
        [bx + nx * half, h1, bz + nz * half],
        [bx - nx * half, h1, bz - nz * half],
        [ax - nx * half, h0, az - nz * half],
        [[-half, v0], [-half, v1], [half, v1], [half, v0]],
        [0, 1, 0], a, b);
      stats.roadQuads++;
    }
  }

  /* ---------------- zebra crossings ---------------- */
  const cwRng = rng.derive('crossings');
  for (const [x, z, w] of roads.crossings) {
    if (cwRng.bool(0.55)) continue;
    const gy = plan.heightAt(x, z) + 0.085;
    const mb = chunks.at(x, z, GROUND_MODE.PLAZA);
    const a = [cwRng.next(), 5, 1, 0.0];
    const b = [gy, 0.2, cwRng.next(), 0.2];
    const ang = cwRng.bool() ? 0 : Math.PI / 2;
    const nBars = 6;
    const barLen = w * 0.86;
    const cs = Math.cos(ang), sn = Math.sin(ang);
    for (let k = -nBars / 2; k < nBars / 2; k++) {
      const off = k * (w * 0.9 / nBars);
      const px = x + (-sn) * off, pz = z + (cs) * off;
      const hw = w * 0.9 / nBars * 0.32;
      const T = (ox, oz) => [px + ox * cs + oz * sn, gy, pz - ox * sn + oz * cs];
      mb.quad(T(-hw, -barLen / 2), T(hw, -barLen / 2), T(hw, barLen / 2), T(-hw, barLen / 2),
        [[0, 0], [1, 0], [1, 1], [0, 1]], [0, 1, 0], a, b);
      stats.crosswalks++;
    }
  }

  /* ---------------- footways ---------------- */
  const R = roads.raster;
  const cell = plan.cell;
  const mbF = (x, z) => chunks.at(x, z, GROUND_MODE.FOOTWAY);
  for (let cy = 0; cy < R.rows; cy++) {
    for (let cx = 0; cx < R.cols; cx++) {
      if (R.data[cy * R.cols + cx] !== 4) continue;      // SIDEWALK
      const [x, z] = R.cellToWorld(cx, cy);
      const mb = mbF(x, z);
      const h = plan.heightAt(x, z) + 0.13;
      const hx = cell / 2, hz = cell / 2;
      mb.quad([x - hx, h, z - hz], [x - hx, h, z + hz], [x + hx, h, z + hz], [x + hx, h, z - hz],
        [[x - hx, z - hz], [x - hx, z + hz], [x + hx, z + hz], [x + hx, z - hz]],
        [0, 1, 0], [0, 1, 0.3, 0], [h, 0.2, 0, 0.5]);
      stats.groundQuads++;
    }
  }

  /* ---------------- bare ground / wasteland ---------------- */
  const gRng = rng.derive('ground');
  const step = 8;
  const nCells = Math.ceil(S / step);
  for (let gz = 0; gz < nCells; gz++) {
    for (let gx = 0; gx < nCells; gx++) {
      const x0 = -S / 2 + gx * step, z0 = -S / 2 + gz * step;
      const x1 = x0 + step, z1 = z0 + step;
      const cxm = (x0 + x1) / 2, czm = (z0 + z1) / 2;
      if (plan.isWater(cxm, czm)) continue;
      const r = Math.hypot(cxm, czm) / Rc;
      const isCity = r < 1.12;
      const mode = isCity ? GROUND_MODE.FOOTWAY : GROUND_MODE.WASTE;
      const mb = chunks.at(cxm, czm, mode);
      const h00 = plan.heightAt(x0, z0), h10 = plan.heightAt(x1, z0);
      const h11 = plan.heightAt(x1, z1), h01 = plan.heightAt(x0, z1);
      const tint = isCity ? 0.5 : 1.0;
      const a = [gRng.next(), 1, 0.4, 0.0];
      const b = [h00, 1, gRng.next(), isCity ? 0.8 : 1.3];
      mb.quad([x0, h00, z0], [x0, h01, z1], [x1, h11, z1], [x1, h10, z0],
        [[x0, z0], [x0, z1], [x1, z1], [x1, z0]], [0, 1, 0], a, b);
      stats.groundQuads++;
    }
  }

  /* ---------------- harbour water ---------------- */
  const hw = S * 1.6;
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute([
    -hw, 0, -hw, -hw, 0, hw, hw, 0, hw, hw, 0, -hw,
  ], 3));
  wg.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0,
  ], 3));
  // uv in metres so the wave field has a world-space wavelength
  wg.setAttribute('uv', new THREE.Float32BufferAttribute([
    -hw, -hw, -hw, hw, hw, hw, hw, -hw,
  ], 2));
  wg.setAttribute('aRoad', new THREE.Float32BufferAttribute([
    0, 0, 0, 0.31, 0, 0, 0, 0.31, 0, 0, 0, 0.31, 0, 0, 0, 0.31,
  ], 4));
  wg.setIndex([0, 1, 2, 0, 2, 3]);
  wg.computeBoundingSphere();
  const water = new THREE.Mesh(wg, null);
  water.position.y = cfg.world.seaLevel - 0.25;
  water.name = 'harbour';
  water.frustumCulled = false;

  /* ---------------- quay walls where the city meets the water ---------------- */
  const qRng = rng.derive('quay');
  let quay = 0;
  for (let i = 0; i < plan.coastPath.length - 1; i++) {
    const [ax, az] = plan.coastPath[i];
    const [bx, bz] = plan.coastPath[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1) continue;
    const yaw = Math.atan2(bz - az, bx - ax);
    const mb = chunks.at((ax + bx) / 2, (az + bz) / 2, GROUND_MODE.DECK);
    const h = 3.2;
    mb.box((ax + bx) / 2, h / 2 - 1.2, (az + bz) / 2, len * 1.05, h, 3.4,
      [qRng.next(), 1, 0.3, 0], [0, h, qRng.next(), 0.9], { uo: 0, vo: 0, rotY: yaw });
    quay++;
  }

  return { water, stats, quay };
}
