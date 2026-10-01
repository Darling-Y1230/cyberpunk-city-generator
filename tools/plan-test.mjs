// tools/plan-test.mjs — runs Agent 1 headlessly and reports the zoning result.
// planCity is pure computation (no DOM), so the whole zoning model can be
// exercised and debugged without a browser.
import fs from 'node:fs';
import CONFIG from '../src/config.generated.js';
import { RNG } from '../src/core/rng.js';
import { planCity } from '../src/gen/planner.js';
import { HORIZONTAL_IDS } from '../src/gen/districts.js';

const cfg = JSON.parse(JSON.stringify(CONFIG));
const seeds = process.argv.slice(2).filter((a) => !a.startsWith('--'));

for (const seed of (seeds.length ? seeds : ['a', 'b', 'c', 'd', 'e'])) {
  for (const size of [512, 1024, 2048]) {
    cfg.world.mapSize = size;
    const t0 = Date.now();
    const plan = planCity(cfg, new RNG(seed, 'city').derive('planner'));
    const cellArea = plan.cell * plan.cell;
    const areas = HORIZONTAL_IDS.map((id, i) => {
      let c = 0;
      for (let k = 0; k < plan.raster.n; k++) if (!plan.water[k] && plan.district[k] === i) c++;
      return [id, Math.round(c * cellArea)];
    });
    const missing = areas.filter(([, a]) => a < cfg.planner.minDistrictArea).map(([id, a]) => `${id}=${a}`);
    const total = areas.reduce((s, [, a]) => s + a, 0);
    console.log(`${seed} @${size}: ${(Date.now() - t0)}ms  total=${total}`
      + (missing.length ? `  SHORT: ${missing.join(' ')}` : '  all >=900')
      + `  |  ${areas.map(([id, a]) => id + ':' + (a / 1000).toFixed(1) + 'k').join(' ')}`);
  }
}
