import * as THREE from 'three';
import { Raster, SpatialHash, clamp } from '../core/grid.js';
import { BUILDERS, STYLE } from '../../models/buildings.js';
import { HORIZONTAL_IDS, DISTRICT_FORM } from './districts.js';
import { ROAD_NONE, SIDEWALK } from './roads.js';

/**
 * AGENT 3 — Building stock.
 *
 * Blocks are broken into lots the way a surveyor would: a perimeter ring of
 * frontage lots facing the street, then an interior infill grid for whatever
 * courtyard is left. Every lot is then either built on or deliberately left as
 * a yard, with the *statistical* height of each district drawn from a
 * log-normal so a skyline has a long tail of landmarks instead of a flat top.
 *
 * The pass is budgeted: the layout is surveyed first, and a global fill factor
 * enlarges lots until the estimated building count fits the triangle budget of
 * the chosen map size. Nothing is ever randomly deleted, so no district ends up
 * with a hole in it.
 */

export function generateBuildings(cfg, rng, plan, roads, chunks) {
  const S = cfg.world.mapSize;
  const cell = cfg.world.cellSize;
  const solid = new Raster(S, cell);          // 1 = impassable
  const solidTop = new Float32Array(solid.n); // roof height for collision
  const buildings = [];
  const propReqs = [];
  const adAnchors = [];
  const neonSources = [];

  const budget = S >= 2048 ? 34000 : S >= 1024 ? 16000 : 6200;
  const specs = cfg.districts.specs;
  const formOf = (id) => DISTRICT_FORM[id] || DISTRICT_FORM.residential;
  const diag = { blocks: roads.blocks.length, surveyed: 0, lots: 0, built: 0, skipFill: 0, skipRoad: 0, skipSize: 0, skipWater: 0, skipInset: 0 };

  /* ---------------------------------------------------------------- *
   * Survey: estimate how many lots the plan would naturally produce
   * ---------------------------------------------------------------- */
  const surveyed = [];
  let estimate = 0;
  for (const b of roads.blocks) {
    const id = HORIZONTAL_IDS[b.district];
    const spec = specs[id] || specs.residential;
    const inset = insetBlock(roads, b);
    const W = b.x1 - b.x0 - inset[0] - inset[1];
    const D = b.z1 - b.z0 - inset[2] - inset[3];
    if (W < 8 || D < 8) { diag.skipInset++; continue; }
    if (blockIsWater(plan, b)) { diag.skipWater++; continue; }
    const avg = ((spec.lotW[0] + spec.lotW[1]) / 2) * ((spec.lotD[0] + spec.lotD[1]) / 2);
    // perimeter ring + interior infill at 1.5x the lot pitch
    const perimeter = 2 * (W + D) * Math.min(spec.lotD[0], 22) / avg;
    const interior = Math.max(0, (W - 2 * spec.lotD[0]) * (D - 2 * spec.lotD[0])) / (avg * 2.25);
    const n = (perimeter + interior) * spec.density;
    surveyed.push({ b, id, spec, inset, W, D, n });
    estimate += n;
  }
  diag.surveyed = surveyed.length;
  // fill factor: <1 means build on fewer, larger lots (never a thinner city)
  const fill = clamp(budget / Math.max(estimate, 1), 0.35, 1);
  const lotScale = 1 / Math.sqrt(fill);

  /* ---------------------------------------------------------------- *
   * Build
   * ---------------------------------------------------------------- */
  for (const s of surveyed) {
    const { b, id, spec, inset, W, D } = s;
    const bx0 = b.x0 + inset[0], bx1 = b.x1 - inset[1];
    const bz0 = b.z0 + inset[2], bz1 = b.z1 - inset[3];
    const lots = [];
    layoutLots(lots, bx0, bz0, bx1, bz1, spec, rng, lotScale);

    for (const raw of lots) {
      diag.lots++;
      if (rng.next() > clamp(fill * spec.density * 1.25, 0.12, 1)) { diag.skipFill++; continue; }
      // Trim the plot to the largest carriageway-free sub-rectangle rather than
      // throwing the whole plot away: the alley that crosses a block should cost
      // one narrow strip, not the entire frontage either side of it.
      const lot = fitLot(roads, raw, 6.5);
      if (!lot) { diag.skipRoad++; continue; }
      const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
      if (plan.isWater(cx, cz)) { diag.skipWater++; continue; }
      const margin = cfg.world.lotMargin * 0.5;
      const w = (lot.x1 - lot.x0) - margin * 2;
      const d = (lot.z1 - lot.z0) - margin * 2;
      if (w < 3.2 || d < 3.2) { diag.skipSize++; continue; }

      const groundY = plan.heightAt(cx, cz);
      const built = buildLot({
        cfg, rng, plan, roads, chunks, solids: { solid, solidTop }, buildings,
        propReqs, adAnchors, neonSources,
        lot, x: cx, z: cz, w, d, districtId: id, spec, groundY,
      });
      if (built) diag.built++;
    }
  }

  /* ---------------------------------------------------------------- *
   * Corporations: 3–10 super-corporations claim territory
   * ---------------------------------------------------------------- */
  const corporations = foundCorporations(cfg, rng, plan, buildings, chunks, adAnchors, neonSources, solid, solidTop);

  // territory assignment by nearest HQ (simple Voronoi on the ground plane)
  assignTerritories(buildings, corporations);

  /* ---------------------------------------------------------------- *
   * Index for runtime queries
   * ---------------------------------------------------------------- */
  const index = new SpatialHash(32);
  for (let i = 0; i < buildings.length; i++) {
    const b = buildings[i];
    index.insert(b.x, b.z, i);
  }

  return {
    list: buildings, index, solid, solidTop, propReqs, adAnchors, neonSources,
    corporations, estimate: Math.round(estimate), fill, lotScale, diag,
  };
}

