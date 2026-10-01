import * as THREE from 'three';
import { Raster } from '../core/grid.js';
import { STYLE } from '../../models/buildings.js';
import { clamp } from '../core/grid.js';

/**
 * The two volumetric districts.
 *
 * AERIAL CONCESSIONS (绌轰腑鍩庡尯) 鈥?cantilevered decks that genuinely bear on the
 * tower cores beneath them: every platform overlaps its host structure and is
 * carried by columns and diagonal trusses, so nothing hovers.
 *
 * THE SUBNET (鍦颁笅鍩庡尯) 鈥?a service grid of tunnels running under the arterial
 * alignments with carved caverns for the black market, illegal clinics, data
 * bourses and bars, reached by lift shafts that break the surface at real
 * street corners.
 */
export function generateVertical(cfg, rng, plan, roads, buildings, chunks, transit) {
  const sky = buildSkyDistrict(cfg, rng, plan, buildings, chunks, transit);
  const underground = buildUnderground(cfg, rng, plan, roads, buildings, chunks);
  return { sky, underground };
}

/** CSS hsl() string 鈥?the light pool accepts anything THREE.Color can parse. */
function hslHex(h, s, l) {
  const deg = Math.round((((h % 1) + 1) % 1) * 360);
  return `hsl(${deg} ${Math.round(s * 100)}% ${Math.round(l * 100)}%)`;
}

/* ==================================================================== *
 * 绌轰腑鍩庡尯
 * ==================================================================== */
