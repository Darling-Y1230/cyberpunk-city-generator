// tools/make-config-doc.mjs 鈥?generates docs/CONFIG.md from config.json.
//
// config.json is the single source of truth for every tunable in the generator.
// Hand-written reference docs drift within a week, so this one is generated:
// every key that exists is listed, whether or not it has prose attached, and
// the build fails loudly if a documented key disappears.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));

/** Prose for the keys that need explaining. Anything absent is auto-listed. */
const DOC = {
  'meta': 'Identity strings shown in the HUD and the loader.',
  'world.mapSize': 'Square city footprint in metres. `random` picks one of `mapSizeChoices` per generation.',
  'world.seaLevel': 'World Y of the waterline. Terrain below this is sea.',
  'world.maxTerrainHeight': 'Upper bound for the surrounding hills, so the horizon never dwarfs the city.',
  'world.shoreWidth': 'Width of the beach/quay transition band along the coast.',
  'world.cellSize': 'Planning raster resolution. **Every** overlap guarantee in the project is enforced on this grid 鈥?roads, water, building footprints and collision all read it. Raising it makes the city coarser and the guarantees still hold; lowering it costs memory quadratically.',
  'world.lotMargin': 'Total gap between neighbouring building footprints. This is what keeps adjacent fa莽ades from producing coplanar z-fighting.',
  'world.wallHeight': 'Height of the perimeter blast wall. The wall is what stops the map edge from reading as a cut.',
  'world.skyCeiling': 'Highest altitude the fly camera may reach.',

  'planner.subCenters': 'How many secondary nuclei (multi-nuclei model) to seed. Each one becomes an independent peak in the land-value field.',
  'planner.landValueDecay': 'Distance constant of the CBD land-value falloff, in metres. Larger = a broader, flatter downtown.',
  'planner.waterfrontPremium': 'Land-value bonus applied near the shore, minus wherever the port is placed.',
  'planner.transitWeight': 'How much arterial/maglev accessibility feeds back into land value.',
  'planner.nuisanceWeight': 'How hard industry, the port and power generation push land value down.',
  'planner.smoothingPasses': 'Majority-filter passes over the zoning raster. This is what makes district borders contiguous instead of noisy.',
  'planner.minDistrictArea': 'Hard floor, in m虏, for every one of the sixteen zones. The planner grows a blob for any zone below it and reports a failure if it still cannot comply.',
  'planner.coastBias': 'How strongly the coastline is allowed to wander from its base radius.',

  'districts.specs.*.hMin': 'Minimum building height for this zone, metres.',
  'districts.specs.*.hMax': 'Maximum building height, metres.',
  'districts.specs.*.hMode': 'Mode of the log-normal height distribution. Heights are drawn log-normally, which is what gives a skyline a long tail of landmarks instead of a flat top.',
  'districts.specs.*.sigma': 'Sigma of that log-normal. Higher = more height variance within the zone.',
  'districts.specs.*.lotW': 'Frontage width range for lots, metres.',
  'districts.specs.*.lotD': 'Lot depth range, metres.',
  'districts.specs.*.density': 'Probability that a surveyed lot is actually built on.',
  'districts.specs.*.split': 'How eagerly this zone subdivides: higher = larger blocks. Feeds the road generator\'s stop-size rule.',
  'districts.specs.*.neon': 'Multiplier on how many neon emitters the zone\'s buildings register.',
  'districts.specs.*.ads': 'Billboard anchors per building before the density multiplier.',

  'roads.levels[].targetBlock': 'Block size, in metres, at which this tier stops subdividing. Arterials are cut from the largest blocks, alleys from the smallest.',
  'roads.levels[].width': 'Carriageway width range, metres. The number of lanes in the HUD is derived from this, not the other way round.',
  'roads.levels[].jitter': 'How far a cut may wander from the centre of its parent block.',
  'roads.levels[].snapTol': 'Tolerance for snapping a new cut onto an existing collinear street. This is what makes arterials run straight for kilometres instead of stair-stepping.',
  'roads.sidewalkWidth': 'Footway width. Buildings are allowed to front directly onto it.',
  'roads.minLotDepth': 'Smallest buildable depth. A street is never cut if either resulting half would fall below this.',
  'roads.crossingEvery': 'Reserved for crossing frequency tuning.',

  'transit.viaduct.deckY': 'Deck height above ground for the elevated highway.',
  'transit.maglev.beamY': 'Height of the maglev guideway beam.',
  'transit.maglev.speed': 'Train speed, m/s.',
  'transit.skybridge.maxSpan': 'Longest gap a skybridge may span, metres. Only placed between two real structures 鈥?nothing floats.',
  'transit.airLane.minY': 'Floor of the air-taxi corridor band, metres.',
  'transit.airLane.maxY': 'Ceiling of the air-taxi corridor band, metres.',
  'transit.droneLane.minY': 'Floor of the delivery-drone band, metres.',

  'corporations.count': 'How many super-corporations to found. Each gets an HQ, an advertising network, R&D, staff housing and private security.',
  'corporations.territoryRadius': 'Base radius, metres, of a corporation\'s Voronoi territory.',

  'lighting.defaultTime': 'Starting hour of the day, 0鈥?4. The city is authored for the night.',
  'lighting.artificialRatio': 'Target share of illumination that is artificial. The brief asks for 95 %.',
  'lighting.dynamicLightPool': 'How many emitters are uploaded to the shader each frame. The city has tens of thousands; the shader shades this many per pixel. Raising it costs fragment time linearly.',
  'lighting.neonPalette': 'The mandated neon colour ratio (blue 35 / purple 25 / cyan 20 / pink 15 / red 5). Enforced by drawing from a shuffled bag with exactly those proportions, not by independent weighted draws 鈥?independent draws land 10+ points off over a few thousand emitters.',

  'ads.atlasCols': 'Advertising atlas grid. The whole ad network is one texture; every billboard is an instance that picks a tile.',
  'ads.tileW': 'Atlas tile size in pixels. The tiles are painted procedurally at load time 鈥?there are no image files in this project.',
  'ads.holoShare': 'Fraction of signs promoted to volumetric holograms.',

  'npc.count': 'Population. Simulated entirely in the vertex shader from a baked path atlas 鈥?the CPU never touches an individual agent.',
  'npc.countRange': 'Clamp for the population slider.',
  'npc.pathPoints': 'Waypoints per baked path. Must stay 鈮?16: the crowd vertex shader unrolls this loop.',
  'npc.maxPaths': 'How many distinct walks to bake into the path texture.',
  'npc.nearCount': 'Size of the articulated low-poly tier that follows the camera. The rest of the crowd is drawn as SDF billboards.',

  'weather.types.*.fog': 'Fog density. Drives visibility far more than draw distance does.',
  'weather.types.*.rain': 'Precipitation amount, 0鈥?. Scales the live particle count.',
  'weather.types.*.wet': 'Surface wetness. Feeds the planar reflection strength and the puddle mask in the road shader, so weather changes what you see reflected, not just how grey it is.',
  'weather.types.*.sun': 'Attenuation applied to the sun/moon term.',
  'weather.transitionSeconds': 'Blend time between weather states. States cross-fade; they never snap.',

  'render.qualityTiers.*.drawDistance': 'Far plane per quality tier. Fog usually hides the cut long before this matters.',
  'render.qualityTiers.*.npcScale': 'Population multiplier per tier.',
  'render.qualityTiers.*.bloom': 'Whether the bloom pass runs.',
  'render.qualityTiers.*.reflection': 'Whether the planar wet-surface reflection is rendered. It is a second scene pass, so it is the first thing dropped.',
  'render.far': 'Absolute far plane.',
  'render.maxPixelRatio': 'Pixel-ratio ceiling. Dynamic resolution scaling operates below this.',

  'controls.walkSpeed': 'First-person walking speed, m/s.',
  'controls.flySpeed': 'Free-flight speed, m/s.',
  'controls.topdownHeight': 'Initial survey-camera distance, metres.',
};