/* ==================================================================== *
 * Geometry helpers
 * ==================================================================== */

/** Kerb clearance plus a short scan for a boulevard or collector alignment that
 *  happens to cross the parcel. The block boundary is already land — the street
 *  corridor was carved out when the block was created — so a deep scan here
 *  would eat the plot it is supposed to protect. */
function insetBlock(roads, b) {
  const { raster, isCarriageway } = roads;
  const kerb = 1.1;
  const probe = 14;
  const step = 3;
  const scan = (x, z, dx, dz) => {
    let d = 0;
    while (d < probe && isCarriageway(raster.sampleWorld(x + dx * d, z + dz * d))) d += step;
    return Math.min(d, probe) + kerb;
  };
  const inset = [0, 0, 0, 0];
  for (const t of [0.25, 0.75]) {
    inset[0] = Math.max(inset[0], scan(b.x0, b.z0 + (b.z1 - b.z0) * t, 1, 0));
    inset[1] = Math.max(inset[1], scan(b.x1, b.z0 + (b.z1 - b.z0) * t, -1, 0));
    inset[2] = Math.max(inset[2], scan(b.x0 + (b.x1 - b.x0) * t, b.z0, 0, 1));
    inset[3] = Math.max(inset[3], scan(b.x0 + (b.x1 - b.x0) * t, b.z1, 0, -1));
  }
  inset[0] = Math.min(inset[0], (b.x1 - b.x0) * 0.24);
  inset[1] = Math.min(inset[1], (b.x1 - b.x0) * 0.24);
  inset[2] = Math.min(inset[2], (b.z1 - b.z0) * 0.24);
  inset[3] = Math.min(inset[3], (b.z1 - b.z0) * 0.24);
  return inset;
}

function blockIsWater(plan, b) {
  let wet = 0, tot = 0;
  for (let i = 0; i <= 4; i++)
    for (let j = 0; j <= 4; j++) {
      tot++;
      if (plan.isWater(b.x0 + (b.x1 - b.x0) * i / 4, b.z0 + (b.z1 - b.z0) * j / 4)) wet++;
    }
  return wet / tot > 0.4;
}