function buildSkyDistrict(cfg, rng, plan, buildings, chunks, transit) {
  const platforms = [];
  // Aerial concessions need tall hosts, but "tall" has to scale with the map:
  // a 512 m city has no 200 m towers to hang them from.
  const minHost = Math.max(110, plan.Rc * 0.34);
  const hosts = buildings.list
    .filter((b) => b.height > minHost && b.w > 24 && b.d > 24)
    .sort((a, b) => b.height - a.height)
    .slice(0, cfg.world.mapSize >= 2048 ? 54 : cfg.world.mapSize >= 1024 ? 30 : 16);

  let columns = 0, floorArea = 0;

  for (const host of hosts) {
    const tiers = rng.int(1, 3);
    for (let t = 0; t < tiers; t++) {
      const y = host.baseY + clamp(host.height * rng.float(0.42, 0.86), 120, 520);
      if (y > host.topY - 12) continue;
      const reach = rng.float(14, 34);
      const w = host.w + reach * 2 * rng.float(0.55, 1.0);
      const d = host.d + reach * 2 * rng.float(0.55, 1.0);

      // conflict test: is the airspace clear of every other structure?
      let blocked = false;
      const near = buildings.index.query(host.x, host.z, Math.max(w, d) * 0.8 + 10, []);
      for (const j of near) {
        const o = buildings.list[j];
        if (!o || o.i === host.i) continue;
        if (o.topY < y - 1) continue;
        const ox = (o.w + w) / 2 - Math.abs(o.x - host.x);
        const oz = (o.d + d) / 2 - Math.abs(o.z - host.z);
        if (ox > 0.2 && oz > 0.2) { blocked = true; break; }
      }
      if (blocked) continue;

      const mb = chunks.at(host.x, host.z, STYLE.MONOLITH);
      const a = [rng.next(), 3, 0.85, 0.5];
      const b = [y, 40, rng.next(), 0.3];

      // ---- deck slab with a void where the tower passes through ----------
      const rim = (w - host.w) / 2;
      if (rim > 1.5) {
        mb.box(host.x, y, host.z, w, 1.5, rim, a, b, { uo: 0, vo: 0 });
        mb.box(host.x, y, host.z, w, 1.5, rim, a, b, { uo: 0, vo: 0 });
        // north / south bands
        mb.box(host.x, y, host.z + (host.d + rim) / 2, w, 1.5, rim, a, b, { uo: 0, vo: 0 });
        mb.box(host.x, y, host.z - (host.d + rim) / 2, w, 1.5, rim, a, b, { uo: 0, vo: 0 });
        // east / west bands
        const sideD = host.d;
        mb.box(host.x + (host.w + rim) / 2, y, host.z, rim, 1.5, sideD, a, b, { uo: 0, vo: 0 });
        mb.box(host.x - (host.w + rim) / 2, y, host.z, rim, 1.5, sideD, a, b, { uo: 0, vo: 0 });
        // soffit + fascia lighting
        mb.box(host.x, y - 1.2, host.z, w * 0.999, 0.9, d * 0.999,
          [rng.next(), 1, 0.2, 0.0], b, { uo: 0, vo: 0 });
        for (const s of [-1, 1]) {
          mb.box(host.x + s * w / 2, y + 0.9, host.z, 0.5, 1.0, d, a, b, { uo: 0, vo: 0 });
          mb.box(host.x, y + 0.9, host.z + s * d / 2, w, 1.0, 0.5, a, b, { uo: 0, vo: 0 });
          mb.box(host.x + s * w / 2, y + 1.3, host.z, 0.28, 0.35, d * 0.98, [rng.next(), 2, 1, 2.0], b, { uo: 0, vo: 0 });
        }
      }
      // ---- structure: columns bearing on the host facade ----------------
      const nCol = rng.int(4, 8);
      for (let c = 0; c < nCol; c++) {
        const ang = (c / nCol) * Math.PI * 2 + rng.float(-0.2, 0.2);
        const px = host.x + Math.cos(ang) * (w / 2 - 1.6);
        const pz = host.z + Math.sin(ang) * (d / 2 - 1.6);
        const braceH = rng.float(16, 46);
        mb.cylinder(px, y - braceH, pz, y - 0.7, 0.55, 0.85, 6, a, b, { vo: 0, cap: false });
        columns++;
        // diagonal tie back into the core
        const tx = host.x + Math.cos(ang) * (host.w / 2) * 0.9;
        const tz = host.z + Math.sin(ang) * (host.d / 2) * 0.9;
        const seg = new THREE.Vector3(tx - px, 1, tz - pz);
        const len = Math.hypot(seg.x, seg.z);
        mb.box((px + tx) / 2, y - braceH * 0.55, (pz + tz) / 2, len, 0.5, 0.5, a, b,
          { uo: 0, vo: 0, rotY: Math.atan2(seg.z, seg.x) });
      }

      // ---- sky housing, gardens and corporate sky lobbies ---------------
      const nUnits = rng.int(3, 9);
      for (let u = 0; u < nUnits; u++) {
        const ang = rng.float(0, Math.PI * 2);
        const rr = rng.float(host.w * 0.55, w * 0.44);
        const ux = host.x + Math.cos(ang) * rr;
        const uz = host.z + Math.sin(ang) * rr;
        if (Math.abs(ux - host.x) < host.w / 2 && Math.abs(uz - host.z) < host.d / 2) continue;
        const uw = rng.float(5, 13), ud = rng.float(5, 13), uh = rng.float(4, 22);
        const style = rng.bool(0.5) ? STYLE.CURTAIN : STYLE.CONCRETE;
        const mm = chunks.at(ux, uz, style);
        mm.frustum(ux, y + 0.8, uz, y + 0.8 + uh, uw, ud, uw * 0.94, ud * 0.94,
          [rng.next(), 3, rng.float(0.3, 1), 0.6], [y, uh, rng.next(), 0.2], { uo: rng.float(0, 12), vo: 0 });
        if (rng.bool(0.4)) {
          mm.box(ux, y + uh + 1.2, uz, uw * 1.05, 0.5, ud * 1.05, [rng.next(), 1, 0.1, 0], [y, 1, 0, 0.6], { uo: 0, vo: 0 });
          // sky garden planting
          for (let g = 0; g < 5; g++) {
            mm.cylinder(ux + rng.float(-uw * 0.4, uw * 0.4), y + 1.2, uz + rng.float(-ud * 0.4, ud * 0.4),
              y + 1.2 + rng.float(1.2, 3.4), rng.float(0.5, 1.2), rng.float(0.2, 0.6), 6,
              [rng.next(), 1, 0.05, 0], [y, 3, rng.next(), 0.4], { vo: 0 });
          }
        }
      }
      // landing pad on the largest tier
      if (t === 0 && rng.bool(0.5)) {
        const rr = w * 0.3;
        mb.cylinder(host.x + (w / 2 - rr) * 0.85, y + 1.0, host.z + (d / 2 - rr) * 0.85, y + 1.6, rr, rr, 14,
          [rng.next(), 2, 1, 0.9], b, { vo: 0, cap: false });
      }

      platforms.push({
        x: host.x, z: host.z, y, w, d, host: host.i, anchored: true,
      });
      floorArea += w * d;
    }
  }

  /* ---- fallback: the aerial district must exist on every seed ---- */
  if (platforms.length === 0) {
    const tallest = buildings.list.slice().sort((a, b) => b.height - a.height).slice(0, 5);
    for (const host of tallest) {
      if (host.height < 40) continue;
      const y = host.baseY + host.height * 0.62;
      const w = host.w + 26, d = host.d + 26;
      const mb = chunks.at(host.x, host.z, STYLE.MONOLITH);
      const a = [rng.next(), 3, 0.85, 0.5];
      const b = [y, 40, rng.next(), 0.3];
      const rim = (w - host.w) / 2;
      mb.box(host.x, y, host.z + (host.d + rim) / 2, w, 1.5, rim, a, b, { uo: 0, vo: 0 });
      mb.box(host.x, y, host.z - (host.d + rim) / 2, w, 1.5, rim, a, b, { uo: 0, vo: 0 });
      mb.box(host.x + (host.w + rim) / 2, y, host.z, rim, 1.5, host.d, a, b, { uo: 0, vo: 0 });
      mb.box(host.x - (host.w + rim) / 2, y, host.z, rim, 1.5, host.d, a, b, { uo: 0, vo: 0 });
      mb.box(host.x, y - 1.2, host.z, w * 0.999, 0.9, d * 0.999, [rng.next(), 1, 0.2, 0], b, { uo: 0, vo: 0 });
      for (const s of [-1, 1]) {
        mb.box(host.x + s * w / 2, y + 1.3, host.z, 0.28, 0.35, d * 0.98, [rng.next(), 2, 1, 2.0], b, { uo: 0, vo: 0 });
      }
      const nCol = 6;
      for (let c = 0; c < nCol; c++) {
        const ang = (c / nCol) * Math.PI * 2;
        const px = host.x + Math.cos(ang) * (w / 2 - 1.6);
        const pz = host.z + Math.sin(ang) * (d / 2 - 1.6);
        mb.cylinder(px, y - 20, pz, y - 0.7, 0.55, 0.85, 6, a, b, { vo: 0, cap: false });
        columns++;
      }
      for (let u = 0; u < 4; u++) {
        const ux = host.x + rng.float(-w * 0.4, w * 0.4);
        const uz = host.z + rng.float(-d * 0.4, d * 0.4);
        if (Math.abs(ux - host.x) < host.w / 2 && Math.abs(uz - host.z) < host.d / 2) continue;
        const uw = rng.float(5, 11), ud = rng.float(5, 11), uh = rng.float(4, 18);
        mb.frustum(ux, y + 0.8, uz, y + 0.8 + uh, uw, ud, uw * 0.94, ud * 0.94,
          [rng.next(), 3, 0.8, 0.6], [y, uh, rng.next(), 0.2], { uo: 0, vo: 0 });
      }
      platforms.push({ x: host.x, z: host.z, y, w, d, host: host.i, anchored: true });
      floorArea += w * d;
    }
  }

  /* skybridges between neighbouring platforms: the aerial street grid */
  const links = [];
  for (let i = 0; i < platforms.length; i++) {
    for (let j = i + 1; j < platforms.length; j++) {
      const a = platforms[i], b = platforms[j];
      const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
      const gapX = dx - (a.w + b.w) / 2, gapZ = dz - (a.d + b.d) / 2;
      const gap = Math.max(gapX, gapZ);
      if (gap < 2 || gap > 90) continue;
      if (Math.abs(a.y - b.y) > 30) continue;
      const y = (a.y + b.y) / 2;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const yaw = Math.atan2(b.z - a.z, b.x - a.x);
      const mb = chunks.at((a.x + b.x) / 2, (a.z + b.z) / 2, STYLE.CONCRETE);
      const aa = [rng.next(), 1, 0.8, 0.3];
      const bb = [y, 6, rng.next(), 0.25];
      mb.box((a.x + b.x) / 2, y, (a.z + b.z) / 2, len, 1.2, 6.5, aa, bb, { uo: 0, vo: 0, rotY: yaw });
      mb.box((a.x + b.x) / 2, y + 1.2, (a.z + b.z) / 2, len, 0.5, 0.4, [rng.next(), 1, 1, 0.4], bb, { uo: 0, vo: 0, rotY: yaw });
      for (const s of [-1, 1]) {
        mb.box((a.x + b.x) / 2 + Math.cos(yaw + Math.PI / 2) * s * 3.2, y + 1.4,
          (a.z + b.z) / 2 + Math.sin(yaw + Math.PI / 2) * s * 3.2, len, 0.14, 0.14,
          [rng.next(), 2, 1, 1.4], bb, { uo: 0, vo: 0, rotY: yaw });
      }
      links.push({ a: i, b: j, y, len });
      if (links.length > 90) break;
    }
    if (links.length > 90) break;
  }

  return { platforms, links, columns, floorArea, platformArea: floorArea };
}

