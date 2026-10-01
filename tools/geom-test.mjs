// tools/geom-test.mjs — builds every procedural mesh in Node and reports any
// non-finite vertex. Catches NaN geometry at the source instead of through a
// screenshot, and runs in a second.
import * as THREE from 'three';
import { RNG } from '../src/core/rng.js';
import { MeshBuilder } from '../models/primitives.js';
import { PROP_KINDS, propGeometry } from '../models/props.js';
import { airTaxiGeometry, droneGeometry, carGeometry, maglevCarGeometry, shipGeometry, blimpGeometry } from '../models/vehicles.js';
import { BUILDERS, STYLE } from '../models/buildings.js';

const rng = new RNG('geom-test', 'test');
MeshBuilder.DEBUG = true;

function check(label, geo) {
  const p = geo.getAttribute('position');
  if (!p) return console.log(`  ${label}: no position`);
  let bad = 0, first = -1, vals = [];
  for (let i = 0; i < p.array.length; i++) {
    if (!Number.isFinite(p.array[i])) {
      if (first < 0) { first = i; vals = Array.from(p.array.slice(Math.max(0, i - 6), i + 6)); }
      bad++;
    }
  }
  const n = geo.getAttribute('normal');
  let nbad = 0;
  if (n) for (let i = 0; i < n.array.length; i++) if (!Number.isFinite(n.array[i])) nbad++;
  if (bad || nbad) console.log(`  !! ${label}: pos ${bad}/${p.array.length}, normal ${nbad}  first@${first} ${JSON.stringify(vals)}`);
  return bad + nbad;
}

let total = 0;
console.log('props:');
for (const k of PROP_KINDS) total += check(k, propGeometry(k, rng.derive(k)));

console.log('vehicles:');
for (const [n, f] of [['airTaxi', airTaxiGeometry], ['drone', droneGeometry],
  ['car', carGeometry], ['maglev', maglevCarGeometry], ['ship', shipGeometry], ['blimp', blimpGeometry]]) {
  total += check(n, f(rng.derive(n)));
}
total += check('bus', carGeometry(rng.derive('bus'), 'bus'));

console.log('buildings:');
for (const [name, fn] of Object.entries(BUILDERS)) {
  let bad = 0;
  for (let i = 0; i < 40; i++) {
    const mb = new MeshBuilder();
    const w = rng.float(6, 60), d = rng.float(6, 60), h = rng.float(4, 400);
    const res = fn(mb, rng, {
      x: 0, z: 0, groundY: 0, width: w, depth: d, height: h,
      seed: rng.next(), hue: rng.next(), litRatio: 0.5, dirt: 0.5, rotY: 0,
      podium: rng.bool(), spire: rng.bool(), style: STYLE.CURTAIN,
      stilts: rng.bool(0.3) ? rng.float(0, 4) : 0, pavilions: rng.int(2, 5),
    });
    if (!res) { console.log(`  ${name}#${i}: builder returned ${res}`); bad++; continue; }
    for (const k of ['topY', 'roofY', 'anchorY']) {
      if (!Number.isFinite(res[k])) { console.log(`  !! ${name}#${i}: ${k}=${res[k]} (w=${w.toFixed(1)} d=${d.toFixed(1)} h=${h.toFixed(1)})`); bad++; }
    }
    const g = mb.build(name);
    const p = g.getAttribute('position');
    for (let j = 0; j < p.array.length; j++) {
      if (!Number.isFinite(p.array[j])) { console.log(`  !! ${name}#${i}: NaN vertex (w=${w.toFixed(1)} d=${d.toFixed(1)} h=${h.toFixed(1)})`); bad++; break; }
    }
  }
  total += bad;
  if (!bad) console.log(`  ${name}: clean (40 samples)`);
}
console.log(total ? `\nTOTAL PROBLEMS: ${total}` : '\nALL GEOMETRY FINITE');

