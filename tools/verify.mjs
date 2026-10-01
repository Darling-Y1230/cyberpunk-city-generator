// tools/verify.mjs — real-time headless verification over the Chrome DevTools
// Protocol. Virtual time is useless here: the generator is a long synchronous
// multi-stage pipeline, so a virtual clock races ahead to the next timer while
// the city is still being built. CDP lets us poll in real time, read console
// errors, drive the UI and capture frames.
//
// Usage: node tools/verify.mjs [--offline] [--seed=xxx] [--size=1024]
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import url from 'node:url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const SHOTS = path.join(ROOT, 'dist', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const hit = argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const SEED = arg('seed', '');
const SIZE = arg('size', '');
const TIMEOUT = parseInt(arg('timeout', '600'), 10) * 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = path.join(os.tmpdir(), 'cpk-cdp-' + Date.now());
// Default is the single file over file://, which is how most people will open
// it. --url= lets the same suite run against a real HTTP origin, which is how
// GitHub Pages serves it — a different code path for origin, MIME and caching.
const BASE = arg('url', '');
const pageUrl = (BASE || 'file:///' + path.join(ROOT, 'dist', 'cyberpunk-city.html').replace(/\\/g, '/'))
  + (SEED ? (BASE.includes('?') ? '&' : '?') + 'seed=' + SEED : '')
  + (SIZE ? (BASE.includes('?') || SEED ? '&' : '?') + 'size=' + SIZE : '');
console.log('  target:', pageUrl);

console.log('launching headless Edge…');
const child = spawn(EDGE, [
  '--headless=new',
  '--remote-debugging-port=' + PORT,
  '--user-data-dir=' + profile,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-sync',
  '--no-sandbox', '--disable-gpu-sandbox', '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
  '--window-size=1600,900',
  '--hide-scrollbars',
  'about:blank',
], { stdio: 'ignore', detached: false });

let ws = null;
let msgId = 0;
const pending = new Map();
const errors = [];
const logs = [];
// Every generation the harness observes is checked against this. Without it the
// script always exited 0 and "PASS" only described the twelve generator checks,
// so a page throwing exceptions would still look like a clean run.
const gate = [];
const checkRun = (label, input) => {
  // Callers pass either an already-parsed object (the default run) or a raw
  // JSON string (the stress and size-sweep evaluations).
  let o = input;
  if (typeof input === 'string') {
    try { o = JSON.parse(input); } catch { gate.push(`${label}: unreadable result`); return; }
  }
  if (!o || typeof o !== 'object') { gate.push(`${label}: no result`); return; }
  if (o.verdict && o.verdict !== 'PASS') gate.push(`${label}: verdict ${o.verdict}`);
  for (const c of o.checks || []) if (String(c).startsWith('FAIL')) gate.push(`${label}: ${c}`);
  for (const f of o.fails || []) gate.push(`${label}: check failed -> ${f}`);
  if (o.FAILED) gate.push(`${label}: ${o.FAILED}`);
  if (o.ERROR) gate.push(`${label}: ${o.ERROR}`);
};

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression, awaitPromise = false) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
  return r.result?.value;
}

/* ---------------- connect ---------------- */
let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(500);
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    target = list.find((t) => t.type === 'page');
  } catch { /* not up yet */ }
}
if (!target) { console.error('could not reach the debugging endpoint'); child.kill(); process.exit(1); }

ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    if (m.error) p.reject(new Error(JSON.stringify(m.error))); else p.resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text));
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    if (m.params.type === 'error' || m.params.type === 'warning') errors.push(m.params.type.toUpperCase() + ': ' + text);
    else logs.push(text);
  }
};

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable').catch(() => { });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });

// --offline=1 cuts the network before navigation. If the city still builds,
// the single file genuinely has no external dependency.
if (arg('offline', '0') === '1') {
  await send('Network.enable');
  await send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
  console.log('network emulation: OFFLINE');
}

console.log('navigating to the city…');
await send('Page.navigate', { url: pageUrl });