/* ==================================================================== *
 * 鍦颁笅鍩庡尯
 * ==================================================================== */
function buildUnderground(cfg, rng, plan, roads, buildings, chunks) {
  const depth = -26;
  const gallery = new Raster(plan.size, plan.cell);
  const rooms = [];
  const shafts = [];
  const neonSources = [];
  let floorArea = 0;

  // pick the arterials that will carry the service tunnels 鈥?utilities follow
  // the same alignments as the streets above, which is why they are straight
  const mains = [...roads.xLines, ...roads.zLines]
    .filter((l) => l.level <= 2 && Math.hypot((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2) < plan.Rc * 0.9)
    .sort((a, b) => (b.x1 - b.x0 + b.z1 - b.z0) - (a.x1 - a.x0 + a.z1 - a.z0))
    .slice(0, cfg.world.mapSize >= 2048 ? 46 : cfg.world.mapSize >= 1024 ? 26 : 12);

  const cOre = rng.derive('subnet');
  const tunnel = (x0, z0, x1, z1, w) => {
    gallery.stroke(x0, z0, x1, z1, w / 2, 1);
    const len = Math.hypot(x1 - x0, z1 - z0);
    const h = 4.6;
    const mb = chunks.at((x0 + x1) / 2, (z0 + z1) / 2, STYLE.CONCRETE);
    const a = [cOre.next(), 1, 0.25, 0.0];
    const b = [depth, h, cOre.next(), 0.75];
    const yaw = Math.atan2(z1 - z0, x1 - x0);
    mb.box((x0 + x1) / 2, depth - 0.6, (z0 + z1) / 2, len, 0.8, w, a, b, { uo: 0, vo: 0, rotY: yaw });   // floor
    mb.box((x0 + x1) / 2, depth + h, (z0 + z1) / 2, len, 0.8, w, a, b, { uo: 0, vo: 0, rotY: yaw });     // ceiling
    for (const s of [-1, 1]) {
      mb.box((x0 + x1) / 2 + Math.cos(yaw + Math.PI / 2) * s * w / 2, depth + h / 2,
        (z0 + z1) / 2 + Math.sin(yaw + Math.PI / 2) * s * w / 2, len, h, 0.7, a, b,
        { uo: 0, vo: 0, rotY: yaw });
      // service conduits and strip lighting along the wall
      mb.box((x0 + x1) / 2 + Math.cos(yaw + Math.PI / 2) * s * (w / 2 - 0.5), depth + h * 0.78,
        (z0 + z1) / 2 + Math.sin(yaw + Math.PI / 2) * s * (w / 2 - 0.5), len * 0.97, 0.22, 0.5,
        [cOre.next(), 2, 1, 1.5], b, { uo: 0, vo: 0, rotY: yaw });
    }
    // a light every ~34 m so the corridor is walkable rather than a black tube
    const n = Math.max(1, Math.round(len / 34));
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
      neonSources.push({
        x: px, y: depth + h * 0.72, z: pz,
        r: 30, intensity: 1.6, colorHint: hslHex(cOre.next(), 0.7, 0.62),
      });
    }
  };

  for (const l of mains) {
    tunnel(l.x0, l.z0, l.x1, l.z1, rng.float(9, 15));
    // a parallel utility run offset laterally
    if (rng.bool(0.4)) {
      const off = rng.float(14, 26) * (rng.bool() ? 1 : -1);
      if (l.axis === 'x') tunnel(l.x0 + off, l.z0, l.x1 + off, l.z1, rng.float(5, 8));
      else tunnel(l.x0, l.z0 + off, l.x1, l.z1 + off, rng.float(5, 8));
    }
  }

  /* ---- caverns: the actual district content ---- */
  const PROGRAM = [
    { id: 'market', label: '榛戝競 BLACK MARKET', w: [26, 54], d: [24, 46], h: 7.5, neon: 1.6 },
    { id: 'lab', label: '闈炴硶瀹為獙瀹?CLANDESTINE LAB', w: [16, 30], d: [16, 28], h: 5.0, neon: 0.9 },
    { id: 'data', label: '鏁版嵁浜ゆ槗涓績 DATA BOURSE', w: [18, 34], d: [18, 30], h: 5.5, neon: 1.2 },
    { id: 'bar', label: '鍦颁笅閰掑惂 UNDERGROUND BAR', w: [14, 26], d: [14, 24], h: 4.6, neon: 1.9 },
    { id: 'clinic', label: '涔変綋璇婃墍 RIPPERDOC', w: [12, 22], d: [12, 20], h: 4.4, neon: 1.1 },
    { id: 'shrine', label: '绁為緵 SHRINE', w: [8, 14], d: [8, 14], h: 5.0, neon: 0.8 },
    { id: 'farm', label: '鍨傜洿鍐滃満 VERTICAL FARM', w: [20, 40], d: [18, 34], h: 8.0, neon: 0.6 },
  ];

  // seed caverns along the tunnel network
  const cells = [];
  for (let i = 0; i < gallery.n; i++) if (gallery.data[i]) cells.push(i);
  const target = cfg.world.mapSize >= 2048 ? 190 : cfg.world.mapSize >= 1024 ? 110 : 48;
  let tries = 0;
  while (rooms.length < target && tries++ < target * 40) {
    const i = cells[Math.floor(rng.next() * cells.length)];
    if (i === undefined) break;
    const cx = i % gallery.cols, cy = (i / gallery.cols) | 0;
    const [x, z] = gallery.cellToWorld(cx, cy);
    const prog = rng.pick(PROGRAM);
    const w = rng.float(prog.w[0], prog.w[1]);
    const d = rng.float(prog.d[0], prog.d[1]);
    // clear of other caverns?
    if (rooms.some((r) => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && Math.abs(r.z - z) < (r.d + d) / 2 + 4)) continue;
    if (plan.isWater(x, z)) continue;
    gallery.rect(x - w / 2, z - d / 2, x + w / 2, z + d / 2, 2);

    const mb = chunks.at(x, z, STYLE.CONCRETE);
    const a = [rng.next(), 1, 0.7, 0.0];
    const b = [depth, prog.h, rng.next(), 0.7];
    mb.box(x, depth - 0.7, z, w, 0.9, d, a, b, { uo: 0, vo: 0 });
    mb.box(x, depth + prog.h, z, w, 0.9, d, a, b, { uo: 0, vo: 0 });
    for (const s of [-1, 1]) {
      mb.box(x + s * w / 2, depth + prog.h / 2, z, 0.8, prog.h, d, a, b, { uo: 0, vo: 0 });
      mb.box(x, depth + prog.h / 2, z + s * d / 2, w, prog.h, 0.8, a, b, { uo: 0, vo: 0 });
    }
    // interior fit-out: counters, units, holo signs, pipes
    const nFit = rng.int(3, 9);
    for (let f = 0; f < nFit; f++) {
      const fx = x + rng.float(-w * 0.36, w * 0.36);
      const fz = z + rng.float(-d * 0.36, d * 0.36);
      const fw = rng.float(1.2, 3.4), fd = rng.float(1.2, 3.4), fh = rng.float(1.0, 2.8);
      mb.box(fx, depth + fh / 2, fz, fw, fh, fd,
        [rng.next(), rng.bool(0.5) ? 2 : 1, 0.8, rng.float(0.2, 1.6)], b, { uo: 0, vo: 0 });
    }
    // ceiling strip lighting in the programme's colour
    const hue = rng.next();
    for (let s = 0; s < 3; s++) {
      mb.box(x, depth + prog.h - 0.6, z - d * 0.3 + s * d * 0.3, w * 0.9, 0.16, 0.4,
        [hue, 2, 1, 1.8 * prog.neon], b, { uo: 0, vo: 0 });
    }

    rooms.push({ id: prog.id, label: prog.label, x, z, w, d, h: prog.h, y: depth, neon: prog.neon });
    // The subnet is lit entirely by its own fixtures 鈥?without these the whole
    // district renders as an unlit grey box, which is exactly what it did.
    for (let s = 0; s < 3; s++) {
      neonSources.push({
        x, y: depth + prog.h - 1.1, z: z - d * 0.3 + s * d * 0.3,
        r: Math.max(w, d) * 0.95 + 22,
        intensity: 2.3 * prog.neon,
        colorHint: hslHex(hue + s * 0.07, 0.85, 0.58),
      });
    }
    // a spill light in the chamber mouth so the tunnels read as connected
    neonSources.push({
      x: x + w * 0.5, y: depth + prog.h * 0.45, z,
      r: 38, intensity: 1.35, colorHint: hslHex(hue + 0.5, 0.55, 0.5),
    });
    floorArea += w * d;
    tries = 0;
  }

  /* ---- lift shafts breaking the surface at real street corners ---- */
  const entries = [...roads.crossings].sort(() => rng.next() - 0.5).slice(0, cfg.world.mapSize >= 2048 ? 60 : 34);
  for (const [x, z] of entries) {
    if (plan.isWater(x, z)) continue;
    const gy = plan.heightAt(x, z);
    const mb = chunks.at(x, z, STYLE.CONCRETE);
    const a = [rng.next(), 1, 0.6, 0.0];
    const b = [depth, -depth, rng.next(), 0.9];
    // the shaft itself
    mb.box(x, (gy + depth) / 2, z, 9, gy - depth, 9, a, b, { uo: 0, vo: 0 });
    // hollow it out by carving the collision raster instead of boolean geometry
    gallery.rect(x - 3.4, z - 3.4, x + 3.4, z + 3.4, 1);
    // surface kiosk
    const mm = chunks.at(x, z, STYLE.CURTAIN);
    mm.frustum(x, gy, z, gy + 5.2, 10.5, 10.5, 9.5, 9.5, a, b, { uo: 0, vo: 0 });
    mm.frustum(x, gy + 5.2, z, gy + 6.4, 9.5, 9.5, 7.5, 7.5, [rng.next(), 2, 1, 1.4], b, { uo: 0, vo: 0 });
    // escalator void so the descent is legible
    mm.box(x, gy + 2.6, z, 3.2, 5.2, 0.4, [rng.next(), 2, 1, 1.1], b, { uo: 0, vo: 0 });
    shafts.push({ x, z, y: gy, depth, kioskY: gy });
    floorArea += 81;
  }

  // the "sky" raster keeps a hole where the player can fall through
  return { rooms, shafts, floorArea, gallery, y: depth, count: rooms.length, neonSources };
}
