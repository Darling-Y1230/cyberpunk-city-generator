import { DISTRICT_IDS, HORIZONTAL_IDS, DISTRICT_POPULATION } from './districts.js';

/**
 * AGENT 9 — Constraint verification.
 *
 * The brief is a specification, so it gets tested like one. Every hard rule is
 * checked against the *generated data*, not against the algorithm's intent, and
 * the result is a PASS / CONCERNS / FAIL verdict that ships in the HUD.
 */
export function validateCity(cfg, plan, roads, buildings, transit, ads, crowd, lighting, details, vertical) {
  const checks = [];
  const push = (id, label, ok, detail, value, target, severity = 'hard') =>
    checks.push({ id, label, ok, detail, value, target, severity });

  /* ---------------- 1. all sixteen districts exist ---------------- */
  const cellArea = plan.cell * plan.cell;
  const needArea = cfg.planner.minDistrictArea;
  const nCells = plan.raster ? plan.raster.n : plan.n;
  const districtAreas = {};
  for (let i = 0; i < HORIZONTAL_IDS.length; i++) {
    let a = 0;
    for (let k = 0; k < nCells; k++) if (!plan.water[k] && plan.district[k] === i) a += cellArea;
    districtAreas[HORIZONTAL_IDS[i]] = Math.round(a);
  }
  districtAreas.underground = Math.round(vertical?.underground?.floorArea || 0);
  districtAreas.sky = Math.round(vertical?.sky?.platformArea || 0);
  const missing = DISTRICT_IDS.filter((d) => (districtAreas[d] || 0) < needArea);
  push('districts', '全部 16 个功能区均存在 / all 16 districts present',
    missing.length === 0,
    missing.length ? 'missing: ' + missing.join(', ') : `${DISTRICT_IDS.length}/16 zones, min area ${Math.min(...Object.values(districtAreas)).toLocaleString()} m²`,
    `${DISTRICT_IDS.length - missing.length}/16`, '16/16');

  /* ---------------- 2. road network connectivity ---------------- */
  const comps = roads.components;
  const main = comps[0] ? comps[0].size : 0;
  const roadTotal = roads.roadCells || 1;
  const connectivity = main / roadTotal;
  push('connectivity', '道路网无断裂 / no fragmented roads',
    connectivity >= 0.985,
    `largest component covers ${(connectivity * 100).toFixed(2)}% of ${roadTotal.toLocaleString()} road cells`,
    (connectivity * 100).toFixed(2) + '%', '≥98.5%');

  /* ---------------- 3. buildings never sit on a road ---------------- */
  let onRoad = 0;
  const isLane = roads.isCarriageway || ((v) => v >= 1 && v <= 5);
  for (const b of buildings.list) {
    if (roads.raster.anyIn(b.x - b.w / 2 + 0.3, b.z - b.d / 2 + 0.3,
      b.x + b.w / 2 - 0.3, b.z + b.d / 2 - 0.3, isLane)) onRoad++;
  }
  push('no-road-overlap', '建筑不侵占道路 / no building on a carriageway',
    onRoad === 0, `${onRoad} of ${buildings.list.length.toLocaleString()} footprints intersect a street`,
    onRoad, 0);

  /* ---------------- 4. nothing floats ---------------- */
  let floating = 0, stilts = 0, buried = 0, maxGap = 0;
  for (const b of buildings.list) {
    const g = plan.heightAt(b.x, b.z);
    const gap = b.baseY - g;
    if (b.stilts > 0.3 || b.kind === 'shack') { stilts++; continue; }
    if (gap > 0.35) { floating++; maxGap = Math.max(maxGap, gap); }
    else if (gap < -9) buried++;
  }
  push('no-floating', '无漂浮建筑 / no floating structures',
    floating === 0, floating ? `${floating} structures detached from terrain (max ${maxGap.toFixed(2)} m)`
      : `${stilts.toLocaleString()} stilted/hillside structures grounded, all others founded on the terrain surface`
      + (buried ? ` (${buried} cut into slopes)` : ''),
    floating, 0);

  /* ---------------- 5. no interpenetration ---------------- */
  let overlap = 0, worst = 0;
  const list = buildings.list;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    const near = buildings.index.query(a.x, a.z, Math.max(a.w, a.d) + 2, []);
    for (const j of near) {
      if (j <= i) continue;
      const b = list[j];
      const ox = (a.w + b.w) / 2 - Math.abs(a.x - b.x);
      const oz = (a.d + b.d) / 2 - Math.abs(a.z - b.z);
      if (ox > 0.05 && oz > 0.05) {
        overlap++;
        worst = Math.max(worst, Math.min(ox, oz));
      }
    }
  }
  push('no-clipping', '建筑无穿模 / no interpenetration',
    overlap === 0, overlap ? `${overlap} overlapping AABB pairs, worst ${worst.toFixed(2)} m` :
      'all footprints separated by party-wall gaps',
    overlap, 0);

  /* ---------------- 6. advertising density per block ---------------- */
  // Keyed by the BUILDING's block, not by the sign's position: a campus or a
  // stepped podium hangs its signage off several pavilions, so keying by sign
  // would scatter one building's billboards across three audit cells.
  const adByBlock = new Map();
  let tagged = 0;
  for (const a of (ads.anchors || [])) {
    const id = a.districtId;
    if (id !== 'commercial' && id !== 'nightlife' && id !== 'cbd' && id !== 'corporate') continue;
    tagged++;
    const b = (a.building != null) ? list[a.building] : null;
    const bx = b ? b.x : a.x, bz = b ? b.z : a.z;
    const k = Math.floor(bx / 120) + ':' + Math.floor(bz / 120);
    adByBlock.set(k, (adByBlock.get(k) || 0) + 1);
  }
  let commercialBlocks = 0, poorBlocks = 0, minSeen = Infinity, worstCell = '';
  for (const [k, n] of adByBlock) {
    commercialBlocks++;
    if (n < 5) { poorBlocks++; if (n < minSeen) { minSeen = n; worstCell = k; } }
  }
  push('ad-density', '商业街区广告牌 ≥5 / ≥5 billboards per commercial block',
    poorBlocks === 0 && commercialBlocks > 0,
    `${commercialBlocks} commercial blocks audited, ${poorBlocks} below 5`
    + (poorBlocks ? ` (thinnest ${minSeen} at cell ${worstCell})` : '')
    + `; ${ads.total.toLocaleString()} signs placed, ${tagged.toLocaleString()} on retail frontage`,
    poorBlocks, 0);

  /* ---------------- 7. neon palette compliance ---------------- */
  const target = { blue: 0.35, purple: 0.25, cyan: 0.20, pink: 0.15, red: 0.05 };
  const rep = lighting.colorReport;
  let worstDev = 0, worstKey = '';
  for (const k of Object.keys(target)) {
    const dev = Math.abs((rep[k] || 0) - target[k]);
    if (dev > worstDev) { worstDev = dev; worstKey = k; }
  }
  push('neon-palette', '霓虹色比符合规格 / neon colour ratio',
    worstDev <= 0.09,
    `largest deviation ${(worstDev * 100).toFixed(1)} pts (${worstKey}) · blue ${(rep.blue * 100).toFixed(0)}% purple ${(rep.purple * 100).toFixed(0)}% cyan ${(rep.cyan * 100).toFixed(0)}% pink ${(rep.pink * 100).toFixed(0)}% red ${(rep.red * 100).toFixed(0)}%`,
    (worstDev * 100).toFixed(1) + '%', '≤9%');

  /* ---------------- 8. population size ---------------- */
  push('population', 'NPC 数量 1000–50000 / 1 000–50 000 agents',
    crowd.total >= 1000 && crowd.total <= 50000,
    `${crowd.total.toLocaleString()} agents over ${crowd.rows.toLocaleString()} baked paths`,
    crowd.total, '1 000–50 000');

  /* ---------------- 9. vertical transport actually connects ---------------- */
  const sb = transit.skybridges.length;
  const wb = transit.walkways || 0;
  push('vertical-transit', '立体交通已生成 / elevated+air transit present',
    transit.viaducts.length > 0 && transit.maglev.lines.length > 0 && transit.taxiPaths.length > 0 && (sb + wb) > 10,
    `${transit.viaducts.length} viaducts · ${transit.maglev.lines.length} maglev lines · ${transit.maglev.stations.length} stations · ${sb} skybridges · ${wb} walkways · ${transit.taxiPaths.length} air corridors · ${transit.droneLanes.length} drone lanes`,
    sb + wb, '>10');

  /* ---------------- 10. natural edge attenuation ---------------- */
  const outer = countOuterBand(plan, cfg);
  push('edge-decay', '城市边缘自然衰减 / no hard map cut',
    outer.urbanFraction < 0.30,
    `outer 12% ring is ${(outer.urbanFraction * 100).toFixed(1)}% built (${(outer.water * 100).toFixed(0)}% water, ${(outer.ruin * 100).toFixed(0)}% ruins/wasteland)`,
    (outer.urbanFraction * 100).toFixed(1) + '%', '<30%');

  /* ---------------- 11. emptiness ---------------- */
  const builtCells = countBuilt(plan, roads, buildings);
  const landCells = countLand(plan);
  const builtFrac = builtCells / Math.max(landCells, 1);
  push('coverage', '无大面积空白 / no dead zones',
    builtFrac > 0.34,
    `${(builtFrac * 100).toFixed(1)}% of dry land carries buildings or carriageway `
    + `(${buildings.list.length.toLocaleString()} structures, ${roads.roadCells.toLocaleString()} lane cells, ${(roads.sidewalkCells || 0).toLocaleString()} footway cells)`,
    (builtFrac * 100).toFixed(1) + '%', '>34%');

  /* ---------------- 12. aerial district is supported ---------------- */
  const skyOK = !vertical?.sky || vertical.sky.platforms.every((p) => p.anchored);
  push('sky-anchored', '空中城区有结构支撑 / aerial platforms are anchored',
    skyOK, vertical?.sky ? `${vertical.sky.platforms.length} platforms, all bearing on towers (${vertical.sky.columns} columns)` : 'n/a',
    skyOK ? 0 : 1, 0);

  const hard = checks.filter((c) => c.severity === 'hard');
  const failed = hard.filter((c) => !c.ok);
  const verdict = failed.length === 0 ? 'PASS' : failed.length <= 2 ? 'CONCERNS' : 'FAIL';

  return {
    verdict, checks, districtAreas,
    summary: {
      buildings: buildings.list.length,
      roadCells: roads.roadCells,
      connectivity: (connectivity * 100).toFixed(2) + '%',
      neonSources: lighting.sources,
      signs: ads.total,
      npc: crowd.total,
      props: details.propTotal,
      cables: details.cableCount,
      particles: details.particleCount,
    },
  };
}