/**
 * Perimeter ring + interior infill. Lots are separated by a party-wall gap so
 * neighbouring facades never produce coplanar z-fighting.
 */
function layoutLots(out, x0, z0, x1, z1, spec, rng, scale) {
  const W = x1 - x0, D = z1 - z0;
  if (W < 6 || D < 6) return;
  const minLot = 5.5;
  let depth = clamp(rng.float(spec.lotD[0], spec.lotD[1]) * scale, minLot, Math.min(W, D) * 0.42);
  const ring = W > depth * 2.6 && D > depth * 2.6;

  const strip = (ax0, az0, ax1, az1, horizontal) => {
    const len = horizontal ? ax1 - ax0 : az1 - az0;
    if (len < minLot) return;
    const n = Math.max(1, Math.round(len / (rng.float(spec.lotW[0], spec.lotW[1]) * scale)));
    // boundaries are jittered once and then shared by their two neighbours, so
    // frontages vary without ever overlapping each other
    const cuts = [0];
    for (let i = 1; i < n; i++) cuts.push(i / n + rng.float(-0.05, 0.05) / n);
    cuts.push(1);
    for (let i = 0; i < n; i++) {
      const t = cuts[i], t1 = cuts[i + 1];
      const a = ax0 + (horizontal ? len * t : 0);
      const b = az0 + (horizontal ? 0 : len * t);
      const c = ax0 + (horizontal ? len * t1 : 0);
      const d = az0 + (horizontal ? 0 : len * t1);
      if (horizontal) out.push({ x0: a, z0: az0, x1: c, z1: az1 });
      else out.push({ x0: ax0, z0: b, x1: ax1, z1: d });
    }
  };

  if (ring) {
    strip(x0, z0, x1, z0 + depth, true);              // north frontage
    strip(x0, z1 - depth, x1, z1, true);              // south frontage
    strip(x0, z0 + depth, x0 + depth, z1 - depth, false);
    strip(x1 - depth, z0 + depth, x1, z1 - depth, false);
    const ix0 = x0 + depth + 0.6, ix1 = x1 - depth - 0.6;
    const iz0 = z0 + depth + 0.6, iz1 = z1 - depth - 0.6;
    if (ix1 - ix0 > 11 && iz1 - iz0 > 11) {
      // interior infill: bigger lots, they get no daylight anyway
      gridLots(out, ix0, iz0, ix1, iz1, spec, rng, scale * 1.5);
    }
  } else {
    gridLots(out, x0, z0, x1, z1, spec, rng, scale);
  }
}

function gridLots(out, x0, z0, x1, z1, spec, rng, scale) {
  const minLot = 5.0;
  let z = z0;
  let guard = 0;
  while (z < z1 - minLot * 0.6 && guard++ < 400) {
    const d = clamp(rng.float(spec.lotD[0], spec.lotD[1]) * scale, minLot, z1 - z);
    let x = x0;
    let g2 = 0;
    while (x < x1 - minLot * 0.6 && g2++ < 400) {
      const w = clamp(rng.float(spec.lotW[0], spec.lotW[1]) * scale, minLot, x1 - x);
      out.push({ x0: x, z0: z, x1: x + w, z1: z + d });
      x += w + rng.float(0.2, 0.9);
    }
    z += d + rng.float(0.2, 1.1);
  }
}

/**
 * Shrinks a plot until it no longer contains carriageway, by bisecting along the
 * longer axis. Two levels of bisection (halves, then quarters) recover most of
 * the frontage that one alley crossing would otherwise destroy, and the search
 * is bounded so it stays cheap.
 */
