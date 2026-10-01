import * as THREE from 'three';
import { instancedQuad, crowdQuad, crowdFigure, instAttr } from '../../models/primitives.js';
import { VehicleSwarm, airTaxiGeometry, droneGeometry, maglevCarGeometry } from '../../models/vehicles.js';
import { clamp } from '../core/grid.js';
import { DISTRICT_POPULATION } from './districts.js';

/**
 * AGENT 7 — Population.
 *
 * 1 000 – 50 000 agents, simulated entirely on the GPU. A random walk over the
 * pedestrian raster is baked into a path atlas once per regeneration; from then
 * on every agent's position is a texture lookup in the vertex shader, so the CPU
 * never touches an agent again.
 *
 * Two tiers coexist:
 *   • a billboard crowd drawn as SDF pedestrians — the mass of the city
 *   • an articulated low-poly tier that is *re-pointed* at whichever paths are
 *     currently nearest the camera, so close-up figures always have real legs
 */

export function generateCrowd(cfg, rng, ctx) {
  const { plan, roads } = ctx;
  const N = cfg.npc;
  const S = cfg.world.mapSize;
  const maxPaths = S >= 2048 ? 2600 : S >= 1024 ? 1600 : 900;
  const pathPoints = N.pathPoints;

  /* ---------------- 1. Bake the pedestrian paths ---------------- */
  const walkable = (x, z) => {
    const v = roads.raster.sampleWorld(x, z);
    return v >= 1 && v <= 5;
  };
  const paths = [];
  const step = 7.5;
  const dirs = [[1, 0], [0.7071, 0.7071], [0, 1], [-0.7071, 0.7071], [-1, 0], [-0.7071, -0.7071], [0, -1], [0.7071, -0.7071]];
  let guard = 0;
  while (paths.length < maxPaths && guard++ < maxPaths * 30) {
    // seed on a walkable cell
    let x = 0, z = 0, ok = false;
    for (let a = 0; a < 40; a++) {
      const r = Math.sqrt(rng.next()) * plan.Rc * 1.02;
      const th = rng.float(0, Math.PI * 2);
      x = Math.cos(th) * r; z = Math.sin(th) * r;
      if (walkable(x, z)) { ok = true; break; }
    }
    if (!ok) continue;

    const pts = [[x, plan.heightAt(x, z), z]];
    let dir = rng.int(0, 7);
    for (let p = 1; p < pathPoints; p++) {
      let moved = false;
      // momentum keeps walks purposeful instead of drunken
      for (let att = 0; att < 5; att++) {
        if (att > 0 && rng.bool(0.62)) dir = (dir + (rng.bool() ? 1 : 7)) % 8;
        const nx = x + dirs[dir][0] * step;
        const nz = z + dirs[dir][1] * step;
        if (walkable(nx, nz) && !plan.isWater(nx, nz)) { x = nx; z = nz; moved = true; break; }
      }
      if (!moved) break;
      pts.push([x, plan.heightAt(x, z), z]);
    }
    if (pts.length < 4) continue;
    // pad out to the fixed texture width
    while (pts.length < pathPoints) pts.push(pts[pts.length - 1].slice());
    paths.push({ pts, district: plan.districtAt(pts[Math.floor(pts.length / 2)][0], pts[Math.floor(pts.length / 2)][2]) });
  }

  /* ---------------- 2. Path atlas (float texture) ---------------- */
  const rows = Math.max(1, paths.length);
  const data = new Float32Array(pathPoints * rows * 4);
  const lengths = new Float32Array(rows);
  for (let r = 0; r < rows; r++) {
    const p = paths[r].pts;
    let acc = 0;
    for (let i = 0; i < pathPoints; i++) {
      if (i > 0) {
        const dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], dz = p[i][2] - p[i - 1][2];
        acc += Math.hypot(dx, dy, dz);
      }
      const o = (r * pathPoints + i) * 4;
      data[o] = p[i][0];
      data[o + 1] = p[i][1] + 0.02;
      data[o + 2] = p[i][2];
      data[o + 3] = acc;
    }
    lengths[r] = Math.max(acc, 1);
  }
  const pathTex = new THREE.DataTexture(data, pathPoints, rows, THREE.RGBAFormat, THREE.FloatType);
  pathTex.minFilter = THREE.NearestFilter;
  pathTex.magFilter = THREE.NearestFilter;
  pathTex.wrapS = THREE.ClampToEdgeWrapping;
  pathTex.wrapT = THREE.ClampToEdgeWrapping;
  pathTex.generateMipmaps = false;
  pathTex.needsUpdate = true;

  /* ---------------- 3. Occupations ---------------- */
  const occs = N.occupations;
  const occColor = new Float32Array(16 * 3);
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Color(i < occs.length ? occs[i].color : '#c9c9d4');
    occColor[i * 3] = c.r; occColor[i * 3 + 1] = c.g; occColor[i * 3 + 2] = c.b;
  }
  // upload into the shared uniform block (array of THREE.Color)
  const uOcc = ctx.materials.uniforms.uOccColor.value;
  for (let i = 0; i < 16; i++) uOcc[i].setRGB(occColor[i * 3], occColor[i * 3 + 1], occColor[i * 3 + 2]);

  /* ---------------- 4. Instances ---------------- */
  const total = clamp(N.count, N.countRange[0], N.countRange[1]);
  const nearCount = Math.min(N.nearCount, Math.floor(total * 0.12));

  // weight paths by the day/night population profile of their district
  const weights = paths.map((p) => {
    const id = cfg.districts.order[p.district] || 'residential';
    const prof = DISTRICT_POPULATION[id] || DISTRICT_POPULATION.residential;
    return (prof.day + prof.night) * 0.5;
  });
  const wSum = weights.reduce((s, v) => s + v, 0) || 1;
  const pickPath = () => {
    let r = rng.next() * wSum;
    for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
    return weights.length - 1;
  };

  const npc = new Float32Array(total * 4);
  const npc2 = new Float32Array(total * 4);
  for (let i = 0; i < total; i++) {
    const p = pickPath();
    const occ = rng.weighted(occs);
    const occIdx = occs.indexOf(occ);
    const speed = rng.float(N.walkSpeed[0], N.walkSpeed[1]) * (occ.id === 'police' || occ.id === 'merc' ? 0.82 : 1);
    npc.set([p, rng.next() * lengths[p], speed, occIdx], i * 4);
    npc2.set([
      rng.float(0.86, 1.14),            // height scale
      rng.float(0.85, 1.2),             // width scale
      rng.next(),                       // phase / seed
      rng.bool(0.03) ? 1 : 0,           // flags (vehicle-ish / fixed heading)
    ], i * 4);
  }

  /* ---------------- 5. Meshes ---------------- */
  const farCount = total - nearCount;
  const group = new THREE.Group();
  group.name = 'crowd';

  const billGeo = crowdQuad();
  billGeo.setAttribute('aNpc', new THREE.InstancedBufferAttribute(npc.slice(nearCount * 4), 4));
  billGeo.setAttribute('aNpc2', new THREE.InstancedBufferAttribute(npc2.slice(nearCount * 4), 4));
  billGeo.instanceCount = farCount;
  const bill = new THREE.Mesh(billGeo, ctx.materials.crowdBillboard());
  bill.name = 'crowd_billboard';
  bill.frustumCulled = false;
  bill.renderOrder = 3;
  group.add(bill);

  // near tier — re-pointed at the closest paths as the player moves
  const figGeo = crowdFigure();
  const nearNpc = new Float32Array(nearCount * 4);
  const nearNpc2 = new Float32Array(nearCount * 4);
  for (let i = 0; i < nearCount; i++) {
    nearNpc.set([i % rows, rng.next() * 60, rng.float(N.walkSpeed[0], N.walkSpeed[1]), rng.int(0, occs.length - 1)], i * 4);
    nearNpc2.set([rng.float(0.88, 1.12), rng.float(0.9, 1.15), rng.next(), 0], i * 4);
  }
  figGeo.setAttribute('aNpc', instAttr('aNpc', nearNpc, 4));
  figGeo.setAttribute('aNpc2', instAttr('aNpc2', nearNpc2, 4));
  figGeo.instanceCount = nearCount;
  const figs = new THREE.Mesh(figGeo, ctx.materials.crowdFigure());
  figs.name = 'crowd_figures';
  figs.frustumCulled = false;
  group.add(figs);

  const aNpcAttr = figGeo.getAttribute('aNpc');

  /* re-point the hero tier at whichever paths are nearest the camera */
  const repoint = (camPos) => {
    const near = [];
    for (let i = 0; i < rows; i++) {
      const p = paths[i].pts[0];
      const d = (p[0] - camPos.x) ** 2 + (p[2] - camPos.z) ** 2;
      near.push([d, i]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const take = Math.min(nearCount, near.length);
    for (let i = 0; i < take; i++) {
      const row = near[i][1];
      aNpcAttr.array[i * 4] = row;
      aNpcAttr.array[i * 4 + 1] = rng.next() * lengths[row];
    }
    aNpcAttr.needsUpdate = true;
  };

  const occCounts = {};
  for (let i = 0; i < total; i++) {
    const id = occs[npc[i * 4 + 3]]?.id || '?';
    occCounts[id] = (occCounts[id] || 0) + 1;
  }

  return {
    group, bill, figs, paths, pathTex, rows, pathPoints, lengths,
    total, nearCount, farCount, occupations: occs, occCounts, repoint,
    setPathTexture(mat) { /* uniforms are shared, nothing to do */ },
  };
}

/**
 * Air and ground traffic meshes. Vehicles are CPU-stepped (a few hundred of
 * them) because they need rigid orientation and banking, which the billboard
 * path shader cannot express.
 */
export function generateTraffic(cfg, rng, ctx, transit) {
  const T = cfg.transit;
  const out = { group: new THREE.Group(), swarms: [], vehicles: 0 };
  out.group.name = 'traffic';

  const mk = (geo, mat, count, name) => {
    const m = new THREE.InstancedMesh(geo, mat, count);
    m.name = name;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    return m;
  };

  // ---- air taxis on the corridors ----
  if (T.airLane.enabled && transit.taxiPaths.length) {
    const count = Math.min(T.airLane.taxis, transit.taxiPaths.length * 30);
    const mesh = mk(airTaxiGeometry(rng.derive('taxiGeo')), ctx.materials.surface(1, 0x2a3140), count, 'air_taxis');
    out.swarms.push(new VehicleSwarm(mesh, transit.taxiPaths, rng.derive('taxi'), {
      speed: T.airLane.speed, bank: 0.85, pitchAlign: 0.5,
    }));
    out.group.add(mesh);
    out.vehicles += count;
  }

  // ---- delivery / surveillance drones ----
  if (T.droneLane.enabled) {
    const dpaths = transit.dronePaths.length ? transit.dronePaths : transit.droneLanes;
    if (dpaths.length) {
      const count = Math.min(T.droneLane.drones, dpaths.length * 40);
      const mesh = mk(droneGeometry(rng.derive('droneGeo')), ctx.materials.surface(1, 0x232833), count, 'drones');
      out.swarms.push(new VehicleSwarm(mesh, dpaths, rng.derive('drone'), {
        speed: T.droneLane.speed, bank: 0.5, pitchAlign: 0.45,
      }));
      out.group.add(mesh);
      out.vehicles += count;
    }
  }

  // ---- maglev consists ----
  if (T.maglev.enabled && transit.maglev.paths.length) {
    const totalTrains = T.maglev.trains;
    const perLine = Math.max(1, Math.floor(totalTrains / transit.maglev.paths.length));
    const cars = [];
    for (const line of transit.maglev.paths) {
      for (let i = 0; i < perLine; i++) cars.push(line);
    }
    if (cars.length) {
      const mesh = mk(maglevCarGeometry(rng.derive('maglevGeo')), ctx.materials.surface(1, 0x1d2430), cars.length, 'maglev');
      out.swarms.push(new VehicleSwarm(mesh, cars, rng.derive('maglev'), {
        speed: [T.maglev.speed, T.maglev.speed * 1.05], bank: 0.15, pitchAlign: 0.1,
      }));
      out.group.add(mesh);
      out.vehicles += cars.length;
    }
  }

  return out;
}