/* ---------------- wait for generation ---------------- */
const t0 = Date.now();
let ok = false;
let failed = null;
let lastStep = '';
while (Date.now() - t0 < TIMEOUT) {
  await sleep(1200);
  try {
    const s = await evaluate(`(()=>{const c=window.__CITY;
      const a=document.querySelector('.loader-step.active .step-t');
      return JSON.stringify({world: !!(c&&c.world), step: a?a.textContent:'(none)',
        status:(document.querySelector('.loader-status')||{}).textContent||'', err:(window.__ERR||[]).slice(-3)});})()`);
    const o = JSON.parse(s);
    if (o.step !== lastStep) { lastStep = o.step; console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)}s] ${o.step} — ${o.status}`); }
    if (o.world) { ok = true; break; }
    if (/生成失败|failed/i.test(o.status || '')) { failed = o.status; break; }
    if (o.err && o.err.length) { failed = o.err.join(' | '); break; }
  } catch (e) { /* page still parsing */ }
}

if (failed) {
  console.error('\n!! GENERATION FAILED: ' + failed);
  console.error('   last stage: ' + lastStep);
  console.error('   console errors:\n' + (errors.join('\n') || '(none captured)'));
  try { ws.close(); } catch { }
  child.kill();
  process.exit(2);
}
if (!ok) {
  console.error('\n!! generation did not finish within ' + (TIMEOUT / 1000) + 's');
  console.error('   last stage: ' + lastStep);
}
const genSeconds = ((Date.now() - t0) / 1000).toFixed(1);

/* ---------------- read state ---------------- */
const stateExpr = `(()=>{const c=window.__CITY;if(!c||!c.world)return JSON.stringify({FAILED:'no world'});
  const r=c.world.report, s=r.summary, inf=c.engine.renderer.info;
  const b=c.world.buildings,p=c.world.plan,rd=c.world.roads;
  let maxH=0,maxHn='';for(const x of b.list)if(x.height>maxH){maxH=x.height;maxHn=x.districtId;}
  return JSON.stringify({
    name:c.cityName, seed:c.seed, size:c.cfg.world.mapSize, verdict:r.verdict,
    timings:c.lastTimings,
    summary:s,
    checks:r.checks.map(x=>(x.ok?'OK  ':'FAIL')+' '+x.id+' = '+x.value+'   target '+x.target),
    districts:r.districtAreas,
    drawCalls:inf.render.calls, triangles:inf.render.triangles,
    programs:inf.programs.length, geometries:inf.memory.geometries, textures:inf.memory.textures,
    integrity:{maxBuildingHeight:Math.round(maxH),maxBuildingDistrict:maxHn,
      buildings:b.list.length, roadCells:rd.roadCells, roadComponents:rd.components.length,
      sidewalkCells:rd.sidewalkCells,
      districtsOnGround:new Set(p.district).size, mapSize:p.size, buildDiag:b.diag},
    crowd:{total:c.world.crowd.total, paths:c.world.crowd.rows, near:c.world.crowd.nearCount},
    transit:{viaducts:c.world.transit.viaducts.length, maglev:c.world.transit.maglev.lines.length,
      stations:c.world.transit.maglev.stations.length, skybridges:c.world.transit.skybridges.length,
      taxiPaths:c.world.transit.taxiPaths.length, dronePaths:c.world.transit.dronePaths.length},
    vertical:{skyPlatforms:c.world.vertical.sky.platforms.length, skyLinks:c.world.vertical.sky.links.length,
      underRooms:c.world.vertical.underground.rooms.length, shafts:c.world.vertical.underground.shafts.length},
    corporations:c.world.buildings.corporations.map(k=>k.name+' @ '+k.x.toFixed(0)+','+k.z.toFixed(0)),
    ads:c.world.ads.counts, props:c.world.details.propCounts,
    selfContained:{
      externalResources: performance.getEntriesByType('resource').map(r=>r.name),
      capability: c.capability && c.capability.diag,
      hdr: c.hdr, quality: c.engine.quality,
      webgl: (()=>{ const gl=c.engine.renderer.getContext();
        const d=gl.getExtension('WEBGL_debug_renderer_info');
        return { version: gl.getParameter(gl.VERSION),
                 renderer: d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) }; })(),
    },
  });})()`;

let state = null;
try { state = JSON.parse(await evaluate(stateExpr)); } catch (e) { state = { ERROR: String(e) }; }

/* ---------------- screenshots ---------------- */
const SHOT_LIST = [
  ['01-topdown', `__CITY.rig.setMode('topdown');__CITY.rig.td.dist=Math.min(1250,__CITY.world.plan.Rc*2.1);__CITY.rig.td.elev=0.98;__CITY.rig.td.pan.set(0,0,0);__CITY.rig.td.yaw=-0.78;`],
  ['02-aerial-fly', `__CITY.setFlag('holograms',true);__CITY.rig.setMode('fly');__CITY.rig.position.set(__CITY.world.plan.Rc*0.95,180,__CITY.world.plan.Rc*0.95);__CITY.lookAt(0,170,0);`],
  ['03-street-rain', `__CITY.rig.setMode('fly');__CITY.rig.position.set(60,5.5,-40);__CITY.lookAt(320,26,120);`],
  ['04-skylines', `__CITY.rig.setMode('fly');__CITY.rig.position.set(-__CITY.world.plan.Rc*1.05,240,__CITY.world.plan.Rc*1.05);__CITY.lookAt(0,180,0);`],
  ['05-above-clouds', `__CITY.rig.setMode('fly');__CITY.rig.position.set(0,520,240);__CITY.lookAt(0,120,-200);`],
  ['06-daylight', `__CITY.daynight.setTime(12.0);__CITY.weatherObj.locked=true;__CITY.weatherObj.set('overcast',true);__CITY.rig.setMode('fly');__CITY.rig.position.set(__CITY.world.plan.Rc*0.9,190,__CITY.world.plan.Rc*0.9);__CITY.lookAt(0,140,0);`],
  ['07-nightlife', `__CITY.daynight.setTime(23.2);__CITY.weatherObj.set('fog',true);__CITY.rig.setMode('fly');__CITY.rig.position.set(30,9,20);__CITY.lookAt(240,34,180);`],
  ['08-panorama', `__CITY.daynight.setTime(21.5);__CITY.weatherObj.set('storm',true);__CITY.rig.setMode('fly');__CITY.rig.position.set(__CITY.world.plan.Rc*1.4,420,__CITY.world.plan.Rc*0.5);__CITY.lookAt(0,90,0);`],
  ['09-underground', `__CITY.daynight.setTime(22.5);__CITY.weatherObj.set('overcast',true);__CITY.gotoSubnet();`],
];

for (const [name, script] of SHOT_LIST) {
  try {
    await evaluate(script);
    await evaluate(`__CITY.__shotFrames=0`);
    await sleep(2200);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(SHOTS, name + '.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`  shot ${name}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`  shot ${name} FAILED: ${e.message}`);
  }
}