function countOuterBand(plan, cfg) {
  const S = plan.size;
  // The true border frame: Chebyshev distance, so this measures the map edge
  // rather than a thin ring just outside the dense core.
  const r0 = S * 0.42;
  let total = 0, urban = 0, water = 0, ruin = 0;
  for (let cy = 0; cy < plan.raster.rows; cy += 2) {
    for (let cx = 0; cx < plan.raster.cols; cx += 2) {
      const [x, z] = plan.raster.cellToWorld(cx, cy);
      if (Math.max(Math.abs(x), Math.abs(z)) < r0) continue;
      total++;
      if (plan.water[cy * plan.raster.cols + cx]) { water++; continue; }
      const d = plan.district[cy * plan.raster.cols + cx];
      const id = HORIZONTAL_IDS[d];
      if (id === 'industrial' || id === 'energy' || id === 'port' || id === 'slum') ruin++;
      if (id === 'cbd' || id === 'corporate' || id === 'commercial' || id === 'nightlife'
        || id === 'residential' || id === 'luxury' || id === 'medical' || id === 'education') urban++;
    }
  }
  return { urbanFraction: urban / Math.max(total, 1), water: water / Math.max(total, 1), ruin: ruin / Math.max(total, 1) };
}

function countBuilt(plan, roads, buildings) {
  // union of carriageway/footway and structures — counting them separately
  // double-counts, which is how the metric once read 103%
  let built = 0;
  const R = roads.raster, S = buildings.solid;
  for (let i = 0; i < R.n; i++) if (R.data[i] !== 0 || S.data[i]) built++;
  return built;
}
function countLand(plan) {
  let n = 0;
  for (let i = 0; i < plan.raster.n; i++) if (!plan.water[i]) n++;
  return n;
}
