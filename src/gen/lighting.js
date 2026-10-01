import * as THREE from 'three';
import { NeonPool, NEON_MAX } from '../shaders/materials.js';
import { clamp } from '../core/grid.js';

/**
 * AGENT 5 — Lighting.
 *
 * The city runs on 95 % artificial light. Rather than paying for thousands of
 * real lights, every emitter is registered as a *source*; each frame the eight
 * most influential sources near the camera are uploaded and shaded per pixel.
 * The result looks like a city lit by a hundred thousand tubes and costs eight.
 *
 * The mandated霓虹 ratio (blue 35 / purple 25 / cyan 20 / pink 15 / red 5) is
 * enforced when the sources are created and reported back for validation.
 */

const PALETTE = [
  { name: 'blue',   hex: '#2f7bff', weight: 0.35 },
  { name: 'purple', hex: '#a83cff', weight: 0.25 },
  { name: 'cyan',   hex: '#20e6d6', weight: 0.20 },
  { name: 'pink',   hex: '#ff3fa4', weight: 0.15 },
  { name: 'red',    hex: '#ff2a2a', weight: 0.05 },
];

export function generateLighting(cfg, rng, ctx) {
  const { plan, roads, buildings, transit, vertical, adInfo } = ctx;
  const pool = new NeonPool(ctx.materials, NEON_MAX);
  const colors = new Map();
  for (const p of PALETTE) colors.set(p.name, new THREE.Color(p.hex));
  const tally = { blue: 0, purple: 0, cyan: 0, pink: 0, red: 0, other: 0 };

  /**
   * The mandated ratio is enforced by drawing from a shuffled bag holding
   * exactly 35/25/20/15/5 slots rather than by independent weighted draws.
   * Independent draws converge only in the limit; over a few thousand emitters
   * they routinely land 10+ points off, which the validator flags.
   */
  const BAG = [];
  for (const p of PALETTE) for (let i = 0; i < Math.round(p.weight * 100); i++) BAG.push(p);
  let bag = rng.shuffle(BAG);
  let bagAt = 0;
  const pick = () => {
    if (bagAt >= bag.length) { bag = rng.shuffle(BAG); bagAt = 0; }
    return bag[bagAt++];
  };
  const add = (x, y, z, r, intensity, forceName) => {
    const p = forceName ? PALETTE.find((q) => q.name === forceName) : pick();
    tally[p.name]++;
    pool.add(x, y, z, r, colors.get(p.name), intensity * (0.7 + 0.6 * rng.next()));
    return p;
  };

  /* ---------------- street lighting along the carriageways ---------------- */
  const streetLights = [];
  const lit = (seg, spacing, intensity, y) => {
    const len = Math.hypot(seg.x1 - seg.x0, seg.z1 - seg.z0);
    const n = Math.max(1, Math.floor(len / spacing));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = seg.x0 + (seg.x1 - seg.x0) * t;
      const z = seg.z0 + (seg.z1 - seg.z0) * t;
      const gy = plan.heightAt(x, z);
      const p = add(x + rng.float(-2, 2), gy + y, z + rng.float(-2, 2), rng.float(24, 40), intensity);
      streetLights.push({ x, z, y: gy, color: p.hex, h: y });
    }
  };
  for (const s of roads.segments) {
    if (s.v === 1) lit(s, 26, 1.0, 8.2);
    else if (s.v === 2) lit(s, 40, 0.7, 7.4);
  }

  /* ---------------- building neon (already harvested by Agent 3) ---------------- */
  for (const n of buildings.neonSources) {
    const named = n.colorHint ? null : pick().name;
    tally[named || 'other']++;
    pool.add(n.x, n.y, n.z, n.r, n.colorHint ? new THREE.Color(n.colorHint) : colors.get(named), n.intensity);
  }

  /* ---------------- transit, signage and structure emissives ---------------- */
  for (const n of (transit?.neonSources || [])) {
    tally[n.colorHint ? 'other' : 'cyan']++;
    pool.add(n.x, n.y, n.z, n.r, n.colorHint ? new THREE.Color(n.colorHint) : colors.get('cyan'), n.intensity);
  }
  // the subnet and the aerial concessions light themselves
  for (const n of (vertical?.underground?.neonSources || [])) {
    tally[n.colorHint ? 'other' : 'purple']++;
    pool.add(n.x, n.y, n.z, n.r, n.colorHint ? new THREE.Color(n.colorHint) : colors.get('purple'), n.intensity);
  }
  for (const n of (vertical?.sky?.neonSources || [])) {
    tally[n.colorHint ? 'other' : 'cyan']++;
    pool.add(n.x, n.y, n.z, n.r, n.colorHint ? new THREE.Color(n.colorHint) : colors.get('cyan'), n.intensity);
  }

  /* ---------------- advertising backlight ---------------- */
  if (adInfo && adInfo.anchors) {
    for (const a of adInfo.anchors) {
      const p = pick();
      tally[p.name]++;
      pool.add(a.x, a.y, a.z, rng.float(16, 34), 0.85, colors.get(p.name));
    }
  }

  pool.build();

  const total = Object.values(tally).reduce((s, v) => s + v, 0) || 1;
  const report = {};
  for (const k of Object.keys(tally)) report[k] = tally[k] / total;

  return {
    pool,
    palette: PALETTE,
    sources: pool.sources.length,
    streetLights,
    colorReport: report,
    tally,
    /** 95 / 5 split between artificial and natural illumination. */
    artificialRatio: cfg.lighting.artificialRatio,
  };
}

export { PALETTE as NEON_PALETTE };