function fitLot(roads, lot, minSize) {
  const lane = roads.isCarriageway;
  const R = roads.raster;
  if (!R.anyIn(lot.x0, lot.z0, lot.x1, lot.z1, lane)) return lot;
  let best = null, bestArea = 0;
  const consider = (l) => {
    if (l.x1 - l.x0 < minSize || l.z1 - l.z0 < minSize) return;
    if (R.anyIn(l.x0, l.z0, l.x1, l.z1, lane)) return;
    const a = (l.x1 - l.x0) * (l.z1 - l.z0);
    if (a > bestArea) { bestArea = a; best = l; }
  };
  const halves = (l) => (l.x1 - l.x0 > l.z1 - l.z0)
    ? [{ x0: l.x0, z0: l.z0, x1: (l.x0 + l.x1) / 2, z1: l.z1 },
      { x0: (l.x0 + l.x1) / 2, z0: l.z0, x1: l.x1, z1: l.z1 }]
    : [{ x0: l.x0, z0: l.z0, x1: l.x1, z1: (l.z0 + l.z1) / 2 },
      { x0: l.x0, z0: (l.z0 + l.z1) / 2, x1: l.x1, z1: l.z1 }];
  for (const h of halves(lot)) {
    consider(h);
    for (const q of halves(h)) consider(q);
  }
  return best;
}

/* ==================================================================== *
 * One lot -> one structure
 * ==================================================================== */