/* ---------------- clean, HUD-free art shots (README / social preview) ------- */
if (arg('clean', '0') === '1') try {
  const CLEAN = [
    // [name, viewport w, h, camera script]
    ['clean-hero-2x1', 1920, 960, `__CITY.rig.setMode('fly');__CITY.rig.position.set(-__CITY.world.plan.Rc*1.02,235,__CITY.world.plan.Rc*1.02);__CITY.lookAt(0,175,0);`],
    ['clean-street', 1920, 1080, `__CITY.rig.setMode('fly');__CITY.rig.position.set(60,5.5,-40);__CITY.lookAt(320,26,120);`],
    ['clean-plan', 1920, 1080, `__CITY.rig.setMode('topdown');__CITY.rig.td.dist=Math.min(1250,__CITY.world.plan.Rc*2.1);__CITY.rig.td.elev=0.98;__CITY.rig.td.pan.set(0,0,0);__CITY.rig.td.yaw=-0.78;`],
    ['clean-aerial', 1920, 1080, `__CITY.rig.setMode('fly');__CITY.rig.position.set(__CITY.world.plan.Rc*0.95,180,__CITY.world.plan.Rc*0.95);__CITY.lookAt(0,170,0);`],
    ['clean-subnet', 1920, 1080, `__CITY.daynight.setTime(22.5);__CITY.weatherObj.set('overcast',true);__CITY.gotoSubnet();`],
  ];
  await evaluate(`(()=>{document.getElementById('hud').style.display='none';return 1})()`);
  for (const [name, w, h, script] of CLEAN) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await evaluate(script);
    await sleep(2400);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(SHOTS, name + '.png');
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`  clean ${name}  ${w}x${h}  ${(fs.statSync(file).size / 1024).toFixed(0)} KB`);
  }
  await evaluate(`(()=>{document.getElementById('hud').style.display='';return 1})()`);
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
} catch (e) { console.log('  clean shots failed: ' + e.message); }

