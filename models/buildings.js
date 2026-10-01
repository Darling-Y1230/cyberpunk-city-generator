import * as THREE from 'three';
import { MeshBuilder } from './primitives.js';

/**
 * models/buildings.js — architectural massing.
 *
 * Each function writes real, buildable massing into a MeshBuilder and reports
 * back where the resulting structure can legally carry attachments (window
 * bands for billboards, roof decks for antennas and vertipads, structural tops
 * for skybridge anchors). Placement is somebody else's problem; shape is here.
 *
 * Style indices map onto shaders/surface.glsl:
 *   0 curtain wall   1 concrete   2 emissive architecture
 *   3 sheet metal    4 glass monolith
 */

export const STYLE = { CURTAIN: 0, CONCRETE: 1, EMISSIVE: 2, METAL: 3, MONOLITH: 4 };

const V = (x, y, z) => [x, y, z];

/** Per-building vertex data block. */
export function dataBlock(seed, litRatio, emissive, baseY, height, hue, dirt, flags = 0) {
  return [
    [seed, flags, litRatio, emissive],
    [baseY, height, hue, dirt],
  ];
}

/* ==================================================================== *
 *  Curtain-wall tower / corporate HQ
 * ==================================================================== */
export function buildTower(mb, rng, o) {
  const {
    x, z, groundY, width, depth, height, seed, hue, litRatio, dirt,
    podium = true, spire = true, style = STYLE.CURTAIN, podiumH = 14,
  } = o;
  const a = [seed, style === STYLE.MONOLITH ? 8 : 3, litRatio, o.emissive ?? 0.0];
  const b = [groundY, height, hue, dirt];
  const anchors = [];

  let y = groundY;
  const w0 = width, d0 = depth;

  // ---- podium / retail base -------------------------------------------
  if (podium) {
    const ph = Math.min(podiumH, height * 0.16);
    mb.frustum(x, y, z, y + ph, w0 * 1.16, d0 * 1.16, w0 * 1.05, d0 * 1.05, a, b,
      { uo: rng.float(0, 30), vo: rng.float(0, 30) });
    y += ph;
    anchors.push({ x, y: groundY + ph * 0.55, z: z + d0 * 0.6, dir: 1, w: w0 * 1.05, kind: 'retail' });
    anchors.push({ x, y: groundY + ph * 0.55, z: z - d0 * 0.6, dir: -1, w: w0 * 1.05, kind: 'retail' });
  } else {
    mb.frustum(x, y, z, y + 2.2, w0 * 1.04, d0 * 1.04, w0, d0, a, b, { uo: 0, vo: 0 });
    y += 2.2;
  }

  // ---- shaft with setbacks --------------------------------------------
  const segments = rng.int(1, 4);
  let cw = w0, cd = d0;
  const remaining = height - (y - groundY);
  let segH = remaining;
  const shrink = [];
  for (let i = 0; i < segments; i++) {
    const last = i === segments - 1;
    const h = last ? segH : segH * rng.float(0.24, 0.42);
    segH -= h;
    const nw = i === segments - 1 ? cw * rng.float(0.55, 0.86) : cw * rng.float(0.80, 0.94);
    const nd = i === segments - 1 ? cd * rng.float(0.55, 0.86) : cd * rng.float(0.80, 0.94);
    mb.frustum(x, y, z, y + h, cw, cd, nw, nd, a, b, { uo: rng.float(0, 40), vo: y });
    // chamfered corner columns on the tall ones — reads as structure, not a box
    if (h > 60 && rng.bool(0.6)) {
      const cr = Math.min(cw, cd) * 0.06;
      for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        mb.box(x + sx * (cw / 2 - cr), y + h / 2, z + sz * (cd / 2 - cr), cr * 2, h, cr * 2,
          a, b, { uo: 0, vo: y, rotY: 0 });
      }
    }
    // setback terrace with an emitter band
    if (!last) {
      mb.box(x, y + h + 0.6, z, nw * 1.02, 1.2, nd * 1.02,
        [seed, 2, litRatio, 0.9], b, { uo: 0, vo: y + h });
      anchors.push({ x, y: y + h + 1.2, z, dir: 1, w: nw, kind: 'terrace' });
    }
    cw = nw; cd = nd; y += h;
    shrink.push([cw, cd]);
  }

  // ---- crown + spire ---------------------------------------------------
  const topY = y;
  mb.box(x, topY + 1.6, z, cw * 0.86, 3.2, cd * 0.86,
    [seed, 2, litRatio, 1.0], b, { uo: 0, vo: topY });
  let spireTop = topY + 3.2;
  if (spire && rng.bool(0.72)) {
    const sh = Math.min(120, Math.max(18, height * rng.float(0.05, 0.14)));
    mb.cylinder(x, topY + 3.2, z, topY + 3.2 + sh * 0.55, Math.max(1.4, cw * 0.07), Math.max(1.0, cw * 0.05), 8, a, b,
      { vo: topY, cap: false });
    mb.cylinder(x, topY + 3.2 + sh * 0.55, z, topY + 3.2 + sh, Math.max(1.0, cw * 0.05), 0.25, 8,
      [seed, 2, litRatio, 1.4], b, { vo: topY + sh * 0.55, cap: false });
    spireTop = topY + 3.2 + sh;
  }
  // rooftop plant + antenna farm
  mb.box(x + cw * 0.22, topY + 4.6, z - cd * 0.2, cw * 0.34, 3.0, cd * 0.34, a, b, { uo: 0, vo: topY });

  return {
    topY: spireTop,
    roofY: topY + 3.2,
    anchorY: groundY + height * rng.float(0.42, 0.78),
    footprint: [cw, cd],
    anchors,
  };
}