function buildLot(ctx) {
  const { cfg, rng, plan, chunks, buildings, propReqs, adAnchors, neonSources,
    lot, x, z, w, d, districtId, spec, groundY } = ctx;
  const form = DISTRICT_FORM[districtId] || DISTRICT_FORM.residential;

  const kind = rng.weighted(form.kinds.map(([k, w]) => ({ k, weight: w }))).k;
  const style = rng.pick(form.styles);

  // land value gradient: the same district is taller on its better blocks
  const lv = clamp(plan.lvAt(x, z) / 1.15, 0, 1.6);
  const lvBoost = 0.55 + 0.95 * lv;
  let height = rng.logNormal(spec.hMode * lvBoost, spec.sigma, spec.hMin, spec.hMax);
  if (districtId === 'slum') height = Math.min(height, spec.hMax);
  // very small lots cannot carry a skyscraper — real planning envelopes
  const minFoot = Math.min(w, d);
  height = Math.min(height, 42 + minFoot * 26);
  height = Math.max(height, spec.hMin);

  const seed = rng.next();
  const hue = rng.next();
  const litRatio = clamp(
    (districtId === 'cbd' || districtId === 'corporate' ? 0.34 : 0.5) + rng.float(-0.2, 0.35)
    + (districtId === 'slum' || districtId === 'industrial' ? -0.25 : 0),
    0.03, 0.95);
  const dirt = clamp(rng.float(0.1, 1.0) * (districtId === 'slum' || districtId === 'industrial' ? 1.5 : 0.7), 0, 1.4);
  const emissive = rng.float(0, 0.4) + form.adDensity * 0.08;
  const rotY = (districtId === 'slum' && rng.bool(0.55))
    ? rng.float(-0.35, 0.35)
    : (rng.bool(0.18) ? rng.float(-0.05, 0.05) : 0);

  // skip one in N in the very cheapest land -> yards, ruins, market squares
  if (rng.bool(districtId === 'slum' ? 0.06 : 0.09)) {
    propReqs.push({ kind: 'trash', x, y: groundY, z, yaw: rng.float(0, 6.28), scale: rng.float(0.7, 1.4) });
    return false;
  }

  const builder = BUILDERS[kind] || BUILDERS.slab;
  const mb = chunks.at(x, z, style);

  // low-lying terrain: never float. Sample the corners and use the minimum.
  let base = groundY;
  for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    base = Math.min(base, plan.heightAt(x + ox, z + oz));
  }
  const stilts = groundY - base > 0.35 && (districtId === 'slum' || districtId === 'port') ? groundY - base : 0;

  const res = builder(mb, rng, {
    x, z, groundY: base, width: w, depth: d, height,
    seed, hue, litRatio, dirt, rotY,
    podium: rng.bool(form.podium),
    spire: rng.bool(form.spire),
    style,
    stilts,
    pavilions: rng.int(2, 5),
  });

  if (!res || res.topY <= base) return false;

  const rec = {
    i: buildings.length, x, z, baseY: base, w, d, height: res.topY - base,
    topY: res.topY, roofY: res.roofY ?? res.topY, kind, style, districtId,
    corridorY: res.anchorY, footprint: res.footprint || [w, d],
    litRatio, seed, hue, corporation: null, anchors: res.anchors || [],
    isSlum: districtId === 'slum', rotY, stilts,
  };
  buildings.push(rec);

  // occupancy for collision + pathing
  const m = 0.4;
  const [ax, az] = ctx.solids.solid.worldToCell(x - w / 2 + m, z - d / 2 + m);
  const [bx, bz] = ctx.solids.solid.worldToCell(x + w / 2 - m, z + d / 2 - m);
  for (let cy = Math.max(0, az); cy <= Math.min(ctx.solids.solid.rows - 1, bz); cy++)
    for (let cx = Math.max(0, ax); cx <= Math.min(ctx.solids.solid.cols - 1, bx); cx++) {
      const id = cy * ctx.solids.solid.cols + cx;
      ctx.solids.solid.data[id] = 1;
      ctx.solids.solidTop[id] = Math.max(ctx.solids.solidTop[id], res.topY);
    }

  /* ---- rooftop and facade dressing --------------------------------- */
  const roofArea = w * d;
  const nAc = clamp(Math.round(roofArea / 26 * rng.float(0.5, 1.4)), 0, 9);
  for (let i = 0; i < nAc; i++) {
    propReqs.push({
      kind: rng.weighted([{ k: 'ac', weight: 6 }, { k: 'vent', weight: 2 }, { k: 'tank', weight: 2.4 },
        { k: 'dish', weight: 2 }, { k: 'antenna', weight: 1.5 }, { k: 'transformer', weight: 0.6 },
        { k: 'cableBox', weight: 1 }]).k,
      x: x + rng.float(-w * 0.36, w * 0.36),
      y: rec.roofY + rng.float(0, 0.3),
      z: z + rng.float(-d * 0.36, d * 0.36),
      yaw: rng.float(0, Math.PI * 2),
      scale: rng.float(0.75, 1.35),
    });
  }
  // air conditioners clinging to facades
  if (rec.height > 10 && districtId !== 'industrial' && districtId !== 'energy') {
    const nUnits = clamp(Math.round(rec.height / rng.float(6, 14)), 1, 26);
    for (let i = 0; i < nUnits; i++) {
      const side = rng.int(0, 3);
      const yy = base + rng.float(6, Math.max(7, rec.height - 2));
      const off = 0.55;
      const px = side === 0 ? x + rng.float(-w / 2, w / 2) : side === 1 ? x + w / 2 + off
        : side === 2 ? x + rng.float(-w / 2, w / 2) : x - w / 2 - off;
      const pz = side === 0 ? z + d / 2 + off : side === 1 ? z + rng.float(-d / 2, d / 2)
        : side === 2 ? z - d / 2 - off : z + rng.float(-d / 2, d / 2);
      propReqs.push({
        kind: rng.weighted([{ k: 'ac', weight: 8 }, { k: 'dish', weight: 2.5 },
          { k: 'cableBox', weight: 1.4 }, { k: 'ladder', weight: 0.7 }]).k,
        x: px, y: yy, z: pz,
        yaw: side === 0 ? 0 : side === 1 ? Math.PI / 2 : side === 2 ? Math.PI : -Math.PI / 2,
        scale: rng.float(0.7, 1.2),
      });
    }
  }

  /* ---- advertising anchors ------------------------------------------ */
  const adCount = Math.round(spec.ads * form.adDensity * clamp(rng.float(0.6, 1.4), 0, 2));
  for (let i = 0; i < adCount; i++) {
    const a = rec.anchors.length ? rng.pick(rec.anchors) : null;
    adAnchors.push({
      x: a ? a.x : x,
      y: a ? a.y + rng.float(-2, 6) : base + rec.height * rng.float(0.3, 0.9),
      z: a ? a.z : z + d / 2 + 0.6,
      dir: a ? a.dir : 1,
      width: a ? a.w : w,
      districtId, building: rec.i, kind: rng.next(),
    });
  }
  // rooftop signage rack / holo mast on tall buildings
  if (rec.height > 60 && rng.bool(clamp(spec.neon * 0.55, 0, 0.85))) {
    adAnchors.push({
      x, y: rec.roofY + 4 + rng.float(0, 3), z, dir: 0,
      width: Math.min(w, d) * 1.2, districtId, building: rec.i, kind: rng.next(), roof: true,
    });
  }

  /* ---- neon emitters feeding the light pool -------------------------- */
  const nNeon = Math.round(spec.neon * clamp(rec.height / 40, 1, 7) * rng.float(0.5, 1.5));
  for (let i = 0; i < nNeon; i++) {
    const side = rng.int(0, 3);
    neonSources.push({
      x: x + (side === 1 ? w / 2 + 1 : side === 3 ? -w / 2 - 1 : rng.float(-w / 2, w / 2)),
      y: base + rng.float(4, Math.max(6, rec.height * 0.85)),
      z: z + (side === 0 ? d / 2 + 1 : side === 2 ? -d / 2 - 1 : rng.float(-d / 2, d / 2)),
      r: rng.float(26, 74),
      intensity: spec.neon * rng.float(0.5, 1.4),
    });
  }

  return true;
}