function docFor(key) {
  if (DOC[key]) return DOC[key];
  const wild = key.replace(/\.\d+\./, '.*.').replace(/\.\w+$/, '.*');
  for (const k of Object.keys(DOC)) {
    if (k.includes('*')) {
      const re = new RegExp('^' + k.replace(/[.]/g, '\\.').replace(/\*/g, '[^.]+') + '$');
      if (re.test(key)) return DOC[k];
    }
  }
  return '';
}

const body = [];
let documented = 0, total = 0;

/** Section anchors discovered while walking, for the table of contents. */
const sections = [];

function walk(node, prefix, depth) {
  if (Array.isArray(node)) {
    if (node.length && typeof node[0] === 'object') return walk(node[0], prefix + '[]', depth);
    return;
  }
  if (node === null || typeof node !== 'object') return;

  const keys = Object.keys(node);
  const leaves = keys.filter((k) => node[k] === null || typeof node[k] !== 'object');
  const branches = keys.filter((k) => node[k] !== null && typeof node[k] === 'object');

  if (leaves.length) {
    const title = prefix || '(root)';
    sections.push({ level: Math.min(depth + 2, 6), title });
    body.push(`${'#'.repeat(Math.min(depth + 2, 6))} \`${title}\``);
    body.push('');
    body.push('| key | value | meaning |');
    body.push('|---|---|---|');
    for (const k of leaves) {
      const full = prefix ? `${prefix}.${k}` : k;
      total++;
      const d = docFor(full);
      if (d) documented++;
      const v = node[k];
      const shown = typeof v === 'string' ? `"${v}"` : String(v);
      body.push(`| \`${k}\` | \`${shown}\` | ${d} |`);
    }
    body.push('');
  }

  for (const k of branches) {
    const full = prefix ? `${prefix}.${k}` : k;
    // only recurse when there is something to say below
    const hasLeaf = JSON.stringify(node[k]).match(/[:]/);
    if (!hasLeaf) continue;
    walk(node[k], full, depth + 1);
  }
}

walk(cfg, '', 0);

// The walk only emits sections for nodes that own leaf keys, so a pure
// container (`districts.specs`) produces a level jump. Clamp the increments so
// the contents list still nests cleanly.
let lastLevel = 1;
const tocLines = sections.map((s) => {
  const lvl = Math.min(s.level, lastLevel + 1);
  lastLevel = lvl;
  return `${'  '.repeat(Math.max(0, lvl - 2))}- \`${s.title}\``;
});

const header = [
  '# config.json reference',
  '',
  '> **Generated file.** Produced by `tools/make-config-doc.mjs` from `config.json`.',
  '> Edit the JSON, then run `npm run assets`. Do not edit this page by hand.',
  '',
  '`config.json` is the single source of truth for every tunable in the generator.',
  'Nothing in `src/` hard-codes a number that belongs here.',
  '',
  'Every key present in `config.json` is listed below, whether or not it has prose —',
  'so an undocumented knob is still a visible knob.',
  '',
  '## Contents',
  '',
  ...tocLines,
  '',
  '---',
  '',
];

fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
const out = path.join(ROOT, 'docs', 'CONFIG.md');
fs.writeFileSync(out, header.concat(body).join('\n'));

const pct = total ? Math.round(documented / total * 100) : 0;
console.log(`make-config-doc: ${total} keys in ${sections.length} sections, `
  + `${documented} with prose (${pct}%) -> docs/CONFIG.md`);
