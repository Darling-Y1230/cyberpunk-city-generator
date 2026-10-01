import { Raster, clamp, dist } from '../core/grid.js';
import { fbm2, ridged2, lerp, smoothstep } from '../core/rng.js';
import { HORIZONTAL_IDS as DISTRICT_IDS, WATER_CELL } from './districts.js';

/**
 * AGENT 1 — Terrain, hydrology, land value and zoning.
 *
 * The city is not stamped onto the map; it *grows* out of a bid-rent field the
 * way a real metropolis does:
 *
 *   land value  =  distance-decay from the CBD
 *               +  accessibility to the arterial/maglev network
 *               +  waterfront amenity premium
 *               -  nuisance (industry, power, port, noise)
 *               +  secondary nuclei (multi-nuclei model, Harris & Ullman)
 *
 * Districts then compete for every cell by suitability score, and a majority
 * filter makes the winners contiguous. Because zoning is derived rather than
 * painted, the result is different on every seed yet always plausible —
 * industry lands downwind by the water, slums fill the cheapest land, luxury
 * housing takes the view.
 */

export function planCity(cfg, rng) {
  const S = cfg.world.mapSize;
  const cell = cfg.world.cellSize;
  const R = new Raster(S, cell);
  const n = R.n;
  const Rc = S * 0.44;                       // dense-city radius

  /* ---------------- coastline orientation ---------------- */
  const seaAngle = rng.float(0, Math.PI * 2);
  const seaDir = [Math.cos(seaAngle), Math.sin(seaAngle)];
  const coastBase = Rc * rng.float(0.88, 1.06);
  const coastSeed = rng.int(1, 9999);
  const coastWobble = (t) => fbm2(t * 0.0042, 11.3, 4, 2.03, 0.5, coastSeed) * Rc * 0.20;

  /* ---------------- secondary nuclei ---------------- */
  const nNuclei = rng.int(cfg.planner.subCenters[0], cfg.planner.subCenters[1]);
  const nuclei = [];
  for (let i = 0; i < nNuclei; i++) {
    const a = rng.float(0, Math.PI * 2);
    const r = Rc * rng.float(0.34, 0.86);
    nuclei.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, w: rng.float(0.35, 0.95) });
  }

  /* ---------------- terrain ---------------- */
  const height = new Float32Array(n);
  const water = new Uint8Array(n);
  const seaward = new Float32Array(n);
  const tSeed = rng.int(1, 9999);

  for (let cy = 0; cy < R.rows; cy++) {
    for (let cx = 0; cx < R.cols; cx++) {
      const [x, z] = R.cellToWorld(cx, cy);
      const i = cy * R.cols + cx;
      const r = Math.hypot(x, z) / Rc;

      // seaward signed distance (positive = out to sea)
      const t = x * -seaDir[1] + z * seaDir[0];
      const sw = (x * seaDir[0] + z * seaDir[1]) - (coastBase + coastWobble(t));
      seaward[i] = sw;

      // base ground + hills that only exist outside the built-up area
      const base = 0.8 + fbm2(x * 0.0018, z * 0.0018, 4, 2.03, 0.5, tSeed) * 2.6;
      const rim = smoothstep(0.74, 1.30, r);
      const hills = rim * (12 + ridged2(x * 0.0011, z * 0.0011, 4, tSeed + 77) * 58);
      let h = base + hills * (1 - smoothstep(0.5, 0.92, r));
      // descend below sea level offshore
      h -= smoothstep(-8, 90, sw) * 36;
      height[i] = h;
      water[i] = h < cfg.world.seaLevel ? 1 : 0;
    }
  }

  /* ---------------- land value ---------------- */
  const landValue = new Float32Array(n);
  const nuis = new Float32Array(n);          // nuisance accumulator
  const decay = cfg.planner.landValueDecay;
  const lvSeed = rng.int(1, 9999);

  // port candidate: the stretch of shoreline with the calmest approach
  const portAngle = seaAngle + rng.float(-0.55, 0.55);
  const portDir = [Math.cos(portAngle), Math.sin(portAngle)];
  // prevailing wind — industry wants to be downwind of housing
  const windAngle = rng.float(0, Math.PI * 2);
  const windDir = [Math.cos(windAngle), Math.sin(windAngle)];

  for (let i = 0; i < n; i++) {
    if (water[i]) { landValue[i] = 0; continue; }
    const cx = i % R.cols, cy = (i / R.cols) | 0;
    const [x, z] = R.cellToWorld(cx, cy);
    const dCBD = Math.hypot(x, z) / Rc;

    // classic negative-exponential distance decay
    let lv = Math.exp(-dCBD * (Rc / decay) * 0.55);

    // multi-nuclei accessibility
    for (const nu of nuclei) {
      const d = Math.hypot(x - nu.x, z - nu.z) / Rc;
      lv += nu.w * Math.exp(-d * 4.4) * 0.42;
    }

    // waterfront amenity (not where the port will go)
    const sw = seaward[i];
    const coastProx = Math.exp(-Math.max(sw, 0) / 130) * (sw > -40 ? 1 : 0);
    const portDist = Math.abs(x * -portDir[1] + z * portDir[0]);
    const isPortStretch = Math.exp(-portDist / (Rc * 0.34));
    lv += coastProx * cfg.planner.waterfrontPremium * (1 - isPortStretch * 0.85);

    // organic variation so zone edges are never ruler-straight
    lv += fbm2(x * 0.006, z * 0.006, 3, 2.03, 0.5, lvSeed) * 0.11;

    // nuisance: port, industry, power corridors, elevated roads kill value
    let nz = 0;
    nz += coastProx * isPortStretch * 0.9;
    nz += smoothstep(0.62, 1.2, dCBD) * 0.22;
    nz += Math.max(0, fbm2(x * 0.0035 + 40, z * 0.0035, 3, 2.03, 0.5, lvSeed + 5)) * 0.30;
    nuis[i] = nz;
    lv -= nz * cfg.planner.nuisanceWeight;

    landValue[i] = clamp(lv, 0, 3);
  }

  /* ---------------- district competition ---------------- *
   * Each use submits a suitability curve over accessibility distance — a
   * soft distance band, which is the bid-rent diagram expressed directly:
   * CBD only competes in the tight core, housing takes the middle belt, and
   * the nuisance uses (industry, power, slums, data farms) take the fringe.
   * Multi-nuclei accessibility turns the bands into lobes rather than rings,
   * and the situational modifiers below carve real non-concentric districts
   * out of them (the port follows the water, luxury follows the view, the
   * subnet follows the cheapest land).
   * ------------------------------------------------------ */
  const BAND = {
    cbd:          { c: 0.00, w: 0.15, peak: 1.00 },
    corporate:    { c: 0.17, w: 0.16, peak: 0.94 },
    commercial:   { c: 0.30, w: 0.17, peak: 0.92 },
    nightlife:    { c: 0.38, w: 0.19, peak: 0.88 },
    medical:      { c: 0.34, w: 0.17, peak: 0.82 },
    luxury:       { c: 0.42, w: 0.26, peak: 0.82 },
    residential:  { c: 0.60, w: 0.34, peak: 0.86 },
    research:     { c: 0.72, w: 0.30, peak: 0.79 },
    education:    { c: 0.76, w: 0.30, peak: 0.77 },
    slum:         { c: 0.86, w: 0.34, peak: 0.70 },
    datacenter:   { c: 0.94, w: 0.22, peak: 0.73 },
    industrial:   { c: 0.96, w: 0.30, peak: 0.79 },
    port:         { c: 1.00, w: 0.50, peak: 0.50 },
    energy:       { c: 1.06, w: 0.28, peak: 0.76 },
  };

  const district = new Uint8Array(n);
  const score = new Float32Array(DISTRICT_IDS.length);
  const ndSeed = rng.int(1, 9999);
  /** Uses that cannot survive past the blast wall. */
  const URBAN = new Set(['cbd', 'corporate', 'commercial', 'nightlife', 'luxury',
    'residential', 'medical', 'education', 'research', 'datacenter']);

  for (let i = 0; i < n; i++) {
    const cx = i % R.cols, cy = (i / R.cols) | 0;
    const [x, z] = R.cellToWorld(cx, cy);
    const r = Math.hypot(x, z) / Rc;

    if (water[i]) { district[i] = WATER_CELL; continue; }
    // The edge of a megacity does not stop at a line — it frays into ruins,
    // cleared ground and the quarantine belt, which is where the wall and the
    // watchtowers are actually built. Urban uses lose their bid out here.
    const edgeFade = smoothstep(1.0, 1.30, r);

    const lv = landValue[i];
    const dCBD = clamp(r, 0, 2);
    const sw = seaward[i];
    const coastProx = Math.exp(-Math.max(sw, 0) / 150) * (sw > -60 ? 1 : 0);
    const portDist = Math.abs(x * -portDir[1] + z * portDir[0]);
    const portAlign = Math.exp(-portDist / (Rc * 0.36)) * coastProx;
    const nz = nuis[i];
    const periphery = smoothstep(0.5, 1.15, dCBD);
    const quiet = 1 - nz;
    const downwind = clamp((x * windDir[0] + z * windDir[1]) / Rc * 0.5 + 0.5, 0, 1);
    const inland = 1 - coastProx;

    // Accessibility distance: 0 at the CBD, ~1 at the city edge, and pulled
    // down near every secondary nucleus so the bands become lobes. The band
    // centres below are calibrated against this scale, so it has to stay close
    // to linear in the CBD distance rather than saturating.
    let dist = dCBD;
    for (const nu of nuclei) {
      const dn = Math.hypot(x - nu.x, z - nu.z) / Rc;
      dist = Math.min(dist, dn + (1 - nu.w) * 0.35);
    }
    dist *= (1 - 0.22 * clamp(lv / 1.2, 0, 1));
    dist = clamp(dist, 0, 1.35);

    for (let d = 0; d < DISTRICT_IDS.length; d++) {
      const id = DISTRICT_IDS[d];
      const band = BAND[id] || BAND.residential;
      const t = (dist - band.c) / band.w;
      let s = band.peak * Math.exp(-0.5 * t * t);

      switch (id) {
        case 'luxury': s += coastProx * 0.34 - nz * 0.30; break;
        case 'commercial': s += coastProx * 0.14 - nz * 0.26; break;
        case 'cbd': s += coastProx * 0.08 - nz * 0.30; break;
        case 'corporate': s += coastProx * 0.12 - nz * 0.28; break;
        case 'nightlife': s += nz * 0.26 + periphery * 0.08; break;
        case 'residential': s += coastProx * 0.08 + quiet * 0.12; break;
        case 'research': s += quiet * 0.20 - nz * 0.22; break;
        case 'education': s += quiet * 0.22 - nz * 0.24; break;
        case 'medical': s += quiet * 0.12 - nz * 0.10; break;
        case 'datacenter': s += periphery * 0.18 + quiet * 0.10 + downwind * 0.12; break;
        case 'industrial': s += periphery * 0.16 + nz * 0.18 + downwind * 0.12; break;
        case 'energy': s += periphery * 0.22 + nz * 0.12 + coastProx * 0.10; break;
        case 'slum': s += nz * 0.22 + inland * 0.12 + periphery * 0.10; break;
        case 'port': s += portAlign * 2.30 - (1 - coastProx) * 0.80; break;
        default: break;
      }
      // per-cell noise keeps every border organic
      s += fbm2(x * 0.0075 + d * 3.1, z * 0.0075, 3, 2.03, 0.5, ndSeed + d * 17) * 0.13;
      // beyond the wall only the nuisance uses and shantytowns still bid
      if (edgeFade > 0) {
        if (URBAN.has(id)) s -= edgeFade * 1.35;
        else if (id === 'industrial' || id === 'energy' || id === 'slum') s += edgeFade * 0.55;
      }
      score[d] = s;
    }

    let best = 0, bv = -Infinity;
    for (let d = 0; d < DISTRICT_IDS.length; d++) if (score[d] > bv) { bv = score[d]; best = d; }
    district[i] = best;
  }

  /* ---------------- contiguity: majority filter ---------------- */
  const tmp = new Uint8Array(n);
  const passes = cfg.planner.smoothingPasses;
  for (let p = 0; p < passes; p++) {
    tmp.set(district);
    for (let cy = 1; cy < R.rows - 1; cy++) {
      for (let cx = 1; cx < R.cols - 1; cx++) {
        const i = cy * R.cols + cx;
        if (water[i]) continue;
        const counts = new Map();
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const j = i + oy * R.cols + ox;
            if (water[j]) continue;
            const v = tmp[j];
            counts.set(v, (counts.get(v) || 0) + (ox === 0 && oy === 0 ? 1.6 : 1));
          }
        let bk = tmp[i], bc = -1;
        for (const [k, c] of counts) if (c > bc) { bc = c; bk = k; }
        district[i] = bk;
      }
    }
  }

  /* ---------------- guarantee every district exists ---------------- */
  const cellArea = cell * cell;
  const minCells = Math.ceil(cfg.planner.minDistrictArea / cellArea);
  const present = new Array(DISTRICT_IDS.length).fill(0);
  for (let i = 0; i < n; i++) if (!water[i]) present[district[i]]++;

  const missing = [];
  for (let d = 0; d < DISTRICT_IDS.length; d++) if (present[d] < minCells) missing.push(d);
  // Largest shortfall first, and never let a later blob eat an earlier one —
  // otherwise several under-represented zones all seed in the same attractive
  // patch and only the last one survives.
  missing.sort((a, b) => present[a] - present[b]);
  const guaranteed = new Uint8Array(n);

  for (const d of missing) {
    let bestI = -1, bestScore = -Infinity;
    for (let i = 0; i < n; i += 1) {
      if (water[i] || guaranteed[i]) continue;
      const cx = i % R.cols, cy = (i / R.cols) | 0;
      const [x, z] = R.cellToWorld(cx, cy);
      const lv = landValue[i], r = Math.hypot(x, z) / Rc;
      let s = 0;
      const id = DISTRICT_IDS[d];
      if (id === 'port') s = -Math.abs(seaward[i]) * 0.05;
      else if (id === 'energy') s = r * 2 - lv;
      else if (id === 'slum') s = nuis[i] * 2 - lv;
      else if (id === 'cbd' || id === 'corporate') s = lv * 3 - r;
      else s = -r + lv;
      s += fbm2(x * 0.02, z * 0.02, 2, 2.03, 0.5, d * 31) * 0.1;
      if (s > bestScore) { bestScore = s; bestI = i; }
    }
    if (bestI < 0) continue;
    // Grow a blob from that seed. Neighbours are expanded BEFORE the
    // water/claimed test, so the blob flows around lakes, the shoreline and
    // zones claimed by earlier passes instead of stalling against them — which
    // is how a district used to end up with a handful of cells, or none.
    const target = Math.max(minCells, 260);
    const queue = [bestI];
    let placed = 0;
    const seen = new Set(queue);
    while (queue.length && placed < target) {
      const i = queue.shift();
      const cx = i % R.cols, cy = (i / R.cols) | 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= R.cols || ny >= R.rows) continue;
          const j = ny * R.cols + nx;
          if (seen.has(j)) continue;
          seen.add(j); queue.push(j);
        }
      }
      if (water[i] || guaranteed[i]) continue;
      district[i] = d; guaranteed[i] = 1; placed++;
    }
  }

  /* ---------------- last-resort balance ----------------
   * If a zone still cannot reach the minimum (a tiny map with a lot of water,
   * or a seed where every suitable patch was already claimed), take the cells
   * from whichever zone has the most to spare. The contract is that all
   * sixteen zones exist, so this is enforced rather than hoped for.
   * ---------------------------------------------------- */
  for (let pass = 0; pass < 3; pass++) {
    const counts = new Array(DISTRICT_IDS.length).fill(0);
    for (let i = 0; i < n; i++) if (!water[i] && !guaranteed[i]) counts[district[i]]++;
    for (let d = 0; d < DISTRICT_IDS.length; d++) {
      if (counts[d] >= minCells) continue;
      const need = minCells - counts[d];
      let donor = 0;
      for (let k = 1; k < DISTRICT_IDS.length; k++) if (counts[k] > counts[donor]) donor = k;
      let taken = 0;
      for (let i = 0; i < n && taken < need; i++) {
        if (water[i] || guaranteed[i] || district[i] !== donor) continue;
        district[i] = d; guaranteed[i] = 1; taken++; counts[donor]--;
      }
    }
  }

  /* ---------------- statistics ---------------- */
  const stats = DISTRICT_IDS.map((id) => ({
    id, cells: 0, area: 0, cx: 0, cz: 0, maxLV: 0, blocks: 0, buildings: 0, heightSum: 0,
  }));
  for (let i = 0; i < n; i++) {
    if (water[i]) continue;
    const d = district[i];
    const st = stats[d];
    const cx = i % R.cols, cy = (i / R.cols) | 0;
    const [x, z] = R.cellToWorld(cx, cy);
    st.cells++; st.area += cellArea;
    st.cx += x; st.cz += z;
    if (landValue[i] > st.maxLV) st.maxLV = landValue[i];
  }
  for (const st of stats) {
    if (st.cells > 0) { st.cx /= st.cells; st.cz /= st.cells; }
  }

  /* ---------------- helpers ---------------- */
  const heightAt = (x, z) => {
    const fx = (x - R.origin) / cell - 0.5, fz = (z - R.origin) / cell - 0.5;
    const x0 = Math.floor(fx), z0 = Math.floor(fz);
    const tx = fx - x0, tz = fz - z0;
    const g = (a, b) => height[clamp(b, 0, R.rows - 1) * R.cols + clamp(a, 0, R.cols - 1)];
    const h00 = g(x0, z0), h10 = g(x0 + 1, z0), h01 = g(x0, z0 + 1), h11 = g(x0 + 1, z0 + 1);
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  };
  const lvAt = (x, z) => {
    const [cx, cy] = R.worldToCell(x, z);
    return landValue[clamp(cy, 0, R.rows - 1) * R.cols + clamp(cx, 0, R.cols - 1)];
  };
  const districtAt = (x, z) => {
    const [cx, cy] = R.worldToCell(x, z);
    return district[clamp(cy, 0, R.rows - 1) * R.cols + clamp(cx, 0, R.cols - 1)];
  };

  // where the shoreline actually is, for the port and sea wall
  const coastPath = sampleCoast(R, seaDir, coastBase, coastWobble, height);

  return {
    raster: R, size: S, cell, Rc,
    height, water, landValue, district, seaward, nuis,
    seaDir, portDir, windDir, nuclei, coastBase, coastWobble, coastPath,
    stats, heightAt, lvAt, districtAt,
    isWater: (x, z) => {
      const [cx, cy] = R.worldToCell(x, z);
      if (!R.inside(cx, cy)) return 1;
      return water[cy * R.cols + cx];
    },
  };
}

/** March the seaboard so the port, seawall and ferry piers have a real line. */
function sampleCoast(R, seaDir, coastBase, coastWobble, height) {
  const pts = [];
  const n = 96;
  const lim = R.size * 0.75;
  for (let i = 0; i <= n; i++) {
    const t = lerp(-lim, lim, i / n);
    const d = coastBase + coastWobble(t);
    const x = seaDir[0] * d - seaDir[1] * t;
    const z = seaDir[1] * d + seaDir[0] * t;
    if (Math.abs(x) > R.size * 0.52 || Math.abs(z) > R.size * 0.52) continue;
    pts.push([x, z]);
  }
  return pts;
}