/* ==================================================================== *
 * Corporations
 * ==================================================================== */
function foundCorporations(cfg, rng, plan, buildings, chunks, adAnchors, neonSources, solid, solidTop) {
  const [lo, hi] = cfg.corporations.count;
  const count = rng.int(lo, hi);
  const pool = rng.shuffle(cfg.corporations.pool).slice(0, count);

  // best HQ sites: high land value inside CBD / corporate zoned blocks
  const candidates = buildings
    .filter((b) => (b.districtId === 'cbd' || b.districtId === 'corporate')
      && b.w * b.d > 320 && b.height > 90)
    .map((b) => ({ b, s: plan.lvAt(b.x, b.z) * (b.w * b.d) * b.height * rng.float(0.6, 1.4) }))
    .sort((a, b) => b.s - a.s);

  const corps = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    let pick = null;
    for (const c of candidates) {
      if (used.has(c.b.i)) continue;
      // keep HQs apart so territories are meaningful
      if (corps.some((k) => Math.hypot(k.x - c.b.x, k.z - c.b.z) < 240)) continue;
      pick = c; break;
    }
    if (!pick) pick = candidates.find((c) => !used.has(c.b.i)) || null;
    if (!pick) break;
    used.add(pick.b.i);
    const def = pool[i % pool.length];
    const b = pick.b;

    // enforce the landmark silhouette: HQ towers are the tallest thing around
    const targetH = rng.float(420, 980);
    extendTower(chunks, b, targetH, def.color, rng, solid, solidTop);

    const corp = {
      ...def, index: i, building: b.i, x: b.x, z: b.z, baseY: b.baseY,
      height: b.height, radius: cfg.corporations.territoryRadius * rng.float(0.7, 1.5),
      color3: new THREE.Color(def.color),
      assets: { hq: b.i, labs: [], housing: [], security: [], ads: 0 },
    };
    b.corporation = i;
    b.isHQ = true;
    corps.push(corp);

    // corporate advertising network: every building within the territory
    // carries at least one sign in the corporate livery
    for (const o of buildings) {
      if (o.i === b.i) continue;
      const dd = Math.hypot(o.x - b.x, o.z - b.z);
      if (dd > corp.radius) continue;
      if (rng.bool(0.07)) {
        adAnchors.push({
          x: o.x, y: o.baseY + o.height * rng.float(0.45, 0.92), z: o.z + o.d / 2 + 0.7,
          dir: 1, width: o.w, districtId: o.districtId, building: o.i,
          kind: rng.next(), corp: i,
        });
        corp.assets.ads++;
      }
    }
  }

  // secondary facilities: R&D, staff housing, private security
  for (const corp of corps) {
    const want = [
      { key: 'labs', districts: ['research', 'datacenter', 'corporate'], n: rng.int(1, 3) },
      { key: 'housing', districts: ['luxury', 'residential'], n: rng.int(1, 3) },
      { key: 'security', districts: ['industrial', 'slum', 'commercial', 'nightlife'], n: rng.int(1, 3) },
    ];
    for (const w of want) {
      const pool2 = buildings.filter((b) => w.districts.includes(b.districtId) && !b.corporation && b.i !== corp.building);
      for (let i = 0; i < w.n && pool2.length; i++) {
        const b = pool2.splice(Math.floor(rng.next() * pool2.length), 1)[0];
        b.corporation = corp.index;
        b.corpRole = w.key;
        corp.assets[w.key].push(b.i);
        neonSources.push({
          x: b.x, y: b.baseY + b.height * 0.9, z: b.z, r: 60,
          intensity: 1.1, colorHint: corp.color,
        });
        adAnchors.push({
          x: b.x, y: b.baseY + b.height * 0.75, z: b.z + b.d / 2 + 0.8, dir: 1,
          width: b.w, districtId: b.districtId, building: b.i, kind: rng.next(),
          corp: corp.index, logo: true,
        });
      }
    }
  }
  return corps;
}

