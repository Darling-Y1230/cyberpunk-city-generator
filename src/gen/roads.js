import { Raster, clamp } from '../core/grid.js';
import { smoothstep, lerp } from '../core/rng.js';
import { HORIZONTAL_IDS } from './districts.js';

/**
 * AGENT 2 — The three-tier street network.
 *
 * A real city's plan is a *subdivision history*: the biggest blocks were cut
 * first by the boulevards, then those were cut by collectors, and the leftover
 * fabric was cut again into alleys. We reproduce exactly that by recursively
 * splitting the land, classifying each cut by how big the block still was when
 * it was made, and snapping new cuts onto existing collinear ones so arterials
 * end up genuinely straight and running the length of the city.
 *
 * Because every cut spans its parent block in full, every street endpoint lands
 * on another street. Dead ends and orphaned fragments are therefore impossible
 * by construction, not by clean-up.
 */

export const ROAD_NONE = 0;
export const ROAD_L1 = 1;
export const ROAD_L2 = 2;
export const ROAD_L3 = 3;
export const SIDEWALK = 4;
export const CROSSING = 5;

export function generateRoads(cfg, rng, plan) {
  const S = cfg.world.mapSize;
  const cell = cfg.world.cellSize;
  const raster = new Raster(S, cell);
  const Rc = plan.Rc;
  const levels = cfg.roads.levels;

  const districtSpec = (x, z) => {
    const d = plan.districtAt(x, z);
    return cfg.districts.specs[HORIZONTAL_IDS[d]] || cfg.districts.specs.residential;
  };

  /* ---------------------------------------------------------------- *
   * 1. Recursive subdivision
   * ---------------------------------------------------------------- */
  const sizeFor = (level, x, z) => {
    const spec = districtSpec(x, z);
    return levels[level - 1].targetBlock * (0.55 + spec.split * 1.3);
  };

  const xLines = [];   // { coord, level, span:[a,b] }
  const zLines = [];
  const snapX = new Map();   // level -> sorted coords
  const snapZ = new Map();

  const trySnap = (map, coord, tol) => {
    for (const [, list] of map) {
      for (const c of list) if (Math.abs(c - coord) < tol) return c;
    }
    return coord;
  };
  const recordLine = (map, level, coord) => {
    if (!map.has(level)) map.set(level, []);
    map.get(level).push(coord);
  };

  // the plot starts as one block covering the whole buildable disc
  const half = Rc * 1.02;
  const blocks = [];

  // Max-heap on block area: always cut the biggest block first so the first
  // cuts are the city's grand boulevards and the last ones are alley walls.
  const heap = [];
  const hPush = (b) => {
    heap.push(b);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].area >= heap[i].area) break;
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
  };
  const hPop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].area > heap[m].area) m = l;
        if (r < heap.length && heap[r].area > heap[m].area) m = r;
        if (m === i) break;
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
      }
    }
    return top;
  };

  hPush({ x0: -half, z0: -half, x1: half, z1: half, depth: 0, area: (half * 2) * (half * 2) });
  const maxBlocks = cfg.world.mapSize >= 2048 ? 7000 : cfg.world.mapSize >= 1024 ? 2800 : 1000;

  while (heap.length && blocks.length + heap.length < maxBlocks) {
    const b = hPop();
    const w = b.x1 - b.x0, h = b.z1 - b.z0;
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;

    // which tier of street is this cut?
    let level = 0;
    for (let L = 1; L <= 3; L++) {
      if (Math.max(w, h) > sizeFor(L, cx, cz)) { level = L; break; }
    }
    if (level === 0 || w < cfg.roads.minLotDepth * 2.6 || h < cfg.roads.minLotDepth * 2.6) {
      blocks.push(b);
      continue;
    }
    // A service alley needs a block worth serving; below that the parcel is
    // left whole for the lot placer.
    if (level === 3 && (w < 22 || h < 22)) { blocks.push(b); continue; }

    const spec = levels[level - 1];
    const splitX = w > h ? true : h > w ? false : rng.bool();
    const span = splitX ? w : h;
    const width = rng.float(spec.width[0], spec.width[1]);

    const tol = spec.snapTol * span;
    let t = 0.5 + rng.float(-spec.jitter, spec.jitter);
    t = clamp(t, 0.22, 0.78);
    let coord = splitX ? lerp(b.x0, b.x1, t) : lerp(b.z0, b.z1, t);

    // snap onto an existing street of the same tier -> long straight runs
    const snapMap = splitX ? snapX : snapZ;
    coord = trySnap(snapMap, coord, tol);

    const minLot = cfg.roads.minLotDepth * 2.2;

    if (level < 3) {
      /* ---- boulevards and collectors: a real street across the block ----
       * The children are LAND, not half the parent: the carriageway is carved
       * out of the block at the moment it is created. Without this every plot
       * loses half the arterial's width to its own edge and the buildable core
       * vanishes.                                                          */
      const hw = width / 2;
      coord = clamp(coord,
        (splitX ? b.x0 : b.z0) + cfg.roads.minLotDepth + hw,
        (splitX ? b.x1 : b.z1) - cfg.roads.minLotDepth - hw);
      const c0 = coord - hw, c1 = coord + hw;
      if (splitX) {
        if (c0 - b.x0 < minLot || b.x1 - c1 < minLot) { blocks.push(b); continue; }
      } else if (c0 - b.z0 < minLot || b.z1 - c1 < minLot) { blocks.push(b); continue; }

      recordLine(snapMap, level, coord);
      const line = splitX
        ? { x0: coord, z0: b.z0, x1: coord, z1: b.z1, level, width, axis: 'x' }
        : { x0: b.x0, z0: coord, x1: b.x1, z1: coord, level, width, axis: 'z' };
      (splitX ? xLines : zLines).push(line);

      const mkChild = (x0, z0, x1, z1) => ({
        x0, z0, x1, z1, depth: b.depth + 1, area: (x1 - x0) * (z1 - z0),
      });
      if (splitX) {
        hPush(mkChild(b.x0, b.z0, c0, b.z1));
        hPush(mkChild(c1, b.z0, b.x1, b.z1));
      } else {
        hPush(mkChild(b.x0, b.z0, b.x1, c0));
        hPush(mkChild(b.x0, c1, b.x1, b.z1));
      }
      continue;
    }

    /* ---- service alleys ------------------------------------------------
     * Real alley networks are not a second full grid. Each surviving block
     * gets ONE service cut that usually stops short, which keeps the alley
     * share of the map around a tenth instead of a third, and leaves the
     * leftover fabric as courtyards and back lots.
     * ------------------------------------------------------------------ */
    const a0 = 0, a1 = rng.float(0.6, 1.0);
    coord = clamp(coord,
      (splitX ? b.x0 : b.z0) + 5, (splitX ? b.x1 : b.z1) - 5);
    const P0 = splitX ? b.z0 : b.x0;
    const P1 = splitX ? b.z1 : b.x1;
    // the alley always breaks out of the block at its head, so it can never
    // become an orphaned fragment; the tail may stop short (a cul-de-sac) or
    // run right through.
    const E0 = P0 - 8;
    const E1 = a1 >= 0.97 ? P1 + 8 : lerp(P0, P1, a1);
    (splitX ? xLines : zLines).push({
      x0: splitX ? coord : E0, z0: splitX ? E0 : coord,
      x1: splitX ? coord : E1, z1: splitX ? E1 : coord,
      level, width, axis: splitX ? 'x' : 'z',
    });
    // the block survives as one parcel: the alley is a gap the lot placer
    // simply refuses to build across
    blocks.push(b);
  }
  for (const b of heap) blocks.push(b);

  /* ---------------------------------------------------------------- *
   * 2. Diagonal boulevards through the core
   * ---------------------------------------------------------------- */
  const boulevards = [];
  const nDiag = rng.int(cfg.roads.diagonalBoulevards[0], cfg.roads.diagonalBoulevards[1]);
  for (let i = 0; i < nDiag; i++) {
    const a = rng.float(0, Math.PI * 2);
    const off = rng.float(-0.28, 0.28) * Rc;
    const dx = Math.cos(a), dz = Math.sin(a);
    const px = -dz * off, pz = dx * off;
    const len = Rc * 2.4;
    const grade = rng.bool(0.4);
    const pts = [];
    const steps = 14;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const along = (t - 0.5) * len;
      // gentle S-curve so the boulevard reads as an engineered alignment
      const wob = Math.sin(t * Math.PI * (grade ? 2 : 1)) * off * rng.float(0.05, 0.18);
      pts.push([
        px + dx * along - dz * wob,
        pz + dz * along + dx * wob,
      ]);
    }
    boulevards.push({ pts, level: ROAD_L1, width: rng.float(52, 74), name: 'Boulevard ' + (i + 1) });
  }

  /* ---------------------------------------------------------------- *
   * 3. Collector links between district nuclei (organic curvature)
   * ---------------------------------------------------------------- */
  const nodes = [];
  for (const id of HORIZONTAL_IDS) {
    const idx = HORIZONTAL_IDS.indexOf(id);
    const st = plan.stats[idx];
    if (st.cells > 0) nodes.push({ x: st.cx, z: st.cz, id });
  }
  // add secondary nuclei + the port
  for (const nu of plan.nuclei) nodes.push({ x: nu.x, z: nu.z, id: 'nucleus' });

  const links = [];
  for (let i = 0; i < nodes.length; i++) {
    const dists = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      dists.push([j, Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z)]);
    }
    dists.sort((a, b) => a[1] - b[1]);
    // relative-neighbourhood-ish: link to a few near peers
    for (let k = 0; k < Math.min(3, dists.length); k++) {
      const j = dists[k][0];
      const key = i < j ? i + '_' + j : j + '_' + i;
      if (links.some((l) => l.key === key)) continue;
      links.push({ key, a: i, b: j });
    }
  }

  const collectors = [];
  for (const l of links) {
    const A = nodes[l.a], B = nodes[l.b];
    const d = Math.hypot(A.x - B.x, A.z - B.z);
    if (d < 40) continue;
    const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2;
    const nx = -(B.z - A.z) / d, nz = (B.x - A.x) / d;
    const bow = rng.float(-0.16, 0.16) * d;
    const steps = Math.max(4, Math.round(d / 40));
    const pts = [];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const k = Math.sin(t * Math.PI) * bow;
      // snap ends onto the grid so links terminate at a real intersection
      pts.push([
        lerp(A.x, B.x, t) + nx * k,
        lerp(A.z, B.z, t) + nz * k,
      ]);
    }
    pts[0] = [Math.round(A.x / 20) * 20, Math.round(A.z / 20) * 20];
    pts[pts.length - 1] = [Math.round(B.x / 20) * 20, Math.round(B.z / 20) * 20];
    collectors.push({ pts, level: ROAD_L2, width: rng.float(20, 30) });
  }

  /* ---------------------------------------------------------------- *
   * 4. Rasterise everything
   * ---------------------------------------------------------------- */
  const segments = [];
  const stamp = (x0, z0, x1, z1, w, v) => {
    raster.stroke(x0, z0, x1, z1, w / 2, v, false);
    segments.push({ x0, z0, x1, z1, w, v });
  };

  // grid streets (thickest first so arterials win where they cross)
  const allLines = [...xLines, ...zLines].sort((a, b) => a.level - b.level);
  for (const l of allLines) {
    // extra width for a few "signature" arterials so the hierarchy reads
    const w = l.level === 1 && rng.bool(0.22) ? l.width * 1.35 : l.width;
    stamp(l.x0, l.z0, l.x1, l.z1, w, l.level);
  }
  for (const b of boulevards) {
    for (let i = 0; i < b.pts.length - 1; i++) {
      stamp(b.pts[i][0], b.pts[i][1], b.pts[i + 1][0], b.pts[i + 1][1], b.width, ROAD_L1);
    }
  }
  for (const c of collectors) {
    for (let i = 0; i < c.pts.length - 1; i++) {
      stamp(c.pts[i][0], c.pts[i][1], c.pts[i + 1][0], c.pts[i + 1][1], c.width, ROAD_L2);
    }
  }

  /* ---------------------------------------------------------------- *
   * 5. Sidewalks, crossings, and a walkable graph for the crowd
   * ---------------------------------------------------------------- */
  const walk = new Raster(S, cell);
  for (let i = 0; i < raster.n; i++) {
    if (raster.data[i] !== ROAD_NONE) walk.data[i] = 1;
  }
  const sw = cfg.roads.sidewalkWidth;
  const sidePx = Math.max(1, Math.round(sw / cell));
  const out = new Uint8Array(walk.n);
  for (let cy = 0; cy < walk.rows; cy++) {
    for (let cx = 0; cx < walk.cols; cx++) {
      const i = cy * walk.cols + cx;
      if (walk.data[i]) continue;
      let near = false;
      for (let oy = -sidePx; oy <= sidePx && !near; oy++)
        for (let ox = -sidePx; ox <= sidePx; ox++) {
          const nx = cx + ox, ny = cy + oy;
          if (nx < 0 || ny < 0 || nx >= walk.cols || ny >= walk.rows) continue;
          if (walk.data[ny * walk.cols + nx]) { near = true; break; }
        }
      if (near) out[i] = 1;
    }
  }
  for (let i = 0; i < raster.n; i++) if (out[i]) raster.data[i] = SIDEWALK;

  // zebra crossings at the junctions of the arterial grid. The count is capped
  // and each mark is sized to the narrower of the two streets: an unbounded
  // intersection patch would repaint most of the city as tarmac.
  //
  // Tolerance matters here. A street is carved out of its parent block, so a
  // cross-street ends at the EDGE of the carriageway it runs into, not at its
  // centreline — the tarmac is perfectly joined but the centre-lines miss each
  // other by half a road width. Testing strict containment silently found zero
  // junctions, which also cost us every traffic signal and subway entrance.
  const crossings = [];
  const bigLines = allLines.filter((l) => l.level <= 2);
  const maxCrossings = cfg.world.mapSize >= 2048 ? 520 : cfg.world.mapSize >= 1024 ? 300 : 150;
  outer:
  for (let i = 0; i < bigLines.length; i++) {
    for (let j = i + 1; j < bigLines.length; j++) {
      const a = bigLines[i], b = bigLines[j];
      if (a.axis === b.axis) continue;
      const X = a.axis === 'x' ? a : b;
      const Z = a.axis === 'z' ? a : b;
      const slack = Math.max(a.width, b.width) * 0.62;
      if (Z.x0 - slack <= X.x0 && X.x0 <= Z.x1 + slack
        && X.z0 - slack <= Z.z0 && Z.z0 <= X.z1 + slack) {
        crossings.push([X.x0, Z.z0, Math.min(a.width, b.width)]);
        if (crossings.length >= maxCrossings) break outer;
      }
    }
  }
  for (const [x, z, w] of crossings) {
    raster.rect(x - w * 0.22, z - w * 0.22, x + w * 0.22, z + w * 0.22, CROSSING);
  }

  /* ---------------------------------------------------------------- *
   * 6. Connectivity audit (used by Agent 9 as well)
   * ---------------------------------------------------------------- */
  const isRoad = (v) => v >= ROAD_L1 && v <= CROSSING;
  /** Carriageway only: sidewalks and crossing paint are not obstacles. */
  const isCarriageway = (v) => (v >= ROAD_L1 && v <= ROAD_L3) || v === CROSSING;
  // connectivity is a property of the running lanes, not of the footways
  const { comps } = raster.components(isCarriageway);

  const classifyBlock = (b) => {
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    b.district = plan.districtAt(cx, cz);
    b.area = (b.x1 - b.x0) * (b.z1 - b.z0);
    b.center = [cx, cz];
  };
  for (const b of blocks) classifyBlock(b);
  blocks.sort((a, b) => b.area - a.area);

  const roadCells = raster.countIn(-S / 2, -S / 2, S / 2, S / 2, isCarriageway);
  const sidewalkCells = raster.countIn(-S / 2, -S / 2, S / 2, S / 2, (v) => v === SIDEWALK);

  return {
    raster, segments, blocks, boulevards, collectors, crossings,
    components: comps,
    roadCells, sidewalkCells,
    xLines, zLines,
    isRoad, isCarriageway,
  };
}