/* ---------------- a stress frame: 50 000 agents ---------------- */
if (arg('stress', '1') === '1') try {
  await evaluate(`__CITY.cfg.npc.count=50000;__CITY.regenerate({npc:50000})`);
  const t1 = Date.now();
  let done = false;
  while (Date.now() - t1 < 420000) {
    await sleep(2000);
    const w = await evaluate(`!!(window.__CITY.world && window.__CITY.world.crowd.total===50000 && document.querySelector('.loader').classList.contains('gone'))`);
    if (w) { done = true; break; }
  }
  await sleep(3000);
  const st2 = await evaluate(`(()=>{const i=window.__CITY.engine.renderer.info;return JSON.stringify({
    gen:window.__CITY.lastTimings, npc:window.__CITY.world.crowd.total,
    calls:i.render.calls, tris:i.render.triangles, verdict:window.__CITY.world.report.verdict});})()`);
  checkRun('50k stress' + (done ? '' : ' [timed out]'), st2);
  console.log('  50k stress: ' + (done ? 'completed' : 'TIMED OUT') + ' — ' + st2);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, '06-50k-agents.png'), Buffer.from(shot.data, 'base64'));
} catch (e) { console.log('  50k stress failed: ' + e.message); }

/* ---------------- second seed + every map size ---------------- */
if (arg('seed2', '1') === '1') try {
  const results = [];
  for (const [label, size, seed] of [['512', '512', 'alpha-9'], ['1024', '1024', 'bravo-7'], ['2048', '2048', 'charlie-4']]) {
    await evaluate(`__CITY.cfg.npc.count=9000;__CITY.regenerate({seed:'${seed}',size:${size}})`);
    const t2 = Date.now();
    let done = false;
    while (Date.now() - t2 < 400000) {
      await sleep(2000);
      const w = await evaluate(`!!(window.__CITY.world && window.__CITY.seed==='${seed}' && document.querySelector('.loader').classList.contains('gone'))`);
      if (w) { done = true; break; }
    }
    if (!done) { gate.push(`size sweep ${size}: timed out`); results.push(`${size}: TIMED OUT`); continue; }
    await sleep(2500);
    const v = await evaluate(`(()=>{const c=window.__CITY,r=c.world.report,s=r.summary,i=c.engine.renderer.info;
      return JSON.stringify({size:c.cfg.world.mapSize,verdict:r.verdict,ms:Math.round(Object.values(c.lastTimings).reduce((a,b)=>a+b,0)),
        buildings:s.buildings,signs:s.signs,props:s.props,npc:s.npc,neon:s.neonSources,cables:s.cables,
        calls:i.render.calls,tris:i.render.triangles,fails:r.checks.filter(x=>!x.ok).map(x=>x.id+':'+x.value)});})()`);
    checkRun('size sweep', v);
    results.push(v);
    await sleep(600);
    await evaluate(`__CITY.rig.setMode('topdown');__CITY.rig.td.dist=__CITY.world.plan.Rc*2.1;__CITY.rig.td.elev=0.98;__CITY.rig.td.pan.set(0,0,0);__CITY.rig.td.yaw=-0.78;`);
    await sleep(1800);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, `size-${label}.png`), Buffer.from(shot.data, 'base64'));
  }
  console.log('  size sweep:');
  for (const r of results) console.log('    ' + r);
} catch (e) { console.log('  size sweep failed: ' + e.message); }

/* ---------------- report ---------------- */
console.log('\n================ GENERATION ================');
console.log('wall clock: ' + genSeconds + ' s');
console.log(JSON.stringify(state, null, 1));
checkRun('default', state);

console.log('\n================ CONSOLE ERRORS ================');
console.log(errors.length ? errors.slice(0, 3).join('\n---\n') : 'NONE');
if (errors.length > 3) console.log(`... and ${errors.length - 3} more`);

console.log('\n================ CONSOLE LOG ================');
console.log(logs.slice(-12).join('\n'));

/* ---------------- verdict ---------------- */
// The exit code is the point: this is only useful as a gate if a broken run
// fails. Console noise counts, because the brief is a clean console.
const problems = [...gate, ...errors.map((e) => 'console: ' + e)];
console.log('\n================ RESULT ================');
if (problems.length) {
  console.log(`FAIL — ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 10)) console.log('  x ' + p);
  if (problems.length > 10) console.log(`  ... and ${problems.length - 10} more`);
} else {
  console.log('PASS — every generation check passed, no console errors.');
}

try { ws.close(); } catch { }
child.kill();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }
console.log('\nDONE');
process.exit(problems.length ? 1 : 0);