/* ==================================================================== *
 *  Residential slab / luxury terrace
 * ==================================================================== */
export function buildSlab(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt, style = STYLE.CONCRETE } = o;
  const a = [seed, style === STYLE.CURTAIN ? 3 : 1, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];
  const long = Math.max(width, depth), short = Math.min(width, depth);
  const rotY = width >= depth ? 0 : Math.PI / 2;

  let y = groundY;
  // ground-floor retail plinth
  const plinth = Math.min(5.5, height * 0.2);
  mb.frustum(x, y, z, y + plinth, long * 1.04, short * 1.3, long * 1.02, short * 1.2, a, b, { rotY, uo: 0, vo: 0 });
  y += plinth;

  // stepped slab body — real housing blocks step back to keep daylight
  const steps = height > 70 ? rng.int(2, 3) : 1;
  let cw = long, cd = short;
  const left = height - plinth;
  let rem = left;
  const crown = [];
  for (let i = 0; i < steps; i++) {
    const last = i === steps - 1;
    const h = last ? rem : rem * rng.float(0.4, 0.62);
    rem -= h;
    const nw = last ? cw : cw * rng.float(0.86, 0.97);
    const nd = last ? cd : cd * rng.float(0.72, 0.9);
    mb.frustum(x, y, z, y + h, cw, cd, nw, nd, a, b, { rotY, uo: rng.float(0, 20), vo: y });
    if (!last) {
      mb.box(x, y + h + 0.4, z, nw * 1.01, 0.8, nd * 1.01, [seed, 2, litRatio, 0.7], b, { uo: 0, vo: y + h, rotY });
      crown.push(y + h);
    }
    cw = nw; cd = nd; y += h;
  }

  // roof clutter: water tanks, stair head, aerials
  const topY = y;
  const nTanks = rng.int(1, 3);
  for (let i = 0; i < nTanks; i++) {
    const tr = rng.float(1.1, 2.2);
    const tx = x + rng.float(-cw * 0.3, cw * 0.3);
    const tz = z + rng.float(-cd * 0.3, cd * 0.3);
    mb.cylinder(tx, topY, tz, topY + rng.float(2.4, 4.6), tr, tr, 10, a, b, { vo: topY });
  }
  mb.box(x - cw * 0.3, topY + 1.4, z + cd * 0.25, cw * 0.16, 2.8, cd * 0.3, a, b, { uo: 0, vo: topY, rotY });

  return {
    topY, roofY: topY,
    anchorY: groundY + height * rng.float(0.55, 0.9),
    footprint: [cw, cd],
    anchors: [{ x, y: groundY + plinth * 0.6, z: z + cd * 0.7, dir: 1, w: cw, kind: 'retail' }],
  };
}