/**
 * Grows an existing massing upward until it is a landmark. Rather than
 * re-running the whole builder we stack extra setback segments on top, which is
 * also how a real tower gets its crown.
 */
function extendTower(chunks, b, targetH, colorHex, rng, solid, solidTop) {
  const mb = chunks.at(b.x, b.z, b.style);
  const a = [b.seed, 5, b.litRatio, 0.9];
  const bd = [b.baseY, targetH, b.hue, 0.25];
  let y = b.topY;
  let cw = (b.footprint[0]) * 0.86, cd = (b.footprint[1]) * 0.86;
  const need = targetH - (b.topY - b.baseY);
  const segs = Math.max(1, Math.round(need / 140));
  let rem = need;
  for (let i = 0; i < segs; i++) {
    const h = i === segs - 1 ? rem : rem * rng.float(0.25, 0.45);
    rem -= h;
    const nw = cw * rng.float(0.78, 0.93), nd = cd * rng.float(0.78, 0.93);
    mb.frustum(b.x, y, b.z, y + h, cw, cd, nw, nd, a, bd, { uo: rng.float(0, 40), vo: y });
    // corporate light band at every setback — the signature skyline rhythm
    mb.box(b.x, y + h + 0.8, b.z, nw * 1.04, 1.6, nd * 1.04,
      [b.seed, 2, b.litRatio, 1.6], bd, { uo: 0, vo: y + h });
    cw = nw; cd = nd; y += h;
  }
  // crown mast
  mb.cylinder(b.x, y, b.z, y + 46, Math.max(1.6, cw * 0.09), 0.5, 8,
    [b.seed, 2, 0.9, 2.0], bd, { vo: y, cap: false });
  mb.box(b.x, y + 2.4, b.z, cw * 0.9, 4.8, cd * 0.9, [b.seed, 2, b.litRatio, 1.8], bd, { uo: 0, vo: y });

  b.height = (y + 46) - b.baseY;
  b.topY = y + 46;
  b.roofY = y + 4.8;
  b.isLandmark = true;
}

function assignTerritories(buildings, corps) {
  if (!corps.length) return;
  for (const b of buildings) {
    if (b.corporation !== null && b.corporation !== undefined) continue;
    let best = -1, bd = Infinity;
    for (const c of corps) {
      const d = (b.x - c.x) ** 2 + (b.z - c.z) ** 2;
      if (d < bd) { bd = d; best = c.index; }
    }
    b.territory = best;
    b.territoryDist = Math.sqrt(bd);
  }
}