/* ==================================================================== *
 *  Commercial mid-rise with a signage rack
 * ==================================================================== */
export function buildCommercial(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt } = o;
  const a = [seed, 3, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  let y = groundY;
  const ph = Math.min(7.5, height * 0.22);
  mb.frustum(x, y, z, y + ph, width * 1.1, depth * 1.1, width, depth, a, b, { uo: 0, vo: 0 });
  y += ph;
  mb.frustum(x, y, z, groundY + height, width, depth, width * rng.float(0.9, 1.0), depth * rng.float(0.9, 1.0),
    a, b, { uo: rng.float(0, 24), vo: y });

  const topY = groundY + height;
  // stepped signage rack — the stacked-ads silhouette
  const rackH = rng.float(3, 9);
  mb.box(x, topY + rackH / 2, z, width * 0.9, rackH, depth * 0.9, [seed, 2, litRatio, 0.8], b, { uo: 0, vo: topY });

  return {
    topY: topY + rackH, roofY: topY,
    anchorY: groundY + height * rng.float(0.35, 0.85),
    footprint: [width, depth],
    anchors: [
      { x, y: groundY + height * 0.35, z: z + depth / 2, dir: 1, w: width, kind: 'facade' },
      { x, y: groundY + height * 0.72, z: z + depth / 2, dir: 1, w: width, kind: 'facade' },
      { x, y: topY + rackH + 0.6, z, dir: 1, w: width * 0.9, kind: 'roof' },
    ],
  };
}

/* ==================================================================== *
 *  Slum accretion — stacked shacks, tarps, stilts
 * ==================================================================== */
export function buildShackStack(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt } = o;
  const a = [seed, 1, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  let y = groundY;
  const layers = Math.max(1, Math.round(height / rng.float(2.4, 3.6)));
  let cw = width * rng.float(0.85, 1.05);
  let cd = depth * rng.float(0.85, 1.05);
  const stilts = o.stilts || 0;
  if (stilts > 0) {
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      mb.box(x + sx * cw * 0.36, groundY - stilts / 2, z + sz * cd * 0.36, 0.28, stilts, 0.28, a, b, { uo: 0, vo: 0 });
    }
    y = groundY;
  }
  for (let i = 0; i < layers; i++) {
    const h = rng.float(2.2, 3.3);
    const ox = rng.float(-0.28, 0.28) * cw;
    const oz = rng.float(-0.28, 0.28) * cd;
    // corrugated shell
    mb.box(x + ox, y + h / 2, z + oz, cw, h, cd, a, b,
      { uo: rng.float(0, 12), vo: y, rotY: rng.float(-0.12, 0.12) });
    // overhanging tin roof
    mb.box(x + ox, y + h + 0.09, z + oz, cw * 1.14, 0.18, cd * 1.14, a, b,
      { uo: 0, vo: y + h, rotY: rng.float(-0.06, 0.06) });
    // tarpaulin / awning
    if (rng.bool(0.55)) {
      const sw = rng.bool() ? cw * 0.7 : 0.2;
      const sd = sw === 0.2 ? cd * 0.7 : 0.2;
      mb.box(x + ox + rng.float(-0.4, 0.4), y + h * 0.72, z + oz + rng.sign() * (cd * 0.52),
        sw * 1.1, 0.1, sd * 1.1, [seed, 1, litRatio * 0.4, 0.0], b, { uo: 0, vo: y + h });
    }
    y += h + 0.18;
    cw *= rng.float(0.86, 1.02);
    cd *= rng.float(0.86, 1.02);
    if (cw < 1.6 || cd < 1.6) break;
  }
  return {
    topY: y, roofY: y - 0.4,
    anchorY: groundY + height * rng.float(0.3, 0.9),
    footprint: [cw, cd],
    stilts,
    anchors: height > 9
      ? [{ x, y: groundY + height * rng.float(0.4, 0.8), z: z + depth / 2, dir: 1, w: width, kind: 'facade' }]
      : [],
  };
}

/* ==================================================================== *
 *  Industrial shed — sawtooth roof, chimneys, silos, gantries
 * ==================================================================== */
export function buildShed(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt } = o;
  const a = [seed, 3, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  const bodyH = Math.max(4.5, height * 0.72);
  mb.frustum(x, groundY, z, groundY + bodyH, width, depth, width * 0.99, depth * 0.99, a, b,
    { uo: rng.float(0, 18), vo: 0 });

  // sawtooth roof lights
  const teeth = Math.max(2, Math.round(width / 9));
  for (let i = 0; i < teeth; i++) {
    const tx = x - width / 2 + (i + 0.5) * (width / teeth);
    mb.frustum(tx, groundY + bodyH, z, groundY + bodyH + 2.4,
      width / teeth * 0.92, depth, width / teeth * 0.5, depth * 0.98, a, b, { uo: 0, vo: bodyH });
  }

  // chimneys
  const chim = rng.int(0, 3);
  for (let i = 0; i < chim; i++) {
    const ch = height * rng.float(1.0, 2.6);
    const cx2 = x + rng.float(-width * 0.42, width * 0.42);
    const cz2 = z + rng.float(-depth * 0.42, depth * 0.42);
    const cr = rng.float(0.9, 2.4);
    mb.cylinder(cx2, groundY, cz2, groundY + ch, cr * 1.5, cr, 10, a, b, { vo: 0, cap: false });
    mb.box(cx2, groundY + ch + 0.3, cz2, cr * 2.4, 0.6, cr * 2.4, [seed, 2, 0.5, 0.5], b, { uo: 0, vo: ch });
  }

  // silos / pressure vessels
  const silos = rng.int(0, 4);
  for (let i = 0; i < silos; i++) {
    const sr = rng.float(1.6, 3.6);
    const sh = sr * rng.float(2.4, 5.0);
    const sx = x + width / 2 + sr * 1.4 * (1 + (i % 2));
    const sz = z - depth / 2 + (i + 0.5) * (depth / Math.max(silos, 1));
    mb.cylinder(sx, groundY, sz, groundY + sh, sr, sr, 12, a, b, { vo: 0 });
    mb.cylinder(sx, groundY + sh, sz, groundY + sh + sr * 0.55, sr, 0.2, 12, a, b, { vo: sh, cap: false });
  }

  // gantry crane rail over the yard
  if (rng.bool(0.4)) {
    const gy = groundY + bodyH + rng.float(3, 7);
    mb.box(x, gy, z + depth * 0.62, width * 1.0, 0.7, 0.7, a, b, { uo: 0, vo: gy });
    for (const s of [-1, 1]) {
      mb.box(x + s * width * 0.45, (gy + groundY) / 2, z + depth * 0.62, 0.6, gy - groundY, 0.6, a, b, { uo: 0, vo: 0 });
    }
  }

  return {
    topY: groundY + bodyH + 2.4, roofY: groundY + bodyH,
    anchorY: groundY + bodyH * 0.7,
    footprint: [width, depth],
    anchors: [{ x, y: groundY + bodyH + 3.2, z: z + depth / 2, dir: 1, w: width * 0.8, kind: 'facade' }],
  };
}

/* ==================================================================== *
 *  Port warehouse + container stacks
 * ==================================================================== */
export function buildWarehouse(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt } = o;
  const a = [seed, 3, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  mb.frustum(x, groundY, z, groundY + height, width, depth, width * 0.98, depth * 0.98, a, b,
    { uo: rng.float(0, 20), vo: 0 });
  // roller doors
  const doors = Math.max(2, Math.round(width / 16));
  for (let i = 0; i < doors; i++) {
    const dx = x - width / 2 + (i + 0.5) * (width / doors);
    mb.box(dx, groundY + 3.6, z + depth / 2 + 0.15, 5.0, 7.2, 0.3,
      [seed, 2, 0.9, 0.6], b, { uo: 0, vo: 0 });
  }
  // container stacks in the yard
  const stacks = rng.int(1, 5);
  for (let s = 0; s < stacks; s++) {
    const bx = x + rng.float(-width * 0.42, width * 0.42);
    const bz = z + rng.float(-depth * 0.42, depth * 0.42);
    const cx = rng.int(1, 4), cy = rng.int(1, 5);
    for (let iy = 0; iy < cy; iy++)
      for (let ix = 0; ix < cx; ix++) {
        mb.box(bx + ix * 2.6, groundY + 1.3 + iy * 2.7, bz, 2.5, 2.6, 12.0, a, b,
          { uo: 0, vo: iy * 2.7, rotY: rng.bool(0.15) ? Math.PI / 2 : 0 });
      }
  }
  return {
    topY: groundY + height, roofY: groundY + height,
    anchorY: groundY + height * 0.6,
    footprint: [width, depth],
    anchors: [{ x, y: groundY + height * 0.55, z: z + depth / 2, dir: 1, w: width * 0.6, kind: 'facade' }],
  };
}

/* ==================================================================== *
 *  Data fortress — windowless monolith with vertical cooling fins
 * ==================================================================== */
export function buildMonolith(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt } = o;
  const a = [seed, 8, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  mb.frustum(x, groundY, z, groundY + height, width, depth, width * 0.96, depth * 0.96, a, b, { uo: 0, vo: 0 });
  // fins
  const fins = Math.max(3, Math.round(width / 6));
  for (let i = 0; i < fins; i++) {
    const fx = x - width / 2 + (i + 0.5) * (width / fins);
    for (const s of [1, -1]) {
      mb.box(fx, groundY + height / 2, z + s * (depth / 2 + 0.7), width / fins * 0.28, height * 0.94, 1.4,
        [seed, 2, litRatio, 0.4], b, { uo: 0, vo: 0 });
    }
  }
  // halo band near the crown
  mb.box(x, groundY + height * 0.9, z, width * 1.03, 1.4, depth * 1.03, [seed, 2, litRatio, 1.2], b,
    { uo: 0, vo: height * 0.9 });
  return {
    topY: groundY + height, roofY: groundY + height,
    anchorY: groundY + height * 0.55,
    footprint: [width, depth],
    anchors: [{ x, y: groundY + height * 0.82, z: z + depth / 2, dir: 1, w: width, kind: 'facade' }],
  };
}

/* ==================================================================== *
 *  Hospital / campus — pavilion clusters around a spine
 * ==================================================================== */
export function buildCampus(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt, pavilions = 4 } = o;
  const a = [seed, 1, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  const n = Math.max(2, pavilions);
  let maxTop = groundY;
  const anchors = [];
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rng.float(-0.2, 0.2);
    const rad = Math.min(width, depth) * rng.float(0.16, 0.34);
    const px = x + Math.cos(ang) * rad;
    const pz = z + Math.sin(ang) * rad;
    const pw = width * rng.float(0.28, 0.46);
    const pd = depth * rng.float(0.28, 0.46);
    const ph = height * rng.float(0.45, 1.0);
    mb.frustum(px, groundY, pz, groundY + ph, pw, pd, pw * 0.96, pd * 0.96, a, b,
      { uo: rng.float(0, 18), vo: 0 });
    mb.box(px, groundY + ph + 0.8, pz, pw * 0.5, 1.6, pd * 0.5, [seed, 2, 0.6, 0.5], b, { uo: 0, vo: ph });
    maxTop = Math.max(maxTop, groundY + ph);
    anchors.push({ x: px, y: groundY + ph * 0.6, z: pz + pd / 2, dir: 1, w: pw, kind: 'facade' });
  }
  // connecting atrium spine
  const ah = height * 0.42;
  mb.frustum(x, groundY, z, groundY + ah, width * 0.3, depth * 0.86, width * 0.3, depth * 0.86, a, b, { uo: 0, vo: 0 });
  mb.frustum(x, groundY + ah, z, groundY + ah + 4, width * 0.34, depth * 0.9, width * 0.2, depth * 0.6,
    [seed, 4, litRatio, 0.6], b, { uo: 0, vo: ah });
  maxTop = Math.max(maxTop, groundY + ah + 4);

  return {
    topY: maxTop, roofY: maxTop,
    anchorY: groundY + height * 0.5,
    footprint: [width, depth],
    anchors,
  };
}

/* ==================================================================== *
 *  Energy plant — cooling towers, reactor dome, turbine hall, pylons
 * ==================================================================== */
export function buildReactor(mb, rng, o) {
  const { x, z, groundY, width, depth, height, seed, hue, litRatio, dirt } = o;
  const a = [seed, 3, litRatio, 0.0];
  const b = [groundY, height, hue, dirt];

  // turbine hall
  mb.frustum(x, groundY, z, groundY + height * 0.5, width * 0.8, depth * 0.5,
    width * 0.78, depth * 0.48, a, b, { uo: 0, vo: 0 });

  // hyperbolic cooling towers (stepped cylinders read as hyperboloid at range)
  const towers = rng.int(1, 3);
  const anchors = [];
  for (let i = 0; i < towers; i++) {
    const tr = Math.min(width, depth) * rng.float(0.1, 0.17);
    const th = height * rng.float(0.7, 1.3);
    const tx = x + rng.float(-width * 0.35, width * 0.35);
    const tz = z + depth * 0.5 + tr * 1.6 + i * tr * 2.6;
    const seg = 16;
    const steps = 6;
    for (let s = 0; s < steps; s++) {
      const t0 = s / steps, t1 = (s + 1) / steps;
      const r0 = tr * (1.0 + 0.55 * Math.sin(Math.PI * t0 * 0.9) - 0.45 * t0);
      const r1 = tr * (1.0 + 0.55 * Math.sin(Math.PI * t1 * 0.9) - 0.45 * t1);
      mb.cylinder(tx, groundY + th * t0, tz, groundY + th * t1, r0, r1, seg, a, b, { vo: th * t0, cap: false });
    }
    mb.cylinder(tx, groundY + th, tz, groundY + th + 0.6, tr * 1.05, tr * 1.05, seg, a, b, { vo: th, cap: false });
    anchors.push({ x: tx, y: groundY + th * 0.6, z: tz + tr, dir: 1, w: tr * 2, kind: 'facade' });
  }

  // containment dome
  const dr = Math.min(width, depth) * 0.22;
  mb.cylinder(x - width * 0.2, groundY, z - depth * 0.3, groundY + dr * 0.9, dr, dr, 16, a, b, { vo: 0, cap: false });
  const seg = 14, rings = 5;
  for (let r = 0; r < rings; r++) {
    const t0 = r / rings, t1 = (r + 1) / rings;
    const rr0 = dr * Math.cos(t0 * Math.PI / 2), rr1 = dr * Math.cos(t1 * Math.PI / 2);
    mb.cylinder(x - width * 0.2, groundY + dr * 0.9 + dr * Math.sin(t0 * Math.PI / 2),
      z - depth * 0.3, groundY + dr * 0.9 + dr * Math.sin(t1 * Math.PI / 2), rr0, rr1, 16, a, b,
      { vo: dr * 0.9 + dr * t0 });
  }

  // pylons
  for (let i = 0; i < rng.int(1, 3); i++) {
    const px = x + rng.float(-width * 0.48, width * 0.48);
    const pz = z + rng.float(-depth * 0.48, depth * 0.48);
    const ph = height * rng.float(0.5, 0.9);
    mb.cylinder(px, groundY, pz, groundY + ph, 0.9, 0.5, 6, a, b, { vo: 0, cap: false });
    for (let k = 1; k <= 3; k++) {
      mb.box(px, groundY + ph * k / 4, pz, 7 - k, 0.3, 0.3, a, b, { uo: 0, vo: 0 });
    }
  }

  return {
    topY: groundY + height, roofY: groundY + height * 0.5,
    anchorY: groundY + height * 0.6,
    footprint: [width, depth],
    anchors,
  };
}

export const BUILDERS = {
  tower: buildTower,
  slab: buildSlab,
  commercial: buildCommercial,
  shack: buildShackStack,
  shed: buildShed,
  warehouse: buildWarehouse,
  monolith: buildMonolith,
  campus: buildCampus,
  reactor: buildReactor,
};
